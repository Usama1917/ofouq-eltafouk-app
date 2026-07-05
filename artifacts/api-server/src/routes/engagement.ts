import { Router, type IRouter } from "express";
import {
  db,
  lessonBookmarksTable,
  lessonNotesTable,
  lessonsTable,
  unitsTable,
  subjectsTable,
  academicYearsTable,
  videosTable,
  subjectSubscriptionsTable,
  lessonWatchProgressTable,
  quizAttemptsTable,
  unitExamAttemptsTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getSessionUser, isPrivileged, userHasSubjectAccess, parseId } from "./quiz";
import { getGamificationSummary } from "../lib/gamification";

// v2 Phase 4 — quick-wins bundle: bookmarks (⭐), timestamped notes (📝), lesson search
// (🔎), and the student progress dashboard (📊). All student-only + subscription-scoped.

const router: IRouter = Router();

async function requireStudentId(req: any, res: any): Promise<number | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  if (user.role !== "student" && !isPrivileged(user)) {
    res.status(403).json({ error: "هذه الخدمة متاحة للطلاب فقط" });
    return null;
  }
  return user.id;
}

// The subject a lesson belongs to (published chain), or null if not found/unpublished.
async function getLessonSubjectId(lessonId: number): Promise<number | null> {
  const [row] = await db
    .select({ subjectId: subjectsTable.id })
    .from(lessonsTable)
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return row?.subjectId ?? null;
}

// Student must be able to reach the lesson (subscribed to its subject; admins bypass).
async function canAccessLesson(req: any, userId: number, lessonId: number): Promise<boolean> {
  const user = await getSessionUser(req);
  if (user && isPrivileged(user)) return true;
  const subjectId = await getLessonSubjectId(lessonId);
  if (subjectId == null) return false;
  return userHasSubjectAccess(userId, subjectId);
}

// ── Bookmarks (⭐) ─────────────────────────────────────────────────────────────

router.post("/lessons/:lessonId/bookmark", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });
    if (!(await canAccessLesson(req, userId, lessonId))) return res.status(403).json({ error: "الدرس غير متاح لك." });

    await db.insert(lessonBookmarksTable).values({ studentId: userId, lessonId }).onConflictDoNothing();
    return res.json({ bookmarked: true });
  } catch (err) {
    req.log.error({ err }, "Failed to add bookmark");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/lessons/:lessonId/bookmark", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    await db
      .delete(lessonBookmarksTable)
      .where(and(eq(lessonBookmarksTable.studentId, userId), eq(lessonBookmarksTable.lessonId, lessonId)));
    return res.json({ bookmarked: false });
  } catch (err) {
    req.log.error({ err }, "Failed to remove bookmark");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// The student's saved lessons (still-accessible + published), newest first.
router.get("/me/bookmarks", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;

    const rows = await db
      .select({
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
        lessonTitleEn: lessonsTable.titleEn,
        unitId: unitsTable.id,
        unitName: unitsTable.name,
        unitNameEn: unitsTable.nameEn,
        unitLabel: subjectsTable.unitLabel,
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        subjectNameEn: subjectsTable.nameEn,
        yearId: academicYearsTable.id,
        yearName: academicYearsTable.name,
        yearNameEn: academicYearsTable.nameEn,
        videoId: videosTable.id,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        instructor: videosTable.instructor,
        bookmarkedAt: lessonBookmarksTable.createdAt,
      })
      .from(lessonBookmarksTable)
      .innerJoin(lessonsTable, and(eq(lessonBookmarksTable.lessonId, lessonsTable.id), eq(lessonsTable.isPublished, true)))
      .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(eq(lessonBookmarksTable.studentId, userId))
      .orderBy(desc(lessonBookmarksTable.createdAt));

    return res.json({ bookmarks: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list bookmarks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Notes (📝) ────────────────────────────────────────────────────────────────

const MAX_NOTE_LEN = 2000;

router.get("/lessons/:lessonId/notes", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });

    const notes = await db
      .select()
      .from(lessonNotesTable)
      .where(and(eq(lessonNotesTable.studentId, userId), eq(lessonNotesTable.lessonId, lessonId)))
      .orderBy(asc(lessonNotesTable.atSeconds), asc(lessonNotesTable.id));
    return res.json({ notes });
  } catch (err) {
    req.log.error({ err }, "Failed to list notes");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/lessons/:lessonId/notes", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const lessonId = parseId(req.params.lessonId);
    if (!lessonId) return res.status(400).json({ error: "معرف الدرس غير صالح" });
    if (!(await canAccessLesson(req, userId, lessonId))) return res.status(403).json({ error: "الدرس غير متاح لك." });

    const body = String(req.body?.body ?? "").trim().slice(0, MAX_NOTE_LEN);
    if (!body) return res.status(400).json({ error: "الملاحظة فاضية." });
    const rawAt = Number.parseInt(String(req.body?.atSeconds ?? "0"), 10);
    const atSeconds = Number.isInteger(rawAt) && rawAt >= 0 ? rawAt : 0;

    const [note] = await db
      .insert(lessonNotesTable)
      .values({ studentId: userId, lessonId, atSeconds, body })
      .returning();
    return res.json({ note });
  } catch (err) {
    req.log.error({ err }, "Failed to add note");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notes/:noteId", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const noteId = parseId(req.params.noteId);
    if (!noteId) return res.status(400).json({ error: "معرف الملاحظة غير صالح" });

    const body = String(req.body?.body ?? "").trim().slice(0, MAX_NOTE_LEN);
    if (!body) return res.status(400).json({ error: "الملاحظة فاضية." });

    const [note] = await db
      .update(lessonNotesTable)
      .set({ body, updatedAt: new Date() })
      .where(and(eq(lessonNotesTable.id, noteId), eq(lessonNotesTable.studentId, userId)))
      .returning();
    if (!note) return res.status(404).json({ error: "الملاحظة غير موجودة." });
    return res.json({ note });
  } catch (err) {
    req.log.error({ err }, "Failed to edit note");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/notes/:noteId", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;
    const noteId = parseId(req.params.noteId);
    if (!noteId) return res.status(400).json({ error: "معرف الملاحظة غير صالح" });

    await db.delete(lessonNotesTable).where(and(eq(lessonNotesTable.id, noteId), eq(lessonNotesTable.studentId, userId)));
    return res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete note");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Search (🔎) — lessons in the student's subscribed subjects ─────────────────

router.get("/search", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;

    const q = String(req.query?.q ?? "").trim();
    if (q.length < 2) return res.json({ lessons: [] });
    const like = `%${q}%`;

    const subs = await db
      .select({ subjectId: subjectSubscriptionsTable.subjectId })
      .from(subjectSubscriptionsTable)
      .where(and(eq(subjectSubscriptionsTable.studentId, userId), eq(subjectSubscriptionsTable.status, "active")));
    const subjectIds = [...new Set(subs.map((s) => s.subjectId))];
    if (subjectIds.length === 0) return res.json({ lessons: [] });

    const lessons = await db
      .select({
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
        lessonTitleEn: lessonsTable.titleEn,
        unitId: unitsTable.id,
        unitName: unitsTable.name,
        unitNameEn: unitsTable.nameEn,
        unitLabel: subjectsTable.unitLabel,
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        subjectNameEn: subjectsTable.nameEn,
        yearId: academicYearsTable.id,
        yearName: academicYearsTable.name,
        yearNameEn: academicYearsTable.nameEn,
        videoId: videosTable.id,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        instructor: videosTable.instructor,
      })
      .from(lessonsTable)
      .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
      .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
      .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(
        and(
          inArray(unitsTable.subjectId, subjectIds),
          eq(lessonsTable.isPublished, true),
          or(
            ilike(lessonsTable.title, like),
            ilike(sql`coalesce(${lessonsTable.titleEn}, '')`, like),
            ilike(unitsTable.name, like),
            ilike(subjectsTable.name, like),
          ),
        ),
      )
      .orderBy(asc(subjectsTable.orderIndex), asc(unitsTable.orderIndex), asc(lessonsTable.orderIndex))
      .limit(40);

    return res.json({ lessons });
  } catch (err) {
    req.log.error({ err }, "Failed to search");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Progress dashboard (📊) ────────────────────────────────────────────────────

router.get("/me/progress", async (req, res) => {
  try {
    const userId = await requireStudentId(req, res);
    if (userId == null) return;

    const gam = await getGamificationSummary(userId);

    const subs = await db
      .select({
        subjectId: subjectsTable.id,
        subjectName: subjectsTable.name,
        subjectNameEn: subjectsTable.nameEn,
        icon: subjectsTable.icon,
      })
      .from(subjectSubscriptionsTable)
      .innerJoin(subjectsTable, eq(subjectSubscriptionsTable.subjectId, subjectsTable.id))
      .where(and(eq(subjectSubscriptionsTable.studentId, userId), eq(subjectSubscriptionsTable.status, "active")))
      .orderBy(asc(subjectsTable.orderIndex), asc(subjectsTable.id));
    const subjectIds = [...new Set(subs.map((s) => s.subjectId))];

    type SubjRow = { subjectId: number; subjectName: string; subjectNameEn: string | null; icon: string; lessonCount: number; completedLessons: number; watchedSeconds: number; progressRatio: number };
    const bySubject = new Map<number, SubjRow>();
    for (const s of subs) {
      bySubject.set(s.subjectId, { subjectId: s.subjectId, subjectName: s.subjectName, subjectNameEn: s.subjectNameEn, icon: s.icon, lessonCount: 0, completedLessons: 0, watchedSeconds: 0, progressRatio: 0 });
    }

    let totalWatchedSeconds = 0;
    let totalLessons = 0;
    let totalCompleted = 0;

    if (subjectIds.length > 0) {
      const rows = await db
        .select({
          subjectId: subjectsTable.id,
          videoDuration: videosTable.duration,
          watchedRealSeconds: lessonWatchProgressTable.watchedSeconds,
          progressDuration: lessonWatchProgressTable.durationSeconds,
          completed: lessonWatchProgressTable.completed,
        })
        .from(lessonsTable)
        .innerJoin(unitsTable, and(eq(lessonsTable.unitId, unitsTable.id), eq(unitsTable.isPublished, true)))
        .innerJoin(subjectsTable, and(eq(unitsTable.subjectId, subjectsTable.id), eq(subjectsTable.isPublished, true)))
        .innerJoin(academicYearsTable, and(eq(subjectsTable.yearId, academicYearsTable.id), eq(academicYearsTable.isPublished, true)))
        .innerJoin(videosTable, and(eq(lessonsTable.videoId, videosTable.id), eq(videosTable.publishStatus, "published")))
        .leftJoin(lessonWatchProgressTable, and(eq(lessonWatchProgressTable.lessonId, lessonsTable.id), eq(lessonWatchProgressTable.studentId, userId)))
        .where(and(inArray(unitsTable.subjectId, subjectIds), eq(lessonsTable.isPublished, true)));

      for (const r of rows) {
        const subj = bySubject.get(r.subjectId);
        if (!subj) continue;
        const duration = Math.max(Number(r.videoDuration ?? 0) || 0, Number(r.progressDuration ?? 0) || 0);
        const cap = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
        const realWatched = Math.min(Number(r.watchedRealSeconds ?? 0) || 0, cap);
        const ratio = duration > 0 ? Math.min(1, realWatched / duration) : 0;
        const isCompleted = Boolean(r.completed) || ratio >= 0.9;
        subj.lessonCount += 1;
        subj.watchedSeconds += realWatched;
        if (isCompleted) subj.completedLessons += 1;
        totalLessons += 1;
        totalWatchedSeconds += realWatched;
        if (isCompleted) totalCompleted += 1;
      }
    }

    const subjects = [...bySubject.values()].map((s) => ({
      ...s,
      progressRatio: s.lessonCount > 0 ? Math.round((s.completedLessons / s.lessonCount) * 100) / 100 : 0,
    }));

    // Exam results: average % + count across lesson quizzes AND chapter exams.
    const [quizAgg] = await db
      .select({ avg: sql<number>`coalesce(avg(${quizAttemptsTable.percent}), 0)`, cnt: sql<number>`count(*)` })
      .from(quizAttemptsTable)
      .where(eq(quizAttemptsTable.userId, userId));
    const [examAgg] = await db
      .select({ avg: sql<number>`coalesce(avg(${unitExamAttemptsTable.percent}), 0)`, cnt: sql<number>`count(*)` })
      .from(unitExamAttemptsTable)
      .where(eq(unitExamAttemptsTable.userId, userId));
    const quizCnt = Number(quizAgg?.cnt ?? 0);
    const examCnt = Number(examAgg?.cnt ?? 0);
    const totalExamCnt = quizCnt + examCnt;
    const examAvg =
      totalExamCnt > 0
        ? Math.round((Number(quizAgg?.avg ?? 0) * quizCnt + Number(examAgg?.avg ?? 0) * examCnt) / totalExamCnt)
        : 0;

    return res.json({
      subjects,
      totals: {
        lessonCount: totalLessons,
        completedLessons: totalCompleted,
        watchedSeconds: totalWatchedSeconds,
        progressRatio: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) / 100 : 0,
      },
      streak: { current: gam.streak, best: gam.streakBest },
      points: { balance: gam.balance, totalEarned: gam.totalEarned },
      exams: { averagePercent: examAvg, attempts: totalExamCnt },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load progress");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
