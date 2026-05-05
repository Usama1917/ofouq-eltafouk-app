import { Router, type IRouter } from "express";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { and, count, desc, eq, isNull, lte } from "drizzle-orm";

const router: IRouter = Router();

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;

  const userId = parsePositiveInt(token.replace("session_", ""));
  return userId ?? null;
}

async function requireAuthenticatedUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }

  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }

  return user;
}

async function getUnreadCount(userId: number) {
  const now = new Date();
  const [summary] = await db
    .select({ unreadCount: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        isNull(notificationsTable.readAt),
        lte(notificationsTable.availableAt, now),
      ),
    );

  return Number(summary?.unreadCount ?? 0);
}

router.get("/notifications/summary", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    res.json({ unreadCount: await getUnreadCount(user.id) });
  } catch (err) {
    req.log.error({ err }, "Failed to load notification summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/notifications", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const now = new Date();
    const limit = Math.min(100, Math.max(1, parsePositiveInt(String(req.query.limit ?? "50")) ?? 50));
    const items = await db
      .select({
        id: notificationsTable.id,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        tone: notificationsTable.tone,
        actionUrl: notificationsTable.actionUrl,
        data: notificationsTable.data,
        availableAt: notificationsTable.availableAt,
        readAt: notificationsTable.readAt,
        createdAt: notificationsTable.createdAt,
      })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, user.id), lte(notificationsTable.availableAt, now)))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(limit);

    res.json({
      items,
      unreadCount: await getUnreadCount(user.id),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const notificationId = parsePositiveInt(req.params.id);
    if (!notificationId) {
      res.status(400).json({ error: "معرف الإشعار غير صالح" });
      return;
    }

    const [updated] = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, user.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "الإشعار غير موجود" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const now = new Date();
    await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          isNull(notificationsTable.readAt),
          lte(notificationsTable.availableAt, now),
        ),
      );

    res.json({ success: true, unreadCount: 0 });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications read");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
