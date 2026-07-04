import { pgTable, serial, integer, boolean, text, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { unitsTable, subjectsTable } from "./academic";
import type { QuizTable, QuizOptionContent } from "./quiz";

// ── v2 Phase 2 — Chapter (unit) exams ─────────────────────────────────────────
// Each chapter (unit) can have an end-of-chapter exam CARD holding TWO exams:
//   A) "راجع أخطاءك" (mistakes review) — drawn from the chapter's LESSON quiz
//      questions the student got wrong on their FIRST attempt and hasn't mastered.
//      Instant-feedback practice, no timer.
//   B) "امتحان الفصل" (adaptive formal exam) — drawn from this table's own bank,
//      a difficulty-weighted random sample sized to the student's LEVEL, timed,
//      results shown at the end.
// The card is gated: only visible once the admin PUBLISHES the exam for the unit.

// Per-unit exam configuration + the admin open/close gate.
export const unitExamsTable = pgTable(
  "unit_exams",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    // Admin gate: the chapter-exam card only shows to students when this is true.
    isPublished: boolean("is_published").notNull().default(false),
    // How many questions the ADAPTIVE exam (B) serves per attempt (sampled from the
    // bank below, weighted by the student's level). Null = serve the whole bank.
    adaptiveCount: integer("adaptive_count"),
    // Timer for the adaptive formal exam, in minutes. 0/null = no timer.
    timerMinutes: integer("timer_minutes").notNull().default(0),
    // Points value of a full (100%) score on the chapter exam — bigger than a lesson
    // quiz; credited on the first attempt only, as a percentage of this max.
    points: integer("points").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unitUnique: unique("unit_exams_unit_uniq").on(table.unitId),
  }),
);

// Dedicated question bank for the ADAPTIVE chapter exam (B). Same content shape as
// video_questions, but scoped to a UNIT and with `difficulty` front-and-centre (the
// admin fills e.g. 30 easy / 30 medium / 30 hard, and each student is served a mix
// weighted to their level).
export const unitExamQuestionsTable = pgTable(
  "unit_exam_questions",
  {
    id: serial("id").primaryKey(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    imageUrl: text("image_url"),
    table: jsonb("table").$type<QuizTable | null>(),
    options: jsonb("options").$type<QuizOptionContent[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    explanation: text("explanation"),
    // "easy" | "medium" | "hard" — REQUIRED here; it drives the adaptive sampling.
    difficulty: text("difficulty").notNull().default("medium"),
    orderIndex: integer("order_index").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unitIdx: index("unit_exam_questions_unit_idx").on(table.unitId),
  }),
);

// One row per submitted chapter-exam attempt (either exam type).
export const unitExamAttemptsTable = pgTable(
  "unit_exam_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    // "review" (exam A) | "adaptive" (exam B).
    examType: text("exam_type").notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    percent: integer("percent").notNull(),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUnitIdx: index("unit_exam_attempts_user_unit_idx").on(table.userId, table.unitId),
  }),
);

// Per-question answers within a chapter-exam attempt. `questionSource` disambiguates
// which bank `questionId` points at — the mistakes exam (A) pulls LESSON questions,
// the adaptive exam (B) pulls UNIT-exam questions.
export const unitExamAnswersTable = pgTable(
  "unit_exam_attempt_answers",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => unitExamAttemptsTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id").notNull(),
    // "lesson" (video_questions) | "unit" (unit_exam_questions).
    questionSource: text("question_source").notNull(),
    chosenIndex: integer("chosen_index"),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => ({
    attemptIdx: index("unit_exam_answers_attempt_idx").on(table.attemptId),
  }),
);

// The ENGINE behind the student level + the mistakes pool. One row per
// (student, question) across BOTH banks. Written on every answer:
//   • firstAttemptCorrect — set once, on the student's FIRST-ever answer to the
//     question (immutable). Drives the level (difficulty-weighted % first-correct)
//     and the mistakes pool (first attempt wrong).
//   • everCorrect — true once the question has ever been answered correctly. A
//     mistake leaves the review pool the moment everCorrect flips true (mastered).
// subjectId / unitId / difficulty are denormalised so the level (per subject) and
// the mistakes pool (per chapter) aggregate without extra joins — and so the admin
// dashboard can read every student's level cheaply.
export const studentQuestionStatsTable = pgTable(
  "student_question_stats",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id").notNull(),
    // "lesson" | "unit" — which bank questionId belongs to (ids can collide across banks).
    source: text("source").notNull(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjectsTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    difficulty: text("difficulty").notNull().default("medium"),
    firstAttemptCorrect: boolean("first_attempt_correct").notNull(),
    everCorrect: boolean("ever_correct").notNull(),
    attempts: integer("attempts").notNull().default(1),
    lastAnsweredAt: timestamp("last_answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One stat per (student, bank, question).
    studentQuestionUnique: unique("student_question_stats_uniq").on(table.studentId, table.source, table.questionId),
    // Level aggregation: WHERE student_id = ? AND subject_id = ?.
    studentSubjectIdx: index("student_question_stats_student_subject_idx").on(table.studentId, table.subjectId),
    // Mistakes pool: WHERE student_id = ? AND unit_id = ? AND source = 'lesson'.
    studentUnitIdx: index("student_question_stats_student_unit_idx").on(table.studentId, table.unitId),
  }),
);

export type UnitExam = typeof unitExamsTable.$inferSelect;
export type UnitExamQuestion = typeof unitExamQuestionsTable.$inferSelect;
export type UnitExamAttempt = typeof unitExamAttemptsTable.$inferSelect;
export type StudentQuestionStat = typeof studentQuestionStatsTable.$inferSelect;

// Difficulty is a shared vocabulary across lesson + unit questions and the level engine.
export const EXAM_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type ExamDifficulty = (typeof EXAM_DIFFICULTIES)[number];
export const examDifficultySchema = z.enum(EXAM_DIFFICULTIES);
