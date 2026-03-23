import { Router, type IRouter } from "express";
import { db, videosTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";

const router: IRouter = Router();

router.get("/videos", async (req, res) => {
  try {
    const { subject, search } = req.query as { subject?: string; search?: string };
    let videos;
    if (subject) {
      videos = await db.select().from(videosTable).where(eq(videosTable.subject, subject));
    } else if (search) {
      videos = await db.select().from(videosTable).where(ilike(videosTable.title, `%${search}%`));
    } else {
      videos = await db.select().from(videosTable);
    }
    res.json(videos);
  } catch (err) {
    req.log.error({ err }, "Failed to list videos");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/videos", async (req, res) => {
  try {
    const [video] = await db.insert(videosTable).values(req.body).returning();
    res.status(201).json(video);
  } catch (err) {
    req.log.error({ err }, "Failed to create video");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/videos/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [video] = await db.select().from(videosTable).where(eq(videosTable.id, id));
    if (!video) return res.status(404).json({ error: "Video not found" });
    res.json(video);
  } catch (err) {
    req.log.error({ err }, "Failed to get video");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
