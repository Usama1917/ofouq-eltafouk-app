import { Router, type IRouter } from "express";
import { db, postsTable, commentsTable, postLikesTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
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

// review B-45: this feed is intentionally PUBLIC (no auth gate). Use an explicit
// column projection instead of select() so we never leak columns the client
// doesn't need if the table grows new (possibly sensitive) fields later.
const POST_COLUMNS = {
  id: postsTable.id,
  content: postsTable.content,
  authorName: postsTable.authorName,
  authorAvatar: postsTable.authorAvatar,
  likesCount: postsTable.likesCount,
  commentsCount: postsTable.commentsCount,
  createdAt: postsTable.createdAt,
} as const;

const COMMENT_COLUMNS = {
  id: commentsTable.id,
  postId: commentsTable.postId,
  content: commentsTable.content,
  authorName: commentsTable.authorName,
  authorAvatar: commentsTable.authorAvatar,
  createdAt: commentsTable.createdAt,
} as const;

router.get("/posts", async (req, res) => {
  try {
    // review B-45: explicit projection on a public endpoint.
    const posts = await db.select(POST_COLUMNS).from(postsTable).orderBy(desc(postsTable.createdAt));
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

    // review B-18: a concurrent double-tap previously ran read-modify-write on
    // likesCount and could double-count or skip the unique like. We now rely on
    // the UNIQUE(post_id, session_id) constraint and only mutate the counter
    // when a row was actually inserted/deleted, bumping it atomically in SQL.
    const wasLiked = await db.select({ id: postLikesTable.id }).from(postLikesTable).where(
      and(eq(postLikesTable.postId, postId), eq(postLikesTable.sessionId, sessionId)),
    ).limit(1);

    let liked: boolean;
    let updatedPost: { likesCount: number } | undefined;

    if (wasLiked.length > 0) {
      // Unlike: delete the row; only decrement (clamped at 0) if we removed one.
      const deleted = await db
        .delete(postLikesTable)
        .where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.sessionId, sessionId)))
        .returning({ id: postLikesTable.id });
      liked = false;
      if (deleted.length > 0) {
        [updatedPost] = await db
          .update(postsTable)
          .set({ likesCount: sql`greatest(${postsTable.likesCount} - 1, 0)` })
          .where(eq(postsTable.id, postId))
          .returning({ likesCount: postsTable.likesCount });
      }
    } else {
      // Like: insert-or-ignore; only increment if this insert actually created a row.
      const inserted = await db
        .insert(postLikesTable)
        .values({ postId, sessionId })
        .onConflictDoNothing()
        .returning({ id: postLikesTable.id });
      liked = true;
      if (inserted.length > 0) {
        [updatedPost] = await db
          .update(postsTable)
          .set({ likesCount: sql`${postsTable.likesCount} + 1` })
          .where(eq(postsTable.id, postId))
          .returning({ likesCount: postsTable.likesCount });
      }
    }

    // If the counter wasn't touched (no-op toggle) or the post is gone, read the
    // current count so the client still gets an accurate value.
    let likesCount = updatedPost?.likesCount;
    if (likesCount === undefined) {
      const [post] = await db.select({ likesCount: postsTable.likesCount }).from(postsTable).where(eq(postsTable.id, postId)).limit(1);
      if (!post) return res.status(404).json({ error: "Post not found" });
      likesCount = post.likesCount;
    }

    res.json({ liked, likesCount });
  } catch (err) {
    req.log.error({ err }, "Failed to like post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/posts/:id/comments", async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    // review B-45: intentionally PUBLIC; explicit projection (no select()).
    const comments = await db.select(COMMENT_COLUMNS).from(commentsTable).where(eq(commentsTable.postId, postId)).orderBy(desc(commentsTable.createdAt));
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

    // review B-47: atomic increment instead of read-then-write (avoids lost
    // updates when comments are posted concurrently on the same post).
    await db.update(postsTable).set({ commentsCount: sql`${postsTable.commentsCount} + 1` }).where(eq(postsTable.id, postId));

    res.status(201).json(comment);
  } catch (err) {
    req.log.error({ err }, "Failed to create comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
