import { Router, type IRouter } from "express";
import {
  db,
  unitExamsTable,
  unitExamQuestionsTable,
  unitExamAttemptsTable,
  unitExamAnswersTable,
  videoQuestionsTable,
  lessonsTable,
  type QuizTable,
  type QuizOptionContent,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { POINTS, recordExamActivity } from "../lib/gamification";
import {
  getSessionUser,
  isPrivileged,
  requireAdmin,
  userHasSubjectAccess,
  parseId,
  toStudentOptions,
  normalizeQuestionInput,
} from "./quiz";
import {
  buildMistakesReview,
  getChapterLessonQuestions,
  getUnitExamBankByDifficulty,
  pickAdaptiveIds,
  getStudentSubjectLevel,
  getUnitSubjectId,
  getStudentLevels,
  recordQuestionStats,
} from "../lib/exam-engine";

const router: IRouter = Router();

// v2 Phase 2 — Chapter (unit) exams. Two exams per chapter, on ONE card:
//   • review   (exam A) — the student's still-unmastered mistakes from the chapter's
//                lesson quizzes, floored at 75%; instant feedback, no timer.
//   • adaptive (exam B) — a difficulty-weighted random sample from the chapter's own
//                bank, sized to the student's level; timed, results at the end.
// The card is admin-gated (unit_exams.is_published) per chapter.

const MAX_QUESTIONS = 500;

// Resolve access for a STUDENT: they need an active subscription to the chapter's
// subject AND the requested exam must be published. Each exam opens independently, so
// `examType` says which flag to check — omit it for card-level access (either exam
// published is enough). Admins/owners bypass both. Returns the subjectId + the exam's
// per-exam publish flags when allowed, or an { error, status } to send.
async function resolveUnitAccess(
  req: any,
  unitId: number,
  examType?: "review" | "adaptive",
): Promise<
  | { ok: true; userId: number; subjectId: number; privileged: boolean; reviewPublished: boolean; adaptivePublished: boolean }
  | { ok: false; status: number; error: string }
> {
  const user = await getSessionUser(req);
  if (!user) return { ok: false, status: 401, error: "يجب تسجيل الدخول أولًا" };

  const subjectId = await getUnitSubjectId(unitId);
  if (subjectId == null) return { ok: false, status: 404, error: "الفصل غير موجود" };

  const [exam] = await db
    .select({ reviewPublished: unitExamsTable.reviewPublished, adaptivePublished: unitExamsTable.adaptivePublished })
    .from(unitExamsTable)
    .where(eq(unitExamsTable.unitId, unitId))
    .limit(1);
  const reviewPublished = Boolean(exam?.reviewPublished);
  const adaptivePublished = Boolean(exam?.adaptivePublished);

  const privileged = isPrivileged(user);
  if (privileged) return { ok: true, userId: user.id, subjectId, privileged, reviewPublished, adaptivePublished };

  // Which flag gates this request: a specific exam, or "either" for the card itself.
  const published =
    examType === "review" ? reviewPublished : examType === "adaptive" ? adaptivePublished : reviewPublished || adaptivePublished;
  if (!published) {
    const label = examType === "review" ? "امتحان الاستدراك" : "تحديك الخاص";
    return { ok: false, status: 403, error: `${label} مش متاح دلوقتي.` };
  }

  const hasAccess = await userHasSubjectAccess(user.id, subjectId);
  if (!hasAccess) return { ok: false, status: 403, error: "امتحان الفصل متاح للمشتركين في المادة فقط." };

  return { ok: true, userId: user.id, subjectId, privileged, reviewPublished, adaptivePublished };
}

// ───────────────────────────── Admin: manage a chapter exam ─────────────────────

router.get("/admin/units/:unitId/exam", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });

    const [exam] = await db.select().from(unitExamsTable).where(eq(unitExamsTable.unitId, unitId)).limit(1);
    const questions = await db
      .select()
      .from(unitExamQuestionsTable)
      .where(eq(unitExamQuestionsTable.unitId, unitId))
      .orderBy(asc(unitExamQuestionsTable.orderIndex), asc(unitExamQuestionsTable.id));

    const chapter = await getChapterLessonQuestions(unitId);

    return res.json({
      exam: exam ?? null,
      questions,
      // How many lesson quiz questions exist in this chapter (for the review's 75% math).
      chapterLessonQuestionCount: chapter.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load chapter exam (admin)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Save the chapter exam config + its adaptive question bank in one call.
router.put("/admin/units/:unitId/exam", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });

    // Config — each exam opens/closes independently.
    const reviewPublished = Boolean(req.body?.reviewPublished);
    const adaptivePublished = Boolean(req.body?.adaptivePublished);
    // Keep the legacy card-level flag consistent for any old reader (card shows if either).
    const isPublished = reviewPublished || adaptivePublished;
    const rawCount = req.body?.adaptiveCount;
    let adaptiveCount: number | null = null;
    if (rawCount != null && String(rawCount).trim() !== "") {
      const n = Number.parseInt(String(rawCount), 10);
      adaptiveCount = Number.isInteger(n) && n >= 1 ? n : null;
    }
    const rawTimer = Number.parseInt(String(req.body?.timerMinutes ?? "0"), 10);
    const timerMinutes = Number.isInteger(rawTimer) && rawTimer >= 0 ? Math.min(rawTimer, 600) : 0;
    const rawPoints = Number.parseInt(String(req.body?.points ?? "30"), 10);
    const points = Number.isInteger(rawPoints) && rawPoints >= 0 ? Math.min(rawPoints, 1000) : 30;
    const rawReviewPoints = Number.parseInt(String(req.body?.reviewPoints ?? "10"), 10);
    const reviewPoints = Number.isInteger(rawReviewPoints) && rawReviewPoints >= 0 ? Math.min(rawReviewPoints, 1000) : 10;

    const now = new Date();
    await db
      .insert(unitExamsTable)
      .values({ unitId, isPublished, reviewPublished, adaptivePublished, adaptiveCount, timerMinutes, points, reviewPoints, updatedAt: now })
      .onConflictDoUpdate({
        target: unitExamsTable.unitId,
        set: { isPublished, reviewPublished, adaptivePublished, adaptiveCount, timerMinutes, points, reviewPoints, updatedAt: now },
      });

    // Question bank — full sync (validate all before mutating).
    const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (rawQuestions.length > MAX_QUESTIONS) {
      return res.status(400).json({ error: `الحد الأقصى ${MAX_QUESTIONS} سؤال` });
    }
    const items: Array<{ id: number | null; data: ReturnType<typeof normalizeQuestionInput> }> = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      let data;
      try {
        data = normalizeQuestionInput(rawQuestions[i]);
      } catch (e: any) {
        return res.status(400).json({ error: `سؤال رقم ${i + 1}: ${e?.message ?? "بيانات غير صالحة"}` });
      }
      items.push({ id: parseId(rawQuestions[i]?.id), data: { ...data, orderIndex: i } });
    }

    const keepIds = items.map((it) => it.id).filter((v): v is number => v != null);
    if (keepIds.length > 0) {
      await db
        .delete(unitExamQuestionsTable)
        .where(and(eq(unitExamQuestionsTable.unitId, unitId), notInArray(unitExamQuestionsTable.id, keepIds)));
    } else {
      await db.delete(unitExamQuestionsTable).where(eq(unitExamQuestionsTable.unitId, unitId));
    }
    for (const it of items) {
      if (it.id != null) {
        await db
          .update(unitExamQuestionsTable)
          .set(it.data)
          .where(and(eq(unitExamQuestionsTable.id, it.id), eq(unitExamQuestionsTable.unitId, unitId)));
      } else {
        await db.insert(unitExamQuestionsTable).values({ unitId, ...it.data });
      }
    }

    const saved = await db
      .select()
      .from(unitExamQuestionsTable)
      .where(eq(unitExamQuestionsTable.unitId, unitId))
      .orderBy(asc(unitExamQuestionsTable.orderIndex), asc(unitExamQuestionsTable.id));

    return res.json({ count: saved.length, questions: saved, reviewPublished, adaptivePublished, adaptiveCount, timerMinutes, points, reviewPoints });
  } catch (err) {
    req.log.error({ err }, "Failed to save chapter exam (admin)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: a student's auto-computed level per subject (for the dashboard).
router.get("/admin/students/:studentId/subject-levels", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const studentId = parseId(req.params.studentId);
    if (!studentId) return res.status(400).json({ error: "معرف الطالب غير صالح" });
    const levels = await getStudentLevels(studentId);
    return res.json({ levels });
  } catch (err) {
    req.log.error({ err }, "Failed to load student levels (admin)");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ───────────────────────────── Student: take the chapter exams ──────────────────

// Card info: what's available for this chapter, plus last-attempt summaries.
router.get("/units/:unitId/exam/info", async (req, res) => {
  try {
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });

    const access = await resolveUnitAccess(req, unitId);
    if (!access.ok) {
      // For a not-yet-published exam we don't want a hard error on the card — return
      // a soft "not available" so the mobile just hides the card.
      if (access.status === 403) return res.json({ available: false });
      return res.status(access.status).json({ error: access.error });
    }

    const [exam] = await db.select().from(unitExamsTable).where(eq(unitExamsTable.unitId, unitId)).limit(1);
    const review = await buildMistakesReview(access.userId, unitId);
    const bank = await getUnitExamBankByDifficulty(unitId);
    const bankSize = bank.hard.length + bank.medium.length + bank.easy.length;

    const [lastReview] = await db
      .select({ percent: unitExamAttemptsTable.percent, createdAt: unitExamAttemptsTable.createdAt })
      .from(unitExamAttemptsTable)
      .where(
        and(
          eq(unitExamAttemptsTable.userId, access.userId),
          eq(unitExamAttemptsTable.unitId, unitId),
          eq(unitExamAttemptsTable.examType, "review"),
        ),
      )
      .orderBy(desc(unitExamAttemptsTable.createdAt))
      .limit(1);
    const [lastAdaptive] = await db
      .select({ percent: unitExamAttemptsTable.percent, createdAt: unitExamAttemptsTable.createdAt })
      .from(unitExamAttemptsTable)
      .where(
        and(
          eq(unitExamAttemptsTable.userId, access.userId),
          eq(unitExamAttemptsTable.unitId, unitId),
          eq(unitExamAttemptsTable.examType, "adaptive"),
        ),
      )
      .orderBy(desc(unitExamAttemptsTable.createdAt))
      .limit(1);

    const level = await getStudentSubjectLevel(access.userId, access.subjectId);

    // Each exam shows only if IT is open (admins bypass) AND it actually has content.
    const reviewOpen = access.privileged || access.reviewPublished;
    const adaptiveOpen = access.privileged || access.adaptivePublished;

    return res.json({
      available: true,
      timerMinutes: exam?.timerMinutes ?? 0,
      points: exam?.points ?? POINTS.quizFull,
      level: level.level,
      review: {
        available: reviewOpen && review.questionIds.length > 0,
        count: review.questionIds.length,
        mistakeCount: review.mistakeCount,
        totalChapterQuestions: review.totalChapterQuestions,
        lastPercent: lastReview?.percent ?? null,
      },
      adaptive: {
        available: adaptiveOpen && bankSize > 0,
        count: Math.min(exam?.adaptiveCount ?? bankSize, bankSize),
        bankSize,
        lastPercent: lastAdaptive?.percent ?? null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load chapter exam info");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Exam A — the mistakes review (questions from the chapter's lesson banks).
router.get("/units/:unitId/exam/review", async (req, res) => {
  try {
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });
    const access = await resolveUnitAccess(req, unitId, "review");
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const review = await buildMistakesReview(access.userId, unitId);
    if (review.questionIds.length === 0) {
      return res.status(404).json({ error: "مفيش أسئلة للمراجعة في الفصل ده." });
    }
    const rows = await db
      .select({
        id: videoQuestionsTable.id,
        text: videoQuestionsTable.text,
        imageUrl: videoQuestionsTable.imageUrl,
        table: videoQuestionsTable.table,
        options: videoQuestionsTable.options,
        correctIndex: videoQuestionsTable.correctIndex,
        explanation: videoQuestionsTable.explanation,
      })
      .from(videoQuestionsTable)
      .where(inArray(videoQuestionsTable.id, review.questionIds));

    // The review is a PRACTICE exam (instant feedback), so — unlike the graded exams —
    // it reveals the correct answer + explanation to the client for per-question feedback.
    const questions = shuffleArr(rows).map((q) => ({
      id: q.id,
      source: "lesson" as const,
      text: q.text,
      imageUrl: q.imageUrl,
      table: q.table,
      options: shuffleArr(toStudentOptions(q.options)),
      correctKey: q.correctIndex,
      explanation: q.explanation,
    }));

    return res.json({ unitId, mode: "review", instantFeedback: true, questions });
  } catch (err) {
    req.log.error({ err }, "Failed to start review exam");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Exam B — the adaptive formal exam (questions from the chapter's own bank).
router.get("/units/:unitId/exam/adaptive", async (req, res) => {
  try {
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });
    const access = await resolveUnitAccess(req, unitId, "adaptive");
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const [exam] = await db.select().from(unitExamsTable).where(eq(unitExamsTable.unitId, unitId)).limit(1);
    const bank = await getUnitExamBankByDifficulty(unitId);
    const bankSize = bank.hard.length + bank.medium.length + bank.easy.length;
    if (bankSize === 0) return res.status(404).json({ error: "مفيش امتحان للفصل ده بعد." });

    const level = await getStudentSubjectLevel(access.userId, access.subjectId);
    const count = Math.min(exam?.adaptiveCount ?? bankSize, bankSize);
    const ids = pickAdaptiveIds(bank, level.level, count);

    const rows = await db
      .select({
        id: unitExamQuestionsTable.id,
        text: unitExamQuestionsTable.text,
        imageUrl: unitExamQuestionsTable.imageUrl,
        table: unitExamQuestionsTable.table,
        options: unitExamQuestionsTable.options,
      })
      .from(unitExamQuestionsTable)
      .where(inArray(unitExamQuestionsTable.id, ids));
    // Preserve the adaptive pick order-independence: shuffle the served set.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const questions = shuffleArr(ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows).map((q) => ({
      id: q.id,
      source: "unit" as const,
      text: q.text,
      imageUrl: q.imageUrl,
      table: q.table,
      options: shuffleArr(toStudentOptions(q.options)),
    }));

    return res.json({
      unitId,
      mode: "adaptive",
      timerMinutes: exam?.timerMinutes ?? 0,
      level: level.level,
      questions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start adaptive exam");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Shared grading for both exam submits. `bank` = which question table to grade against.
async function gradeAndSubmit(params: {
  req: any;
  res: any;
  unitId: number;
  examType: "review" | "adaptive";
}) {
  const { req, res, unitId, examType } = params;
  const access = await resolveUnitAccess(req, unitId, examType);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!rawAnswers || rawAnswers.length === 0) return res.status(400).json({ error: "لا توجد إجابات." });

  const chosenByQuestion = new Map<number, number | null>();
  for (const a of rawAnswers) {
    const qid = parseId(a?.questionId);
    if (!qid || chosenByQuestion.has(qid)) continue;
    const rawKey = a?.chosenKey;
    const key = rawKey == null ? null : Number.parseInt(String(rawKey), 10);
    chosenByQuestion.set(qid, Number.isInteger(key) ? key : null);
  }
  if (chosenByQuestion.size === 0) return res.status(400).json({ error: "لا توجد إجابات صالحة." });
  const questionIds = [...chosenByQuestion.keys()];

  // Load the graded questions from the right bank.
  const source: "lesson" | "unit" = examType === "review" ? "lesson" : "unit";
  const questions =
    source === "lesson"
      ? await db
          .select()
          .from(videoQuestionsTable)
          .innerJoin(lessonsTable, eq(lessonsTable.videoId, videoQuestionsTable.videoId))
          .where(and(eq(lessonsTable.unitId, unitId), inArray(videoQuestionsTable.id, questionIds)))
          .then((rows) => rows.map((r) => r.video_questions))
      : await db
          .select()
          .from(unitExamQuestionsTable)
          .where(and(eq(unitExamQuestionsTable.unitId, unitId), inArray(unitExamQuestionsTable.id, questionIds)));

  if (questions.length === 0) return res.status(400).json({ error: "الأسئلة غير صالحة." });
  const byId = new Map(questions.map((q) => [q.id, q]));

  const review: Array<{
    questionId: number;
    text: string;
    imageUrl: string | null;
    table: QuizTable | null;
    options: Array<{ key: number } & QuizOptionContent>;
    chosenKey: number | null;
    correctKey: number;
    isCorrect: boolean;
    explanation: string | null;
  }> = [];
  let score = 0;
  for (const qid of questionIds) {
    const q = byId.get(qid);
    if (!q) continue;
    const chosenKey = chosenByQuestion.get(qid) ?? null;
    const isCorrect = chosenKey === q.correctIndex;
    if (isCorrect) score++;
    review.push({
      questionId: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      table: q.table ?? null,
      options: toStudentOptions(q.options),
      chosenKey,
      correctKey: q.correctIndex,
      isCorrect,
      explanation: q.explanation,
    });
  }
  const total = review.length;
  if (total === 0) return res.status(400).json({ error: "الأسئلة غير صالحة." });
  const percent = Math.round((score / total) * 100);

  // First attempt only (per user + unit + examType).
  const [{ value: priorAttempts }] = await db
    .select({ value: count() })
    .from(unitExamAttemptsTable)
    .where(
      and(
        eq(unitExamAttemptsTable.userId, access.userId),
        eq(unitExamAttemptsTable.unitId, unitId),
        eq(unitExamAttemptsTable.examType, examType),
      ),
    );
  const isFirstAttempt = priorAttempts === 0;

  const [exam] = await db.select().from(unitExamsTable).where(eq(unitExamsTable.unitId, unitId)).limit(1);
  // Adaptive (formal) exam is worth its configured points; the review (practice) is
  // worth its own (smaller) points. Both first-attempt-only, as a % of the score.
  const maxPoints = examType === "adaptive" ? exam?.points ?? 30 : exam?.reviewPoints ?? POINTS.quizFull;
  const intendedPoints = isFirstAttempt ? Math.round((maxPoints * percent) / 100) : 0;

  const [attempt] = await db
    .insert(unitExamAttemptsTable)
    .values({ userId: access.userId, unitId, examType, score, total, percent, pointsAwarded: 0 })
    .returning({ id: unitExamAttemptsTable.id });

  if (review.length > 0) {
    await db.insert(unitExamAnswersTable).values(
      review.map((r) => ({
        attemptId: attempt.id,
        questionId: r.questionId,
        questionSource: source,
        chosenIndex: r.chosenKey,
        isCorrect: r.isCorrect,
      })),
    );
  }

  // Feed the level/mistakes engine (a mastered mistake leaves the review pool).
  try {
    await recordQuestionStats({
      studentId: access.userId,
      subjectId: access.subjectId,
      unitId,
      source,
      answers: review.map((r) => ({
        questionId: r.questionId,
        difficulty: (byId.get(r.questionId) as any)?.difficulty ?? "medium",
        isCorrect: r.isCorrect,
      })),
    });
  } catch (err) {
    req.log.warn({ err, unitId }, "Failed to record chapter-exam stats");
  }

  // Points + streak (idempotent per unit+examType, first-attempt-only).
  const activity = await recordExamActivity({
    userId: access.userId,
    sourceKey: `unit_exam_first:${unitId}:${examType}`,
    description: examType === "adaptive" ? "تحديك الخاص" : "امتحان الاستدراك",
    points: intendedPoints,
    maxPoints,
  });
  const pointsAwarded = activity.pointsAwarded;
  if (pointsAwarded > 0) {
    await db.update(unitExamAttemptsTable).set({ pointsAwarded }).where(eq(unitExamAttemptsTable.id, attempt.id));
  }

  return res.json({
    attemptId: attempt.id,
    examType,
    score,
    total,
    percent,
    pointsAwarded,
    isFirstAttempt,
    streak: activity.streakCount,
    review,
  });
}

router.post("/units/:unitId/exam/review/submit", async (req, res) => {
  try {
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });
    return await gradeAndSubmit({ req, res, unitId, examType: "review" });
  } catch (err) {
    req.log.error({ err }, "Failed to submit review exam");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/units/:unitId/exam/adaptive/submit", async (req, res) => {
  try {
    const unitId = parseId(req.params.unitId);
    if (!unitId) return res.status(400).json({ error: "معرف الفصل غير صالح" });
    return await gradeAndSubmit({ req, res, unitId, examType: "adaptive" });
  } catch (err) {
    req.log.error({ err }, "Failed to submit adaptive exam");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Local shuffle (Math.random is fine on the server).
function shuffleArr<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default router;
