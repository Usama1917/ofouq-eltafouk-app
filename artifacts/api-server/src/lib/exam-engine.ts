// v2 Phase 2 — chapter-exam engine: student-question stats, the difficulty-weighted
// student LEVEL per subject, and (later stages) the mistakes pool + adaptive sampling.
//
// Everything keys off `student_question_stats`, one row per (student, question):
//   • firstAttemptCorrect — set once on the FIRST answer (drives level + mistakes)
//   • everCorrect         — true once ever answered right (a mistake leaves the pool
//                            when this flips true = "mastered")
// Recorded on every quiz/exam submit via recordQuestionStats().

import {
  db,
  studentQuestionStatsTable,
  videoQuestionsTable,
  unitExamQuestionsTable,
  videosTable,
  lessonsTable,
  unitsTable,
  subjectsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

// Fisher–Yates shuffle (server-side; Math.random is fine here).
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Difficulty → weight for the level score. Getting a HARD question right on the first
// try counts 3×; easy 1×. So a student who nails the hard questions reads as advanced.
export const DIFFICULTY_WEIGHT: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

export function normalizeDifficulty(value: unknown): "easy" | "medium" | "hard" {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "easy" || v === "hard" ? v : "medium";
}

// A SQL fragment for a row's difficulty weight, reused in the aggregate below.
const WEIGHT_SQL = sql<number>`(case ${studentQuestionStatsTable.difficulty} when 'hard' then 3 when 'easy' then 1 else 2 end)`;

// ── Student level (per subject) ───────────────────────────────────────────────
export type StudentLevel = "beginner" | "intermediate" | "advanced" | "unrated";

// Below this many answered questions the level is "still forming" (unrated) — a
// couple of answers isn't a fair read.
export const LEVEL_MIN_ANSWERED = 5;
// Balanced bands (confirmed with the owner): <50% beginner · 50–80% intermediate · >80% advanced.
export const LEVEL_THRESHOLDS = { intermediate: 0.5, advanced: 0.8 } as const;

export function levelFromRatio(weightedRatio: number, answered: number): StudentLevel {
  if (answered < LEVEL_MIN_ANSWERED) return "unrated";
  if (weightedRatio >= LEVEL_THRESHOLDS.advanced) return "advanced";
  if (weightedRatio >= LEVEL_THRESHOLDS.intermediate) return "intermediate";
  return "beginner";
}

export type SubjectLevel = {
  subjectId: number;
  level: StudentLevel;
  percent: number; // weighted first-attempt correctness, 0–100
  answered: number;
};

// One student's level across ALL their subjects (weighted, first-attempt), in one query.
export async function getStudentLevels(studentId: number): Promise<SubjectLevel[]> {
  const rows = await db
    .select({
      subjectId: studentQuestionStatsTable.subjectId,
      weightSum: sql<number>`sum(${WEIGHT_SQL})`,
      correctWeight: sql<number>`sum(case when ${studentQuestionStatsTable.firstAttemptCorrect} then ${WEIGHT_SQL} else 0 end)`,
      answered: sql<number>`count(*)`,
    })
    .from(studentQuestionStatsTable)
    .where(eq(studentQuestionStatsTable.studentId, studentId))
    .groupBy(studentQuestionStatsTable.subjectId);

  return rows.map((r) => {
    const weightSum = Number(r.weightSum) || 0;
    const correctWeight = Number(r.correctWeight) || 0;
    const answered = Number(r.answered) || 0;
    const ratio = weightSum > 0 ? correctWeight / weightSum : 0;
    return { subjectId: r.subjectId, level: levelFromRatio(ratio, answered), percent: Math.round(ratio * 100), answered };
  });
}

// One student's level in ONE subject (used for adaptive-exam sampling).
export async function getStudentSubjectLevel(studentId: number, subjectId: number): Promise<SubjectLevel> {
  const [row] = await db
    .select({
      weightSum: sql<number>`sum(${WEIGHT_SQL})`,
      correctWeight: sql<number>`sum(case when ${studentQuestionStatsTable.firstAttemptCorrect} then ${WEIGHT_SQL} else 0 end)`,
      answered: sql<number>`count(*)`,
    })
    .from(studentQuestionStatsTable)
    .where(and(eq(studentQuestionStatsTable.studentId, studentId), eq(studentQuestionStatsTable.subjectId, subjectId)));

  const weightSum = Number(row?.weightSum) || 0;
  const correctWeight = Number(row?.correctWeight) || 0;
  const answered = Number(row?.answered) || 0;
  const ratio = weightSum > 0 ? correctWeight / weightSum : 0;
  return { subjectId, level: levelFromRatio(ratio, answered), percent: Math.round(ratio * 100), answered };
}

// Levels for MANY students in one subject (admin dashboard), keyed by studentId.
export async function getSubjectLevelsByStudent(subjectId: number): Promise<Map<number, SubjectLevel>> {
  const rows = await db
    .select({
      studentId: studentQuestionStatsTable.studentId,
      weightSum: sql<number>`sum(${WEIGHT_SQL})`,
      correctWeight: sql<number>`sum(case when ${studentQuestionStatsTable.firstAttemptCorrect} then ${WEIGHT_SQL} else 0 end)`,
      answered: sql<number>`count(*)`,
    })
    .from(studentQuestionStatsTable)
    .where(eq(studentQuestionStatsTable.subjectId, subjectId))
    .groupBy(studentQuestionStatsTable.studentId);

  const map = new Map<number, SubjectLevel>();
  for (const r of rows) {
    const weightSum = Number(r.weightSum) || 0;
    const correctWeight = Number(r.correctWeight) || 0;
    const answered = Number(r.answered) || 0;
    const ratio = weightSum > 0 ? correctWeight / weightSum : 0;
    map.set(r.studentId, { subjectId, level: levelFromRatio(ratio, answered), percent: Math.round(ratio * 100), answered });
  }
  return map;
}

// ── Recording answers into the stats engine ──────────────────────────────────
export type AnsweredQuestion = { questionId: number; difficulty: string; isCorrect: boolean };

// Resolve the subject + unit a VIDEO belongs to (for tagging lesson-quiz stats).
export async function getVideoSubjectUnit(videoId: number): Promise<{ subjectId: number; unitId: number } | null> {
  const [row] = await db
    .select({ subjectId: subjectsTable.id, unitId: unitsTable.id })
    .from(videosTable)
    .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .where(eq(videosTable.id, videoId))
    .limit(1);
  return row ?? null;
}

// Fold a batch of graded answers into student_question_stats. firstAttemptCorrect is
// set ONLY on the first insert (immutable); everCorrect ORs in later correct answers.
// The caller must pass answers with UNIQUE questionIds (one submit never repeats a Q).
export async function recordQuestionStats(params: {
  studentId: number;
  subjectId: number;
  unitId: number;
  source: "lesson" | "unit";
  answers: AnsweredQuestion[];
}): Promise<void> {
  const { studentId, subjectId, unitId, source, answers } = params;
  if (answers.length === 0) return;
  const now = new Date();

  await db
    .insert(studentQuestionStatsTable)
    .values(
      answers.map((a) => ({
        studentId,
        questionId: a.questionId,
        source,
        subjectId,
        unitId,
        difficulty: normalizeDifficulty(a.difficulty),
        firstAttemptCorrect: a.isCorrect,
        everCorrect: a.isCorrect,
        attempts: 1,
        lastAnsweredAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [studentQuestionStatsTable.studentId, studentQuestionStatsTable.source, studentQuestionStatsTable.questionId],
      set: {
        // firstAttemptCorrect is intentionally NOT updated — the first answer stands.
        everCorrect: sql`${studentQuestionStatsTable.everCorrect} or excluded.ever_correct`,
        attempts: sql`${studentQuestionStatsTable.attempts} + 1`,
        lastAnsweredAt: now,
      },
    });
}

// ── Exam A: mistakes-review pool ──────────────────────────────────────────────
// All PUBLISHED lesson quiz questions in a chapter (unit). Difficulty ordering
// hard→medium→easy is used when filling the review up to the 75% floor.
const DIFFICULTY_ORDER: Record<string, number> = { hard: 0, medium: 1, easy: 2 };

export type ChapterQuestion = { id: number; difficulty: string };

export async function getChapterLessonQuestions(unitId: number): Promise<ChapterQuestion[]> {
  return db
    .select({ id: videoQuestionsTable.id, difficulty: videoQuestionsTable.difficulty })
    .from(videoQuestionsTable)
    .innerJoin(lessonsTable, eq(lessonsTable.videoId, videoQuestionsTable.videoId))
    .where(and(eq(lessonsTable.unitId, unitId), eq(lessonsTable.isPublished, true), eq(videoQuestionsTable.isPublished, true)));
}

// Build the mistakes-review question-id list for a student in a chapter:
//   • start with the still-unmastered mistakes (first attempt wrong AND never since right)
//   • floor the size at 75% of the chapter's lesson questions
//   • if short, top up from the OTHER questions, hardest first (hard→medium→easy)
//   • if the mistakes already exceed 75%, keep them all (can go over 75%)
// Returns the chosen question ids (order not important; caller shuffles).
export async function buildMistakesReview(
  studentId: number,
  unitId: number,
): Promise<{ questionIds: number[]; totalChapterQuestions: number; mistakeCount: number; floor: number }> {
  const chapter = await getChapterLessonQuestions(unitId);
  const total = chapter.length;
  if (total === 0) return { questionIds: [], totalChapterQuestions: 0, mistakeCount: 0, floor: 0 };

  const ids = chapter.map((q) => q.id);
  // Which of these are still-unmastered mistakes for this student.
  const mistakeRows = await db
    .select({ questionId: studentQuestionStatsTable.questionId })
    .from(studentQuestionStatsTable)
    .where(
      and(
        eq(studentQuestionStatsTable.studentId, studentId),
        eq(studentQuestionStatsTable.source, "lesson"),
        eq(studentQuestionStatsTable.firstAttemptCorrect, false),
        eq(studentQuestionStatsTable.everCorrect, false),
        inArray(studentQuestionStatsTable.questionId, ids),
      ),
    );
  const mistakeSet = new Set(mistakeRows.map((r) => r.questionId));

  const floor = Math.min(total, Math.ceil(total * 0.75));
  const mistakes = chapter.filter((q) => mistakeSet.has(q.id));

  let chosen: ChapterQuestion[];
  if (mistakes.length >= floor) {
    chosen = mistakes; // already meets/exceeds the floor — keep them all
  } else {
    // Top up from non-mistakes, hardest first, to reach the floor.
    const fillers = chapter
      .filter((q) => !mistakeSet.has(q.id))
      .sort((a, b) => (DIFFICULTY_ORDER[a.difficulty] ?? 1) - (DIFFICULTY_ORDER[b.difficulty] ?? 1));
    chosen = [...mistakes, ...fillers.slice(0, floor - mistakes.length)];
  }

  return {
    questionIds: chosen.map((q) => q.id),
    totalChapterQuestions: total,
    mistakeCount: mistakes.length,
    floor,
  };
}

// ── Exam B: adaptive sampling by level ────────────────────────────────────────
// Difficulty mix per level (confirmed with the owner): fractions of the served count.
export const ADAPTIVE_MIX: Record<Exclude<StudentLevel, "unrated"> | "unrated", { hard: number; medium: number; easy: number }> = {
  advanced: { hard: 0.7, medium: 0.3, easy: 0 },
  intermediate: { hard: 0.25, medium: 0.5, easy: 0.25 },
  beginner: { hard: 0.1, medium: 0.3, easy: 0.6 },
  // No rating yet → treat like intermediate (balanced) until we know the student.
  unrated: { hard: 0.25, medium: 0.5, easy: 0.25 },
};

// Pick `count` question ids from a difficulty-bucketed bank, weighted to the level.
// If a bucket is short, the shortfall spills over to the other buckets so we still
// hit `count` whenever the bank has enough questions overall.
export function pickAdaptiveIds(
  bank: { hard: number[]; medium: number[]; easy: number[] },
  level: StudentLevel,
  count: number,
): number[] {
  const mix = ADAPTIVE_MIX[level];
  const pools = {
    hard: shuffle(bank.hard),
    medium: shuffle(bank.medium),
    easy: shuffle(bank.easy),
  };
  const totalAvailable = pools.hard.length + pools.medium.length + pools.easy.length;
  const target = Math.min(count, totalAvailable);

  const order: Array<keyof typeof pools> = ["hard", "medium", "easy"];
  const want: Record<string, number> = {
    hard: Math.round(target * mix.hard),
    medium: Math.round(target * mix.medium),
    easy: Math.round(target * mix.easy),
  };

  const chosen: number[] = [];
  // First pass: take up to the desired amount from each bucket.
  for (const d of order) {
    const take = Math.min(want[d], pools[d].length);
    chosen.push(...pools[d].splice(0, take));
  }
  // Second pass: fill any remaining slots from whatever is left (hardest first).
  for (const d of order) {
    if (chosen.length >= target) break;
    const need = target - chosen.length;
    chosen.push(...pools[d].splice(0, need));
  }
  return shuffle(chosen).slice(0, target);
}

// Load the unit-exam bank ids bucketed by difficulty (published only).
export async function getUnitExamBankByDifficulty(unitId: number): Promise<{ hard: number[]; medium: number[]; easy: number[] }> {
  const rows = await db
    .select({ id: unitExamQuestionsTable.id, difficulty: unitExamQuestionsTable.difficulty })
    .from(unitExamQuestionsTable)
    .where(and(eq(unitExamQuestionsTable.unitId, unitId), eq(unitExamQuestionsTable.isPublished, true)));
  const bank = { hard: [] as number[], medium: [] as number[], easy: [] as number[] };
  for (const r of rows) bank[normalizeDifficulty(r.difficulty)].push(r.id);
  return bank;
}

// Resolve the subject a UNIT belongs to (for level lookup + tagging unit-exam stats).
export async function getUnitSubjectId(unitId: number): Promise<number | null> {
  const [row] = await db
    .select({ subjectId: subjectsTable.id })
    .from(unitsTable)
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .where(eq(unitsTable.id, unitId))
    .limit(1);
  return row?.subjectId ?? null;
}
