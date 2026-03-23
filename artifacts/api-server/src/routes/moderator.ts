import { Router, type IRouter } from "express";
import { db, postsTable, commentsTable, reportsTable, postLikesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// Posts
router.get("/moderator/posts", async (req, res) => {
  try {
    const posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
    const postsWithLiked = posts.map(p => ({ ...p, isLiked: false }));
    res.json(postsWithLiked);
  } catch (err) {
    req.log.error({ err }, "Moderator list posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/moderator/posts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(postLikesTable).where(eq(postLikesTable.postId, id));
    await db.delete(commentsTable).where(eq(commentsTable.postId, id));
    await db.delete(postsTable).where(eq(postsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Moderator delete post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Comments
router.get("/moderator/comments", async (req, res) => {
  try {
    const comments = await db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt));
    res.json(comments);
  } catch (err) {
    req.log.error({ err }, "Moderator list comments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/moderator/comments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
    if (comment) {
      // Decrement post comment count
      const [post] = await db.select().from(postsTable).where(eq(postsTable.id, comment.postId));
      if (post && post.commentsCount > 0) {
        await db.update(postsTable).set({ commentsCount: post.commentsCount - 1 }).where(eq(postsTable.id, post.id));
      }
    }
    await db.delete(commentsTable).where(eq(commentsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Moderator delete comment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reports
router.get("/moderator/reports", async (req, res) => {
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    res.json(reports);
  } catch (err) {
    req.log.error({ err }, "Moderator list reports error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/moderator/reports", async (req, res) => {
  try {
    const { targetType, targetId, reason, description, reportedBy = "anonymous" } = req.body;
    const [report] = await db.insert(reportsTable).values({ targetType, targetId, reason, description, reportedBy, status: "pending" }).returning();
    res.status(201).json(report);
  } catch (err) {
    req.log.error({ err }, "Moderator create report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/moderator/reports/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, resolvedBy } = req.body;
    const [report] = await db.update(reportsTable)
      .set({ status, resolvedBy, resolvedAt: new Date() })
      .where(eq(reportsTable.id, id))
      .returning();
    if (!report) return res.status(404).json({ error: "Not found" });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "Moderator update report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
