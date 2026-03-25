import { Router, type IRouter } from "express";
import {
  db,
  academicYearsTable,
  subjectsTable,
  contentProvidersTable,
  unitsTable,
  lessonsTable,
  videosTable,
} from "@workspace/db";
import { eq, asc, and, isNull, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

// ── Public routes (student/teacher browsing, published only) ──────────────

router.get("/academic/years", async (req, res) => {
  try {
    const years = await db
      .select()
      .from(academicYearsTable)
      .where(eq(academicYearsTable.isPublished, true))
      .orderBy(asc(academicYearsTable.orderIndex));
    res.json(years);
  } catch (err) {
    req.log.error({ err }, "Failed to list academic years");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/years/:yearId/subjects", async (req, res) => {
  try {
    const yearId = parseInt(req.params.yearId);
    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(and(eq(subjectsTable.yearId, yearId), eq(subjectsTable.isPublished, true)))
      .orderBy(asc(subjectsTable.orderIndex));
    res.json(subjects);
  } catch (err) {
    req.log.error({ err }, "Failed to list subjects");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/subjects/:subjectId/providers", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const providers = await db
      .select()
      .from(contentProvidersTable)
      .where(and(eq(contentProvidersTable.subjectId, subjectId), eq(contentProvidersTable.isPublished, true)))
      .orderBy(asc(contentProvidersTable.orderIndex));
    res.json(providers);
  } catch (err) {
    req.log.error({ err }, "Failed to list providers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/subjects/:subjectId/units", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const units = await db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.subjectId, subjectId), isNull(unitsTable.providerId), eq(unitsTable.isPublished, true)))
      .orderBy(asc(unitsTable.orderIndex));
    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list units");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/providers/:providerId/units", async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId);
    const units = await db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.providerId, providerId), eq(unitsTable.isPublished, true)))
      .orderBy(asc(unitsTable.orderIndex));
    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list provider units");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/units/:unitId/lessons", async (req, res) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const lessons = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        title: lessonsTable.title,
        description: lessonsTable.description,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
        },
      })
      .from(lessonsTable)
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(and(eq(lessonsTable.unitId, unitId), eq(lessonsTable.isPublished, true)))
      .orderBy(asc(lessonsTable.orderIndex));
    res.json(lessons);
  } catch (err) {
    req.log.error({ err }, "Failed to list lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/academic/lessons/:lessonId", async (req, res) => {
  try {
    const lessonId = parseInt(req.params.lessonId);
    const [lesson] = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        title: lessonsTable.title,
        description: lessonsTable.description,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
        },
      })
      .from(lessonsTable)
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(and(eq(lessonsTable.id, lessonId), eq(lessonsTable.isPublished, true)));
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    res.json(lesson);
  } catch (err) {
    req.log.error({ err }, "Failed to get lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Admin routes (full CRUD) ──────────────────────────────────────────────

// Academic Years
router.get("/admin/academic/years", async (req, res) => {
  try {
    const years = await db
      .select()
      .from(academicYearsTable)
      .orderBy(asc(academicYearsTable.orderIndex));
    res.json(years);
  } catch (err) {
    req.log.error({ err }, "Failed to list academic years (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/years", async (req, res) => {
  try {
    const { name, description = "", orderIndex = 0, isPublished = false } = req.body;
    const [year] = await db.insert(academicYearsTable).values({ name, description, orderIndex, isPublished }).returning();
    res.status(201).json(year);
  } catch (err) {
    req.log.error({ err }, "Failed to create academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/years/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, orderIndex, isPublished } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    const [year] = await db.update(academicYearsTable).set(updateData).where(eq(academicYearsTable.id, id)).returning();
    if (!year) return res.status(404).json({ error: "Not found" });
    res.json(year);
  } catch (err) {
    req.log.error({ err }, "Failed to update academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/years/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(academicYearsTable).where(eq(academicYearsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete academic year");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/years/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(
      items.map(({ id, orderIndex }) =>
        db.update(academicYearsTable).set({ orderIndex }).where(eq(academicYearsTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder academic years");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Subjects
router.get("/admin/academic/years/:yearId/subjects", async (req, res) => {
  try {
    const yearId = parseInt(req.params.yearId);
    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(eq(subjectsTable.yearId, yearId))
      .orderBy(asc(subjectsTable.orderIndex));
    res.json(subjects);
  } catch (err) {
    req.log.error({ err }, "Failed to list subjects (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/years/:yearId/subjects", async (req, res) => {
  try {
    const yearId = parseInt(req.params.yearId);
    const { name, icon = "📚", description = "", hasProviders = false, orderIndex = 0, isPublished = false } = req.body;
    const [subject] = await db.insert(subjectsTable).values({ yearId, name, icon, description, hasProviders, orderIndex, isPublished }).returning();
    res.status(201).json(subject);
  } catch (err) {
    req.log.error({ err }, "Failed to create subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/subjects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, icon, description, hasProviders, orderIndex, isPublished } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (description !== undefined) updateData.description = description;
    if (hasProviders !== undefined) updateData.hasProviders = hasProviders;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    const [subject] = await db.update(subjectsTable).set(updateData).where(eq(subjectsTable.id, id)).returning();
    if (!subject) return res.status(404).json({ error: "Not found" });
    res.json(subject);
  } catch (err) {
    req.log.error({ err }, "Failed to update subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/subjects/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(subjectsTable).where(eq(subjectsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete subject");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/subjects/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(
      items.map(({ id, orderIndex }) =>
        db.update(subjectsTable).set({ orderIndex }).where(eq(subjectsTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder subjects");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Content Providers
router.get("/admin/academic/subjects/:subjectId/providers", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const providers = await db
      .select()
      .from(contentProvidersTable)
      .where(eq(contentProvidersTable.subjectId, subjectId))
      .orderBy(asc(contentProvidersTable.orderIndex));
    res.json(providers);
  } catch (err) {
    req.log.error({ err }, "Failed to list providers (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/subjects/:subjectId/providers", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const { name, description = "", logoUrl, orderIndex = 0, isPublished = false } = req.body;
    const [provider] = await db.insert(contentProvidersTable).values({ subjectId, name, description, logoUrl, orderIndex, isPublished }).returning();
    res.status(201).json(provider);
  } catch (err) {
    req.log.error({ err }, "Failed to create provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/providers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, logoUrl, orderIndex, isPublished } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    const [provider] = await db.update(contentProvidersTable).set(updateData).where(eq(contentProvidersTable.id, id)).returning();
    if (!provider) return res.status(404).json({ error: "Not found" });
    res.json(provider);
  } catch (err) {
    req.log.error({ err }, "Failed to update provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/providers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(contentProvidersTable).where(eq(contentProvidersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete provider");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/providers/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(
      items.map(({ id, orderIndex }) =>
        db.update(contentProvidersTable).set({ orderIndex }).where(eq(contentProvidersTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder providers");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Units
router.get("/admin/academic/subjects/:subjectId/units", async (req, res) => {
  try {
    const subjectId = parseInt(req.params.subjectId);
    const units = await db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.subjectId, subjectId), isNull(unitsTable.providerId)))
      .orderBy(asc(unitsTable.orderIndex));
    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list subject units (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/academic/providers/:providerId/units", async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId);
    const units = await db
      .select()
      .from(unitsTable)
      .where(eq(unitsTable.providerId, providerId))
      .orderBy(asc(unitsTable.orderIndex));
    res.json(units);
  } catch (err) {
    req.log.error({ err }, "Failed to list provider units (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/units", async (req, res) => {
  try {
    const { subjectId, providerId, name, description = "", orderIndex = 0, isPublished = false } = req.body;
    const [unit] = await db.insert(unitsTable).values({
      subjectId: subjectId ?? null,
      providerId: providerId ?? null,
      name,
      description,
      orderIndex,
      isPublished,
    }).returning();
    res.status(201).json(unit);
  } catch (err) {
    req.log.error({ err }, "Failed to create unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/units/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, orderIndex, isPublished } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    const [unit] = await db.update(unitsTable).set(updateData).where(eq(unitsTable.id, id)).returning();
    if (!unit) return res.status(404).json({ error: "Not found" });
    res.json(unit);
  } catch (err) {
    req.log.error({ err }, "Failed to update unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/units/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(unitsTable).where(eq(unitsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete unit");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/units/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(
      items.map(({ id, orderIndex }) =>
        db.update(unitsTable).set({ orderIndex }).where(eq(unitsTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder units");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Lessons
router.get("/admin/academic/units/:unitId/lessons", async (req, res) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const lessons = await db
      .select({
        id: lessonsTable.id,
        unitId: lessonsTable.unitId,
        title: lessonsTable.title,
        description: lessonsTable.description,
        videoId: lessonsTable.videoId,
        orderIndex: lessonsTable.orderIndex,
        isPublished: lessonsTable.isPublished,
        createdAt: lessonsTable.createdAt,
        video: {
          id: videosTable.id,
          title: videosTable.title,
          videoUrl: videosTable.videoUrl,
          thumbnailUrl: videosTable.thumbnailUrl,
          duration: videosTable.duration,
          instructor: videosTable.instructor,
        },
      })
      .from(lessonsTable)
      .leftJoin(videosTable, eq(lessonsTable.videoId, videosTable.id))
      .where(eq(lessonsTable.unitId, unitId))
      .orderBy(asc(lessonsTable.orderIndex));
    res.json(lessons);
  } catch (err) {
    req.log.error({ err }, "Failed to list lessons (admin)");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/academic/units/:unitId/lessons", async (req, res) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const { title, description = "", videoId, orderIndex = 0, isPublished = false } = req.body;
    const [lesson] = await db.insert(lessonsTable).values({
      unitId,
      title,
      description,
      videoId: videoId ?? null,
      orderIndex,
      isPublished,
    }).returning();
    res.status(201).json(lesson);
  } catch (err) {
    req.log.error({ err }, "Failed to create lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/academic/lessons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, videoId, orderIndex, isPublished } = req.body;
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (videoId !== undefined) updateData.videoId = videoId;
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    const [lesson] = await db.update(lessonsTable).set(updateData).where(eq(lessonsTable.id, id)).returning();
    if (!lesson) return res.status(404).json({ error: "Not found" });
    res.json(lesson);
  } catch (err) {
    req.log.error({ err }, "Failed to update lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/academic/lessons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(lessonsTable).where(eq(lessonsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete lesson");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/academic/lessons/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items: { id: number; orderIndex: number }[] };
    await Promise.all(
      items.map(({ id, orderIndex }) =>
        db.update(lessonsTable).set({ orderIndex }).where(eq(lessonsTable.id, id))
      )
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder lessons");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
