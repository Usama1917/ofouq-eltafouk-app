import { Router, type IRouter } from "express";
import { db, postsTable, commentsTable, postLikesTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getSessionUserId } from "../lib/auth";

const router: IRouter = Router();

const STAFF_ROLES = new Set(["admin", "owner", "moderator"]);

// Authenticated, active user (identity is taken from the verified token, never
// from the request body, so a caller can't impersonate another author).
async function requireUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  return user;
}

router.get("/posts", async (req, res) => {
  try {
    const posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
    const postsWithLiked = posts.map(p => ({ ...p, isLiked: false }));
    res.json(postsWithLiked);
  } catch (err) {
    req.log.error({ err }, "Failed to list posts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const { content } = req.body;
    if (!content || !String(content).trim()) return res.status(400).json({ error: "المحتوى مطلوب" });
    // Author is the authenticated user — not a client-supplied name/avatar.
    const [post] = await db.insert(postsTable).values({ content: String(content), authorName: user.name, authorAvatar: user.avatarUrl }).returning();
    res.status(201).json({ ...post, isLiked: false });
  } catch (err) {
    req.log.error({ err }, "Failed to create post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/posts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
    if (!post) return res.status(404).json({ error: "Post not found" });
    res.json({ ...post, isLiked: false });
  } catch (err) {
    req.log.error({ err }, "Failed to get post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/posts/:id", async (req, res) => {
  // Posts carry no author id, so ownership can't be verified — limit deletion to staff.
  const user = await requireUser(req, res);
  if (!user) return;
  if (!STAFF_ROLES.has(user.role)) return res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
  try {
    const id = parseInt(req.params.id);
    await db.delete(postLikesTable).where(eq(postLikesTable.postId, id));
    await db.delete(commentsTable).where(eq(commentsTable.postId, id));
    await db.delete(postsTable).where(eq(postsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts/:id/like", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const postId = parseInt(req.params.id);
    // Tie the like to the authenticated user, not a spoofable client header.
    const sessionId = `user:${user.id}`;

    const [existingLike] = await db.select().from(postLikesTable).where(
      and(eq(postLikesTable.postId, postId), eq(postLikesTable.sessionId, sessionId))
    );

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    if (!post) return res.status(404).json({ error: "Post not found" });

    let liked: boolean;
    let newCount: number;

    if (existingLike) {
      await db.delete(postLikesTable).where(eq(postLikesTable.id, existingLike.id));
      newCount = Math.max(0, post.likesCount - 1);
      liked = false;
    } else {
      await db.insert(postLikesTable).values({ postId, sessionId });
      newCount = post.likesCount + 1;
      liked = true;
    }

    await db.update(postsTable).set({ likesCount: newCount }).where(eq(postsTable.id, postId));
    res.json({ liked, likesCount: newCount });
  } catch (err) {
    req.log.error({ err }, "Failed to like post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/posts/:id/comments", async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const comments = await db.select().from(commentsTable).where(eq(commentsTable.postId, postId)).orderBy(desc(commentsTable.createdAt));
    res.json(comments);
  } catch (err) {
    req.log.error({ err }, "Failed to list comments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts/:id/comments", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const postId = parseInt(req.params.id);
    const { content } = req.body;
    if (!content || !String(content).trim()) return res.status(400).json({ error: "المحتوى مطلوب" });
    const [comment] = await db.insert(commentsTable).values({ postId, content: String(content), authorName: user.name, authorAvatar: user.avatarUrl }).returning();

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    if (post) {
      await db.update(postsTable).set({ commentsCount: post.commentsCount + 1 }).where(eq(postsTable.id, postId));
    }

    res.status(201).json(comment);
  } catch (err) {
    req.log.error({ err }, "Failed to create comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
