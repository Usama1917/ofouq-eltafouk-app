import { Router, type IRouter } from "express";
import {
  db,
  videosTable,
  lessonsTable,
  unitsTable,
  subjectsTable,
  academicYearsTable,
} from "@workspace/db";
import { and, desc, eq, ilike } from "drizzle-orm";

const router: IRouter = Router();

router.get("/videos", async (req, res) => {
  try {
    const { subject, search } = req.query as { subject?: string; search?: string };

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

    const videos = await db
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
      })
      .from(videosTable)
      .innerJoin(lessonsTable, eq(lessonsTable.videoId, videosTable.id))
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(subjectsTable, eq(unitsTable.subjectId, subjectsTable.id))
      .innerJoin(academicYearsTable, eq(subjectsTable.yearId, academicYearsTable.id))
      .where(and(...filters))
      .orderBy(desc(videosTable.createdAt));

    res.json(videos);
  } catch (err) {
    req.log.error({ err }, "Failed to list videos");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/videos/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "معرف الفيديو غير صالح" });
    }

    const [video] = await db
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

    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json(video);
  } catch (err) {
    req.log.error({ err }, "Failed to get video");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/videos", async (_req, res) => {
  res.status(410).json({
    error: "إنشاء الفيديو المستقل متوقف. أضف الفيديو من داخل الدرس عبر /admin/academic.",
  });
});

export default router;
