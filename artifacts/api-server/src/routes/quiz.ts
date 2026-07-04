import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import {
  db,
  videosTable,
  lessonsTable,
  unitsTable,
  subjectsTable,
  academicYearsTable,
  usersTable,
  subjectSubscriptionsTable,
  videoQuestionsTable,
  quizAttemptsTable,
  quizAnswersTable,
  lessonWatchProgressTable,
  type QuizTable,
  type QuizOptionContent,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";
import { getUserAuth } from "../lib/user-cache";
import { POINTS, recordQuizActivity } from "../lib/gamification";
import { getVideoSubjectUnit, recordQuestionStats, getStudentLevels } from "../lib/exam-engine";

const router: IRouter = Router();

// v2 Phase 2 — quizzes after a video lesson. Questions are fixed 4-option MCQs bound
// to a VIDEO (the "الدروس المرئية" tab). Students get a RANDOM sample of the video's
// published questions each attempt (question order AND option order shuffled), the
// answer is never sent to the client, grading + points happen server-side, and points
// are credited on the FIRST attempt only (percentage of the max, see recordQuizActivity).

const OPTIONS_PER_QUESTION = 4;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const MAX_IMPORT_QUESTIONS = 500;

// ── Image upload (question diagrams) ────────────────────────────────────────────
const quizImagesUploadDir = path.resolve(process.cwd(), "uploads/quiz-images");
fs.mkdirSync(quizImagesUploadDir, { recursive: true });

// review B-19: never trust the client filename/extension — derive it from the
// server-side mimetype allowlist (falling back to a recognised image extension) + a
// random name. Accept EVERY common raster/vector image format.
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/jp2": ".jp2",
};
const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".jfif", ".png", ".webp", ".gif", ".heic", ".heif",
  ".bmp", ".tif", ".tiff", ".svg", ".avif", ".ico", ".jp2",
]);

function safeImageFilename(file: { mimetype: string; originalname?: string }): string {
  let ext = IMAGE_MIME_EXTENSIONS[file.mimetype];
  if (!ext) {
    const raw = path.extname(file.originalname ?? "").toLowerCase();
    if (IMAGE_EXTS.has(raw)) ext = raw === ".jpeg" || raw === ".jfif" ? ".jpg" : raw;
  }
  return `${randomUUID()}${ext ?? ".jpg"}`;
}

const quizImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, quizImagesUploadDir),
  filename: (_req, file, cb) => cb(null, safeImageFilename(file)),
});

const uploadQuizImage = multer({
  storage: quizImageStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept any image mimetype, OR any file whose extension is a known image type
    // (covers files that arrive with a generic mimetype like application/octet-stream).
    const ext = path.extname(file.originalname ?? "").toLowerCase();
    if (file.mimetype.startsWith("image/") || IMAGE_EXTS.has(ext)) cb(null, true);
    else cb(new Error("الرجاء رفع ملف صورة"));
  },
});

// ── Auth helpers (mirror academic.ts / videos.ts) ───────────────────────────────
export type SessionUser = { id: number; role: string; status: string };

export async function getSessionUser(req: any): Promise<SessionUser | null> {
  const userId = getSessionUserId(req);
  if (!userId) return null;
  const user = await getUserAuth(userId);
  if (!user || user.status !== "active") return null;
  return user;
}

export function isPrivileged(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "owner";
}

export async function requireAdmin(req: any, res: any): Promise<SessionUser | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  if (!isPrivileged(user)) {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }
  return user;
}

// Express middleware form — rejects non-admins BEFORE multer writes bytes to disk.
async function requireAdminMw(req: any, res: any, next: any) {
  if (await requireAdmin(req, res)) next();
}

export async function userHasSubjectAccess(userId: number, subjectId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: subjectSubscriptionsTable.id })
    .from(subjectSubscriptionsTable)
    .where(
      and(
        eq(subjectSubscriptionsTable.studentId, userId),
        eq(subjectSubscriptionsTable.subjectId, subjectId),
        eq(subjectSubscriptionsTable.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// The subject that owns a PUBLISHED video (via its lesson → unit → subject chain),
// with the whole chain published. Null if the video is missing/unpublished — which is
// what a student may access. Admins bypass this via the admin routes.
async function getPublishedVideoSubjectId(videoId: number): Promise<number | null> {
  const [row] = await db
    .select({ subjectId: subjectsTable.id })
    .from(videosTable)
    .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
    .where(
      and(
        eq(videosTable.id, videoId),
        eq(videosTable.publishStatus, "published"),
        eq(lessonsTable.isPublished, true),
        eq(unitsTable.isPublished, true),
        eq(subjectsTable.isPublished, true),
        eq(academicYearsTable.isPublished, true),
      ),
    )
    .limit(1);
  return row?.subjectId ?? null;
}

// v2 Phase 2 (quiz watch-gate): resolve whether a student has watched enough of a
// video's REAL content to unlock its quiz. Watch progress is keyed by lessonId, the
// quiz by videoId, so we bridge video → lesson → lesson_watch_progress. Coverage is
// `watchedSeconds` (distinct seconds actually played — seeking never counts), so a
// student can't drag the scrubber to the end to unlock. Server-authoritative.
type WatchGateStatus = {
  enabled: boolean;
  requiredPercent: number;
  watchedPercent: number;
  watchedEnough: boolean;
};

async function getVideoWatchGate(videoId: number, userId: number): Promise<WatchGateStatus> {
  const [v] = await db
    .select({
      enabled: videosTable.quizWatchGateEnabled,
      percent: videosTable.quizWatchGatePercent,
      duration: videosTable.duration,
    })
    .from(videosTable)
    .where(eq(videosTable.id, videoId))
    .limit(1);

  const enabled = v?.enabled ?? false;
  const requiredPercent = v?.percent ?? 75;

  if (!enabled) {
    return { enabled: false, requiredPercent, watchedPercent: 0, watchedEnough: true };
  }

  const [progress] = await db
    .select({
      watchedSeconds: lessonWatchProgressTable.watchedSeconds,
      durationSeconds: lessonWatchProgressTable.durationSeconds,
    })
    .from(lessonWatchProgressTable)
    .innerJoin(lessonsTable, eq(lessonsTable.id, lessonWatchProgressTable.lessonId))
    .where(and(eq(lessonsTable.videoId, videoId), eq(lessonWatchProgressTable.studentId, userId)))
    .limit(1);

  const watchedSeconds = Math.max(0, progress?.watchedSeconds ?? 0);
  const durationSeconds =
    progress?.durationSeconds && progress.durationSeconds > 0 ? progress.durationSeconds : v?.duration ?? 0;
  const watchedPercent = durationSeconds > 0 ? Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100)) : 0;
  const watchedEnough = watchedPercent >= requiredPercent;

  return { enabled, requiredPercent, watchedPercent, watchedEnough };
}

export function parseId(value: unknown): number | null {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Fisher–Yates in-place shuffle.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A student-facing option carries `key` = its ORIGINAL index (0..3) plus its content
// (text/image/table). The client sends this key back on submit, so grading is stable no
// matter how options were shuffled, and the correct index is never exposed.
export function toStudentOptions(options: QuizOptionContent[]) {
  return options.map((opt, key) => ({ key, ...opt }));
}

// How many questions this video serves per attempt (random sample of the published
// bank). `quizQuestionCount` null/≤0 → serve all.
function servedCount(bankSize: number, quizQuestionCount: number | null): number {
  if (!quizQuestionCount || quizQuestionCount <= 0) return bankSize;
  return Math.min(quizQuestionCount, bankSize);
}

// ── Student: card info (no questions leaked) ────────────────────────────────────
router.get("/videos/:id/quiz/info", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const privileged = isPrivileged(user);
    let hasAccess = privileged;
    let quizQuestionCount: number | null = null;

    if (privileged) {
      const [v] = await db
        .select({ quizQuestionCount: videosTable.quizQuestionCount })
        .from(videosTable)
        .where(eq(videosTable.id, videoId))
        .limit(1);
      if (!v) return res.status(404).json({ error: "Video not found" });
      quizQuestionCount = v.quizQuestionCount;
    } else {
      const subjectId = await getPublishedVideoSubjectId(videoId);
      if (subjectId == null) return res.status(404).json({ error: "Video not found" });
      hasAccess = await userHasSubjectAccess(user.id, subjectId);
      const [v] = await db
        .select({ quizQuestionCount: videosTable.quizQuestionCount })
        .from(videosTable)
        .where(eq(videosTable.id, videoId))
        .limit(1);
      quizQuestionCount = v?.quizQuestionCount ?? null;
    }

    const [{ value: bankSize }] = await db
      .select({ value: count() })
      .from(videoQuestionsTable)
      .where(and(eq(videoQuestionsTable.videoId, videoId), eq(videoQuestionsTable.isPublished, true)));

    const [lastAttempt] = await db
      .select({
        id: quizAttemptsTable.id,
        score: quizAttemptsTable.score,
        total: quizAttemptsTable.total,
        percent: quizAttemptsTable.percent,
        pointsAwarded: quizAttemptsTable.pointsAwarded,
        createdAt: quizAttemptsTable.createdAt,
      })
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.userId, user.id), eq(quizAttemptsTable.videoId, videoId)))
      .orderBy(desc(quizAttemptsTable.createdAt))
      .limit(1);

    const [{ value: attemptsCount }] = await db
      .select({ value: count() })
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.userId, user.id), eq(quizAttemptsTable.videoId, videoId)));

    // Watch-gate: admins/owners bypass; students must have really watched enough.
    const watchGate: WatchGateStatus = privileged
      ? { enabled: false, requiredPercent: 0, watchedPercent: 100, watchedEnough: true }
      : await getVideoWatchGate(videoId, user.id);

    return res.json({
      available: bankSize > 0,
      hasAccess,
      questionCount: servedCount(bankSize, quizQuestionCount),
      bankSize,
      maxPoints: POINTS.quizFull,
      attemptsCount,
      lastAttempt: lastAttempt ?? null,
      watchGate,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load quiz info");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Student: start a quiz (random sample, answers hidden) ────────────────────────
router.get("/videos/:id/quiz", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    // Access: admins/owners bypass; students need an active subscription to the subject.
    let quizQuestionCount: number | null = null;
    if (isPrivileged(user)) {
      const [v] = await db
        .select({ quizQuestionCount: videosTable.quizQuestionCount })
        .from(videosTable)
        .where(eq(videosTable.id, videoId))
        .limit(1);
      if (!v) return res.status(404).json({ error: "Video not found" });
      quizQuestionCount = v.quizQuestionCount;
    } else {
      const subjectId = await getPublishedVideoSubjectId(videoId);
      if (subjectId == null) return res.status(404).json({ error: "Video not found" });
      const hasAccess = await userHasSubjectAccess(user.id, subjectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "هذا الاختبار متاح للمشتركين في المادة فقط." });
      }
      // Watch-gate: the quiz stays locked until the student has really watched enough
      // of the video (playback coverage, seeks excluded). Server-authoritative.
      const gate = await getVideoWatchGate(videoId, user.id);
      if (!gate.watchedEnough) {
        return res.status(403).json({
          error: `لازم تشوف على الأقل ${gate.requiredPercent}% من الفيديو قبل ما تبدأ الاختبار.`,
          code: "watch_gate",
          watchGate: gate,
        });
      }
      const [v] = await db
        .select({ quizQuestionCount: videosTable.quizQuestionCount })
        .from(videosTable)
        .where(eq(videosTable.id, videoId))
        .limit(1);
      quizQuestionCount = v?.quizQuestionCount ?? null;
    }

    const bank = await db
      .select({
        id: videoQuestionsTable.id,
        text: videoQuestionsTable.text,
        imageUrl: videoQuestionsTable.imageUrl,
        table: videoQuestionsTable.table,
        options: videoQuestionsTable.options,
      })
      .from(videoQuestionsTable)
      .where(and(eq(videoQuestionsTable.videoId, videoId), eq(videoQuestionsTable.isPublished, true)));

    if (bank.length === 0) {
      return res.status(404).json({ error: "لا يوجد اختبار لهذا الدرس بعد." });
    }

    const take = servedCount(bank.length, quizQuestionCount);
    const sampled = shuffle([...bank]).slice(0, take);

    const questions = sampled.map((q) => ({
      id: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      table: q.table,
      // Shuffle option order; each option keeps its original `key` for grading.
      options: shuffle(toStudentOptions(q.options)),
    }));

    const [langRow] = await db
      .select({ quizLanguage: videosTable.quizLanguage })
      .from(videosTable)
      .where(eq(videosTable.id, videoId))
      .limit(1);
    const language = langRow?.quizLanguage === "en" ? "en" : "ar";

    return res.json({ videoId, maxPoints: POINTS.quizFull, language, questions });
  } catch (err) {
    req.log.error({ err }, "Failed to load quiz");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Student: submit answers → grade, store, award points, return full review ──────
router.post("/videos/:id/quiz/submit", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    // Access check (same as GET /quiz).
    if (!isPrivileged(user)) {
      const subjectId = await getPublishedVideoSubjectId(videoId);
      if (subjectId == null) return res.status(404).json({ error: "Video not found" });
      const hasAccess = await userHasSubjectAccess(user.id, subjectId);
      if (!hasAccess) {
        return res.status(403).json({ error: "هذا الاختبار متاح للمشتركين في المادة فقط." });
      }
      // Watch-gate (defence in depth — the take endpoint already blocks, but submit
      // must not be callable directly to bypass the watch requirement).
      const gate = await getVideoWatchGate(videoId, user.id);
      if (!gate.watchedEnough) {
        return res.status(403).json({
          error: `لازم تشوف على الأقل ${gate.requiredPercent}% من الفيديو قبل ما تبدأ الاختبار.`,
          code: "watch_gate",
          watchGate: gate,
        });
      }
    } else {
      const [v] = await db.select({ id: videosTable.id }).from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
      if (!v) return res.status(404).json({ error: "Video not found" });
    }

    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : null;
    if (!rawAnswers || rawAnswers.length === 0) {
      return res.status(400).json({ error: "لا توجد إجابات." });
    }

    // Normalise (questionId → chosenKey|null), de-dup by questionId (first wins).
    const chosenByQuestion = new Map<number, number | null>();
    for (const a of rawAnswers) {
      const qid = parseId(a?.questionId);
      if (!qid || chosenByQuestion.has(qid)) continue;
      const rawKey = a?.chosenKey;
      const key = rawKey == null ? null : Number.parseInt(String(rawKey), 10);
      chosenByQuestion.set(qid, Number.isInteger(key) ? key : null);
    }
    if (chosenByQuestion.size === 0) {
      return res.status(400).json({ error: "لا توجد إجابات صالحة." });
    }

    // Load the referenced published questions that actually belong to this video.
    const questionIds = [...chosenByQuestion.keys()];
    const questions = await db
      .select()
      .from(videoQuestionsTable)
      .where(
        and(
          eq(videoQuestionsTable.videoId, videoId),
          eq(videoQuestionsTable.isPublished, true),
          inArray(videoQuestionsTable.id, questionIds),
        ),
      );
    if (questions.length === 0) {
      return res.status(400).json({ error: "الأسئلة غير صالحة." });
    }

    // Grade, preserving the submitted order for the review screen.
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

    // Points on the FIRST attempt only. "First" = no prior attempt for (user, video).
    const [{ value: priorAttempts }] = await db
      .select({ value: count() })
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.userId, user.id), eq(quizAttemptsTable.videoId, videoId)));
    const isFirstAttempt = priorAttempts === 0;
    const intendedPoints = isFirstAttempt ? Math.round((POINTS.quizFull * percent) / 100) : 0;

    // Persist the attempt + its per-question answers.
    const [attempt] = await db
      .insert(quizAttemptsTable)
      .values({ userId: user.id, videoId, score, total, percent, pointsAwarded: 0 })
      .returning({ id: quizAttemptsTable.id });

    if (review.length > 0) {
      await db.insert(quizAnswersTable).values(
        review.map((r) => ({
          attemptId: attempt.id,
          questionId: r.questionId,
          chosenIndex: r.chosenKey,
          isCorrect: r.isCorrect,
        })),
      );
    }

    // Feed the level/mistakes engine: record each answer's first-attempt + ever-correct
    // status, tagged with this video's subject/unit + the question difficulty. Best-effort
    // — it must never fail the submit.
    try {
      const subjectUnit = await getVideoSubjectUnit(videoId);
      if (subjectUnit) {
        await recordQuestionStats({
          studentId: user.id,
          subjectId: subjectUnit.subjectId,
          unitId: subjectUnit.unitId,
          source: "lesson",
          answers: review.map((r) => ({
            questionId: r.questionId,
            difficulty: byId.get(r.questionId)?.difficulty ?? "medium",
            isCorrect: r.isCorrect,
          })),
        });
      }
    } catch (err) {
      req.log.warn({ err, videoId }, "Failed to record question stats");
    }

    // Award quiz points (idempotent per video) + keep the daily streak alive.
    const activity = await recordQuizActivity({ userId: user.id, videoId, quizPoints: intendedPoints });
    const pointsAwarded = activity.pointsAwarded;
    if (pointsAwarded > 0) {
      await db
        .update(quizAttemptsTable)
        .set({ pointsAwarded })
        .where(eq(quizAttemptsTable.id, attempt.id));
    }

    const [langRow] = await db
      .select({ quizLanguage: videosTable.quizLanguage })
      .from(videosTable)
      .where(eq(videosTable.id, videoId))
      .limit(1);
    const language = langRow?.quizLanguage === "en" ? "en" : "ar";

    return res.json({
      attemptId: attempt.id,
      score,
      total,
      percent,
      pointsAwarded,
      isFirstAttempt,
      streak: activity.streakCount,
      language,
      review,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to submit quiz");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Student: my auto-computed level (مبتدئ/متوسط/متقدّم) per subject ───────────────
// Difficulty-weighted % of first-attempt-correct answers across each subject's
// questions. Shown next to each subscribed subject in the app.
router.get("/me/subject-levels", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    const levels = await getStudentLevels(user.id);
    return res.json({ levels });
  } catch (err) {
    req.log.error({ err }, "Failed to load subject levels");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Student: attempts history (newest first) ─────────────────────────────────────
router.get("/videos/:id/quiz/history", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const attempts = await db
      .select({
        id: quizAttemptsTable.id,
        score: quizAttemptsTable.score,
        total: quizAttemptsTable.total,
        percent: quizAttemptsTable.percent,
        pointsAwarded: quizAttemptsTable.pointsAwarded,
        createdAt: quizAttemptsTable.createdAt,
      })
      .from(quizAttemptsTable)
      .where(and(eq(quizAttemptsTable.userId, user.id), eq(quizAttemptsTable.videoId, videoId)))
      .orderBy(desc(quizAttemptsTable.createdAt))
      .limit(100);

    return res.json(attempts);
  } catch (err) {
    req.log.error({ err }, "Failed to load quiz history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin: question CRUD, quiz settings, image upload, Excel bulk import ──────────

// Normalise a table payload → clean QuizTable, or null when it's empty/absent.
function normalizeTable(raw: any): QuizTable | null {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.cells)) return null;
  const cells: string[][] = raw.cells
    .filter((row: unknown) => Array.isArray(row))
    .map((row: unknown[]) => row.map((c) => String(c ?? "")));
  // Drop a fully-empty table.
  if (cells.length === 0 || cells.every((row) => row.every((c) => !c.trim()))) return null;
  return { headerRow: Boolean(raw.headerRow), cells };
}

// Normalise ONE answer option → exactly one of text/image/table. Throws on empty content.
function normalizeOption(raw: any): QuizOptionContent {
  const kind = raw?.kind === "image" ? "image" : raw?.kind === "table" ? "table" : "text";
  if (kind === "image") {
    const imageUrl = String(raw?.imageUrl ?? "").trim();
    if (!imageUrl) throw new Error("اختيار الصورة لازم ترفعله صورة");
    return { kind, imageUrl };
  }
  if (kind === "table") {
    const table = normalizeTable(raw?.table);
    if (!table) throw new Error("اختيار الجدول لازم يكون فيه بيانات");
    return { kind, table };
  }
  const optText = String(raw?.text ?? "").trim();
  if (!optText) throw new Error("كل اختيار نصّي لازم يكون مكتوب");
  return { kind, text: optText };
}

// Validate + normalise a question payload. Single-language (no bilingual fields). A
// question stem is `text` (Unicode) and may additionally carry an image and/or a table;
// at least one of the three must be present. Throws a user-facing message on bad input.
export function normalizeQuestionInput(body: any): {
  text: string;
  imageUrl: string | null;
  table: QuizTable | null;
  options: QuizOptionContent[];
  correctIndex: number;
  explanation: string | null;
  difficulty: string;
  isPublished: boolean;
  orderIndex: number;
} {
  const text = String(body?.text ?? "").trim();
  const imageUrl = body?.imageUrl != null && String(body.imageUrl).trim() ? String(body.imageUrl).trim() : null;
  const table = normalizeTable(body?.table);
  if (!text && !imageUrl && !table) throw new Error("اكتب نص السؤال أو أضف صورة/جدول");

  const rawOptions = Array.isArray(body?.options) ? body.options : [];
  if (rawOptions.length !== OPTIONS_PER_QUESTION) throw new Error("لازم ٤ اختيارات");
  const options = rawOptions.map((o: unknown) => normalizeOption(o));

  const correctIndex = Number.parseInt(String(body?.correctIndex), 10);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= OPTIONS_PER_QUESTION) {
    throw new Error("حدّد الإجابة الصحيحة (من ١ لـ ٤)");
  }

  const explanation = body?.explanation != null && String(body.explanation).trim() ? String(body.explanation).trim() : null;

  const rawDifficulty = String(body?.difficulty ?? "medium").trim();
  const difficulty = DIFFICULTIES.has(rawDifficulty) ? rawDifficulty : "medium";

  const isPublished = body?.isPublished == null ? true : Boolean(body.isPublished);

  const rawOrder = Number.parseInt(String(body?.orderIndex), 10);
  const orderIndex = Number.isInteger(rawOrder) && rawOrder >= 0 ? rawOrder : 0;

  return { text, imageUrl, table, options, correctIndex, explanation, difficulty, isPublished, orderIndex };
}

// Admin: full question bank for a video (answers included) + the video's quiz settings.
router.get("/admin/videos/:id/questions", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const [video] = await db
      .select({
        id: videosTable.id,
        title: videosTable.title,
        quizQuestionCount: videosTable.quizQuestionCount,
        quizLanguage: videosTable.quizLanguage,
        quizWatchGateEnabled: videosTable.quizWatchGateEnabled,
        quizWatchGatePercent: videosTable.quizWatchGatePercent,
      })
      .from(videosTable)
      .where(eq(videosTable.id, videoId))
      .limit(1);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const questions = await db
      .select()
      .from(videoQuestionsTable)
      .where(eq(videoQuestionsTable.videoId, videoId))
      .orderBy(asc(videoQuestionsTable.orderIndex), asc(videoQuestionsTable.id));

    return res.json({ video, questions });
  } catch (err) {
    req.log.error({ err }, "Failed to load admin questions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: create a question.
router.post("/admin/videos/:id/questions", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const [video] = await db.select({ id: videosTable.id }).from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!video) return res.status(404).json({ error: "Video not found" });

    let input;
    try {
      input = normalizeQuestionInput(req.body);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message ?? "بيانات السؤال غير صالحة" });
    }

    const [created] = await db
      .insert(videoQuestionsTable)
      .values({ videoId, ...input })
      .returning();

    return res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create question");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: update a question.
router.patch("/admin/questions/:qid", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const qid = parseId(req.params.qid);
    if (!qid) return res.status(400).json({ error: "معرف السؤال غير صالح" });

    const [existing] = await db.select({ id: videoQuestionsTable.id }).from(videoQuestionsTable).where(eq(videoQuestionsTable.id, qid)).limit(1);
    if (!existing) return res.status(404).json({ error: "السؤال غير موجود" });

    let input;
    try {
      input = normalizeQuestionInput(req.body);
    } catch (e: any) {
      return res.status(400).json({ error: e?.message ?? "بيانات السؤال غير صالحة" });
    }

    const [updated] = await db
      .update(videoQuestionsTable)
      .set(input)
      .where(eq(videoQuestionsTable.id, qid))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update question");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: delete a question.
router.delete("/admin/questions/:qid", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const qid = parseId(req.params.qid);
    if (!qid) return res.status(400).json({ error: "معرف السؤال غير صالح" });

    await db.delete(videoQuestionsTable).where(eq(videoQuestionsTable.id, qid));
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete question");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: set how many questions this video serves per attempt (null = all).
router.patch("/admin/videos/:id/quiz-settings", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const raw = req.body?.quizQuestionCount;
    let quizQuestionCount: number | null = null;
    if (raw != null && String(raw).trim() !== "") {
      const n = Number.parseInt(String(raw), 10);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: "عدد الأسئلة لازم يكون رقم موجب أو فاضي (كل الأسئلة)" });
      }
      quizQuestionCount = n;
    }

    // Only touch each setting when the caller sends it, so a partial update can't
    // silently reset the others (language / watch-gate).
    const set: {
      quizQuestionCount: number | null;
      quizLanguage?: "ar" | "en";
      quizWatchGateEnabled?: boolean;
      quizWatchGatePercent?: number;
    } = { quizQuestionCount };
    if (req.body?.quizLanguage != null) {
      set.quizLanguage = String(req.body.quizLanguage).trim().toLowerCase() === "en" ? "en" : "ar";
    }
    if (req.body?.quizWatchGateEnabled != null) {
      set.quizWatchGateEnabled = Boolean(req.body.quizWatchGateEnabled);
    }
    if (req.body?.quizWatchGatePercent != null && String(req.body.quizWatchGatePercent).trim() !== "") {
      const p = Number.parseInt(String(req.body.quizWatchGatePercent), 10);
      // Clamp to a sensible 1–100 range; reject nonsense.
      if (!Number.isInteger(p) || p < 1 || p > 100) {
        return res.status(400).json({ error: "نسبة المشاهدة لازم تكون رقم بين ١ و ١٠٠" });
      }
      set.quizWatchGatePercent = p;
    }

    const [updated] = await db
      .update(videosTable)
      .set(set)
      .where(eq(videosTable.id, videoId))
      .returning({
        id: videosTable.id,
        quizQuestionCount: videosTable.quizQuestionCount,
        quizLanguage: videosTable.quizLanguage,
        quizWatchGateEnabled: videosTable.quizWatchGateEnabled,
        quizWatchGatePercent: videosTable.quizWatchGatePercent,
      });
    if (!updated) return res.status(404).json({ error: "Video not found" });

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update quiz settings");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: sync a video's WHOLE question set + the quiz settings in one call. Used by
// the lesson editor so the admin adds the video + all its questions and saves them
// together (create/update/delete in one shot). Incoming questions with an `id` are
// updated in place (preserving attempt history); ones without an `id` are created;
// existing questions absent from the payload are deleted.
router.put("/admin/videos/:id/questions", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const [video] = await db.select({ id: videosTable.id }).from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (rawQuestions.length > MAX_IMPORT_QUESTIONS) {
      return res.status(400).json({ error: `الحد الأقصى ${MAX_IMPORT_QUESTIONS} سؤال` });
    }

    // Validate everything BEFORE mutating anything (so a bad row can't half-apply).
    const items: Array<{ id: number | null; data: ReturnType<typeof normalizeQuestionInput> }> = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      let data;
      try {
        data = normalizeQuestionInput(rawQuestions[i]);
      } catch (e: any) {
        return res.status(400).json({ error: `سؤال رقم ${i + 1}: ${e?.message ?? "بيانات غير صالحة"}` });
      }
      const rawId = parseId(rawQuestions[i]?.id);
      items.push({ id: rawId, data: { ...data, orderIndex: i } });
    }

    // Delete existing questions that are no longer present.
    const keepIds = items.map((it) => it.id).filter((v): v is number => v != null);
    if (keepIds.length > 0) {
      await db.delete(videoQuestionsTable).where(and(eq(videoQuestionsTable.videoId, videoId), notInArray(videoQuestionsTable.id, keepIds)));
    } else {
      await db.delete(videoQuestionsTable).where(eq(videoQuestionsTable.videoId, videoId));
    }

    // Update existing, insert new.
    for (const it of items) {
      if (it.id != null) {
        await db.update(videoQuestionsTable).set(it.data).where(and(eq(videoQuestionsTable.id, it.id), eq(videoQuestionsTable.videoId, videoId)));
      } else {
        await db.insert(videoQuestionsTable).values({ videoId, ...it.data });
      }
    }

    // Quiz settings (questions shown per attempt + exam language + watch-gate). This is
    // the full-save path from the lesson editor, which always sends them.
    const rawCount = req.body?.quizQuestionCount;
    let quizQuestionCount: number | null = null;
    if (rawCount != null && String(rawCount).trim() !== "") {
      const n = Number.parseInt(String(rawCount), 10);
      quizQuestionCount = Number.isInteger(n) && n >= 1 ? n : null;
    }
    const quizLanguage = String(req.body?.quizLanguage ?? "").trim().toLowerCase() === "en" ? "en" : "ar";
    const quizWatchGateEnabled = Boolean(req.body?.quizWatchGateEnabled);
    const rawGatePercent = Number.parseInt(String(req.body?.quizWatchGatePercent ?? "75"), 10);
    const quizWatchGatePercent = Number.isInteger(rawGatePercent) && rawGatePercent >= 1 && rawGatePercent <= 100 ? rawGatePercent : 75;
    await db
      .update(videosTable)
      .set({ quizQuestionCount, quizLanguage, quizWatchGateEnabled, quizWatchGatePercent })
      .where(eq(videosTable.id, videoId));

    const saved = await db
      .select()
      .from(videoQuestionsTable)
      .where(eq(videoQuestionsTable.videoId, videoId))
      .orderBy(asc(videoQuestionsTable.orderIndex), asc(videoQuestionsTable.id));

    return res.json({ count: saved.length, quizQuestionCount, quizLanguage, questions: saved });
  } catch (err) {
    req.log.error({ err }, "Failed to sync questions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: bulk import questions (parsed from Excel client-side → JSON rows here).
router.post("/admin/videos/:id/questions/import", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const videoId = parseId(req.params.id);
    if (!videoId) return res.status(400).json({ error: "معرف الفيديو غير صالح" });

    const [video] = await db.select({ id: videosTable.id }).from(videosTable).where(eq(videosTable.id, videoId)).limit(1);
    if (!video) return res.status(404).json({ error: "Video not found" });

    const rows = Array.isArray(req.body?.questions) ? req.body.questions : null;
    if (!rows || rows.length === 0) return res.status(400).json({ error: "الملف فاضي أو غير صالح" });
    if (rows.length > MAX_IMPORT_QUESTIONS) {
      return res.status(400).json({ error: `الحد الأقصى ${MAX_IMPORT_QUESTIONS} سؤال في المرة الواحدة` });
    }

    const valid: Array<ReturnType<typeof normalizeQuestionInput>> = [];
    const errors: Array<{ row: number; error: string }> = [];
    rows.forEach((row: any, i: number) => {
      try {
        valid.push(normalizeQuestionInput(row));
      } catch (e: any) {
        errors.push({ row: i + 1, error: e?.message ?? "سطر غير صالح" });
      }
    });

    let inserted = 0;
    if (valid.length > 0) {
      const result = await db
        .insert(videoQuestionsTable)
        .values(valid.map((v, i) => ({ videoId, ...v, orderIndex: v.orderIndex || i })))
        .returning({ id: videoQuestionsTable.id });
      inserted = result.length;
    }

    return res.json({ inserted, failed: errors.length, errors });
  } catch (err) {
    req.log.error({ err }, "Failed to import questions");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: upload a question image → returns its public URL.
router.post("/admin/quiz/upload-image", requireAdminMw, uploadQuizImage.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "لم يتم رفع أي صورة" });
    return res.json({ url: `/api/uploads/quiz-images/${req.file.filename}` });
  } catch (err) {
    req.log.error({ err }, "Failed to upload quiz image");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
