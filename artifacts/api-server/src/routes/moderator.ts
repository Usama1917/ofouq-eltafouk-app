import { Router, type IRouter } from "express";
import { db, postsTable, commentsTable, reportsTable, postLikesTable, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";

const router: IRouter = Router();

const MODERATOR_ROLES = new Set(["admin", "owner", "moderator"]);

// Moderation actions (listing/deleting content, resolving reports) require an
// authenticated staff member. Returns the actor, or null after sending 401/403.
async function requireModerator(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [user] = await db
    // name is needed so resolvedBy can be attributed to the verified actor (review B-25).
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.status !== "active" || !MODERATOR_ROLES.has(user.role)) {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }
  return user;
}

// Any active, authenticated user (used for submitting a content report).
async function requireUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  return user;
}

// Posts
router.get("/moderator/posts", async (req, res) => {
  if (!(await requireModerator(req, res))) return;
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
  if (!(await requireModerator(req, res))) return;
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
  if (!(await requireModerator(req, res))) return;
  try {
    const comments = await db.select().from(commentsTable).orderBy(desc(commentsTable.createdAt));
    res.json(comments);
  } catch (err) {
    req.log.error({ err }, "Moderator list comments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/moderator/comments/:id", async (req, res) => {
  if (!(await requireModerator(req, res))) return;
  try {
    const id = parseInt(req.params.id);
    const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
    if (comment) {
      // review B-47: decrement atomically (clamped at 0) instead of read-then-write,
      // so concurrent deletes/inserts on the same post can't lose updates.
      await db
        .update(postsTable)
        .set({ commentsCount: sql`greatest(${postsTable.commentsCount} - 1, 0)` })
        .where(eq(postsTable.id, comment.postId));
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
  if (!(await requireModerator(req, res))) return;
  try {
    const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt));
    res.json(reports);
  } catch (err) {
    req.log.error({ err }, "Moderator list reports error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/moderator/reports", async (req, res) => {
  const actor = await requireUser(req, res);
  if (!actor) return;
  try {
    const { targetType, targetId, reason, description } = req.body;
    // targetId feeds a NOT-NULL integer column; targetType/reason are NOT-NULL
    // text. Reject bad input with 400 instead of letting it 500 at insert time.
    const parsedTargetId = Number.parseInt(targetId, 10);
    if (
      !Number.isInteger(parsedTargetId) || parsedTargetId <= 0 ||
      typeof targetType !== "string" || targetType.trim() === "" ||
      typeof reason !== "string" || reason.trim() === ""
    ) {
      return res.status(400).json({ error: "قيمة غير صالحة" });
    }
    // Attribute the report to the authenticated user, not a client-supplied value.
    const reportedBy = actor.name || `user:${actor.id}`;
    const [report] = await db.insert(reportsTable).values({ targetType: targetType.trim(), targetId: parsedTargetId, reason: reason.trim(), description, reportedBy, status: "pending" }).returning();
    res.status(201).json(report);
  } catch (err) {
    req.log.error({ err }, "Moderator create report error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/moderator/reports/:id", async (req, res) => {
  const actor = await requireModerator(req, res);
  if (!actor) return;
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    // review B-25: attribute the resolution to the verified actor, NOT a
    // client-supplied resolvedBy (which let a moderator forge who resolved a
    // report). Mirrors how reportedBy is set on create.
    const resolvedBy = actor.name || `user:${actor.id}`;
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
