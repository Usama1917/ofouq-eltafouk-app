import { Router, type IRouter } from "express";
import {
  db,
  supportConversationsTable,
  supportMessagesTable,
  usersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";

const router: IRouter = Router();

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;

  return parsePositiveInt(token.replace("session_", ""));
}

async function requireAuthenticatedUser(req: any, res: any) {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }

  return user;
}

async function requireAdmin(req: any, res: any) {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.role !== "admin" && user.role !== "owner") {
    res.status(403).json({ error: "هذا الإجراء متاح للمشرفين فقط" });
    return null;
  }

  return user;
}

async function getOrCreateConversation(userId: number) {
  const [existing] = await db
    .select()
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.userId, userId))
    .limit(1);

  if (existing) return existing;

  const now = new Date();
  const [created] = await db
    .insert(supportConversationsTable)
    .values({
      userId,
      status: "open",
      lastMessageAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

function normalizeMessageBody(value: unknown) {
  return String(value ?? "").trim().slice(0, 2000);
}

async function listConversationMessages(conversationId: number) {
  return db
    .select({
      id: supportMessagesTable.id,
      conversationId: supportMessagesTable.conversationId,
      senderId: supportMessagesTable.senderId,
      senderRole: supportMessagesTable.senderRole,
      body: supportMessagesTable.body,
      readAt: supportMessagesTable.readAt,
      createdAt: supportMessagesTable.createdAt,
    })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conversationId))
    .orderBy(asc(supportMessagesTable.createdAt), asc(supportMessagesTable.id));
}

router.get("/support/me", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const [conversation] = await db
      .select()
      .from(supportConversationsTable)
      .where(eq(supportConversationsTable.userId, user.id))
      .limit(1);

    if (!conversation) {
      res.json({ conversation: null, messages: [] });
      return;
    }

    const messages = await listConversationMessages(conversation.id);

    await db
      .update(supportMessagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(supportMessagesTable.conversationId, conversation.id),
          eq(supportMessagesTable.senderRole, "admin"),
          isNull(supportMessagesTable.readAt),
        ),
      );

    res.json({ conversation, messages });
  } catch (err) {
    req.log.error({ err }, "Failed to load support conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/support/me/messages", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const body = normalizeMessageBody(req.body?.body ?? req.body?.content ?? req.body?.message);
    if (!body) {
      res.status(400).json({ error: "نص الرسالة مطلوب" });
      return;
    }

    const now = new Date();
    const conversation = await getOrCreateConversation(user.id);

    const [message] = await db
      .insert(supportMessagesTable)
      .values({
        conversationId: conversation.id,
        senderId: user.id,
        senderRole: "user",
        body,
      })
      .returning();

    await db
      .update(supportConversationsTable)
      .set({ status: "open", lastMessageAt: now, updatedAt: now })
      .where(eq(supportConversationsTable.id, conversation.id));

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Failed to create support message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/support/conversations", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const conversations = await db
      .select({
        id: supportConversationsTable.id,
        status: supportConversationsTable.status,
        lastMessageAt: supportConversationsTable.lastMessageAt,
        createdAt: supportConversationsTable.createdAt,
        updatedAt: supportConversationsTable.updatedAt,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(supportConversationsTable)
      .innerJoin(usersTable, eq(supportConversationsTable.userId, usersTable.id))
      .orderBy(desc(supportConversationsTable.lastMessageAt), desc(supportConversationsTable.id));

    const enriched = await Promise.all(
      conversations.map(async (conversation) => {
        const [lastMessage] = await db
          .select({
            id: supportMessagesTable.id,
            body: supportMessagesTable.body,
            senderRole: supportMessagesTable.senderRole,
            createdAt: supportMessagesTable.createdAt,
          })
          .from(supportMessagesTable)
          .where(eq(supportMessagesTable.conversationId, conversation.id))
          .orderBy(desc(supportMessagesTable.createdAt), desc(supportMessagesTable.id))
          .limit(1);

        const [unread] = await db
          .select({ unreadCount: count() })
          .from(supportMessagesTable)
          .where(
            and(
              eq(supportMessagesTable.conversationId, conversation.id),
              eq(supportMessagesTable.senderRole, "user"),
              isNull(supportMessagesTable.readAt),
            ),
          );

        return {
          ...conversation,
          lastMessage: lastMessage ?? null,
          unreadCount: Number(unread?.unreadCount ?? 0),
        };
      }),
    );

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list support conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/support/conversations/:id/messages", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) {
      res.status(400).json({ error: "معرف المحادثة غير صالح" });
      return;
    }

    const [conversation] = await db
      .select({
        id: supportConversationsTable.id,
        status: supportConversationsTable.status,
        lastMessageAt: supportConversationsTable.lastMessageAt,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(supportConversationsTable)
      .innerJoin(usersTable, eq(supportConversationsTable.userId, usersTable.id))
      .where(eq(supportConversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "المحادثة غير موجودة" });
      return;
    }

    await db
      .update(supportMessagesTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(supportMessagesTable.conversationId, conversationId),
          eq(supportMessagesTable.senderRole, "user"),
          isNull(supportMessagesTable.readAt),
        ),
      );

    res.json({ conversation, messages: await listConversationMessages(conversationId) });
  } catch (err) {
    req.log.error({ err }, "Failed to load support messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/support/conversations/:id/messages", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const conversationId = parsePositiveInt(req.params.id);
    if (!conversationId) {
      res.status(400).json({ error: "معرف المحادثة غير صالح" });
      return;
    }

    const body = normalizeMessageBody(req.body?.body ?? req.body?.content ?? req.body?.message);
    if (!body) {
      res.status(400).json({ error: "نص الرسالة مطلوب" });
      return;
    }

    const [conversation] = await db
      .select({ id: supportConversationsTable.id })
      .from(supportConversationsTable)
      .where(eq(supportConversationsTable.id, conversationId))
      .limit(1);

    if (!conversation) {
      res.status(404).json({ error: "المحادثة غير موجودة" });
      return;
    }

    const now = new Date();
    const [message] = await db
      .insert(supportMessagesTable)
      .values({
        conversationId,
        senderId: admin.id,
        senderRole: "admin",
        body,
      })
      .returning();

    await db
      .update(supportConversationsTable)
      .set({ status: "open", lastMessageAt: now, updatedAt: now })
      .where(eq(supportConversationsTable.id, conversationId));

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Failed to create admin support reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
