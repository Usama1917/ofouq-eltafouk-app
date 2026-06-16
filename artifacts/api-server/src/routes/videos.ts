import { Router, type IRouter } from "express";
import {
  db,
  videosTable,
  lessonsTable,
  unitsTable,
  subjectsTable,
  academicYearsTable,
  usersTable,
  subjectSubscriptionsTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";

const router: IRouter = Router();

type SessionUser = {
  id: number;
  role: string;
  status: string;
};

// Loads the authenticated, active user (mirrors academic.ts getSessionUser).
// Returns null for anonymous, unknown, or inactive accounts.
async function getSessionUser(req: any): Promise<SessionUser | null> {
  const userId = getSessionUserId(req);
  if (!userId) return null;

  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.status !== "active") return null;
  return user;
}

function isPrivileged(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "owner";
}

// Subject ids the given student holds an ACTIVE subscription to, restricted to
// the candidate set. Mirrors academic.ts userHasSubjectAccess, batched for the
// list endpoint so we don't issue one query per video.
async function accessibleSubjectIds(userId: number, subjectIds: number[]): Promise<Set<number>> {
  if (subjectIds.length === 0) return new Set();
  const rows = await db
    .select({ subjectId: subjectSubscriptionsTable.subjectId })
    .from(subjectSubscriptionsTable)
    .where(
      and(
        eq(subjectSubscriptionsTable.studentId, userId),
        eq(subjectSubscriptionsTable.status, "active"),
        inArray(subjectSubscriptionsTable.subjectId, subjectIds),
      ),
    );
  return new Set(rows.map((r) => r.subjectId));
}

// review B-33: pagination bounds for the (previously unbounded) videos list.
const DEFAULT_VIDEOS_LIMIT = 50;
const MAX_VIDEOS_LIMIT = 100;

// Parse an optional non-negative integer query param, clamped to [0, max] with a
// fallback. Tolerates missing/garbage values so the list stays robust (review B-33).
function parseBoundedInt(value: unknown, fallback: number, max: number): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

router.get("/videos", async (req, res) => {
  try {
    // Paid lesson video URLs must never be served to anonymous callers.
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    }

    const { subject, search } = req.query as { subject?: string; search?: string };

    // review B-33: OPTIONAL limit/offset (defaults keep the response an array and
    // don't change the existing client contract); bounds the result set so the
    // endpoint can't return the whole table at scale.
    const limit = parseBoundedInt(req.query.limit, DEFAULT_VIDEOS_LIMIT, MAX_VIDEOS_LIMIT);
    const offset = parseBoundedInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);

    const filters = [
      eq(videosTable.publishStatus, "published"),
      eq(lessonsTable.isPublished, true),
      eq(unitsTable.isPublished, true),
      eq(subjectsTable.isPublished, true),
      eq(academicYearsTable.isPublished, true),
    ];

    if (subject) {
      filters.push(eq(videosTable.subject, subject));
    }
    if (search) {
      filters.push(ilike(videosTable.title, `%${search}%`));
    }

    const rows = await db
      .selectDistinct({
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        videoType: videosTable.videoType,
        publishStatus: videosTable.publishStatus,
        createdAt: videosTable.createdAt,
        // Owning subject id — used only for the access check below, not exposed.
        subjectId: subjectsTable.id,
      })
      .from(videosTable)
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(and(...filters))
      .orderBy(desc(videosTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Admins/owners see every URL. Students only see videoUrl for subjects they
    // hold an active subscription to; everyone else gets metadata without the URL.
    const privileged = isPrivileged(user);
    const accessible = privileged
      ? new Set<number>()
      : await accessibleSubjectIds(
          user.id,
          rows.map((r) => r.subjectId),
        );

    const videos = rows.map(({ subjectId, ...video }) => {
      if (privileged || accessible.has(subjectId)) return video;
      const { videoUrl: _omitted, ...withoutUrl } = video;
      return { ...withoutUrl, videoUrl: null };
    });

    return res.json(videos);
  } catch (err) {
    req.log.error({ err }, "Failed to list videos");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/videos/:id", async (req, res) => {
  try {
    // Paid lesson video URLs must never be served to anonymous callers.
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    }

    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "معرف الفيديو غير صالح" });
    }

    const [row] = await db
      .select({
        id: videosTable.id,
        title: videosTable.title,
        description: videosTable.description,
        subject: videosTable.subject,
        videoUrl: videosTable.videoUrl,
        thumbnailUrl: videosTable.thumbnailUrl,
        posterUrl: videosTable.posterUrl,
        duration: videosTable.duration,
        instructor: videosTable.instructor,
        videoType: videosTable.videoType,
        publishStatus: videosTable.publishStatus,
        createdAt: videosTable.createdAt,
        // Owning subject id — used only for the access check below, not exposed.
        subjectId: subjectsTable.id,
      })
      .from(videosTable)
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(
        and(
          eq(videosTable.id, id),
          eq(videosTable.publishStatus, "published"),
          eq(lessonsTable.isPublished, true),
          eq(unitsTable.isPublished, true),
          eq(subjectsTable.isPublished, true),
          eq(academicYearsTable.isPublished, true),
        ),
      )
      .limit(1);

    if (!row) return res.status(404).json({ error: "Video not found" });

    // Admins/owners always get the URL; students only if they hold an active
    // subscription to the video's subject. Otherwise return metadata with no URL.
    const { subjectId, ...video } = row;
    const canSeeUrl =
      isPrivileged(user) || (await accessibleSubjectIds(user.id, [subjectId])).has(subjectId);

    return res.json(canSeeUrl ? video : { ...video, videoUrl: null });
  } catch (err) {
    req.log.error({ err }, "Failed to get video");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/videos", async (_req, res) => {
  res.status(410).json({
    error: "إنشاء الفيديو المستقل متوقف. أضف الفيديو من داخل الدرس عبر /admin/academic.",
  });
});

export default router;
