import { Router, type IRouter } from "express";
import {
  db,
  supportAutomaticMessagesTable,
  notificationsTable,
  supportConversationsTable,
  supportMessagesTable,
  usersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, ilike, inArray, isNull, lte } from "drizzle-orm";
import { sendPushNotificationToUser } from "../lib/push-notifications";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const HOTLINE_NUMBER = "17057";
const HOTLINE_FOLLOW_UP_AUTOMATION_KEY = "hotline_17057_follow_up";
const HOTLINE_FOLLOW_UP_MESSAGE = "هل حصلت على ما تريد من ممثلي خدمة العملاء لـ 17057؟";
const HOTLINE_FOLLOW_UP_DELAY_MS = 10 * 60 * 1000;
const SUPPORT_AUTOMATION_POLL_INTERVAL_MS = 30 * 1000;

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

function notificationPreview(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

async function createSupportReplyNotification(args: {
  userId: number;
  conversationId: number;
  messageId: number;
  body: string;
}) {
  const title = "رد جديد من دعم التطبيق";
  const body = notificationPreview(args.body) || "لديك رد جديد من فريق الدعم.";
  const data = {
    route: "supportChat",
    conversationId: args.conversationId,
    messageId: args.messageId,
  };

  const [notification] = await db.insert(notificationsTable).values({
    userId: args.userId,
    type: "support_reply",
    title,
    body,
    tone: "primary",
    actionUrl: "/(tabs)/settings/support-chat",
    data,
    dedupeKey: `support-reply:${args.messageId}`,
  }).returning({ id: notificationsTable.id });

  await sendPushNotificationToUser({
    userId: args.userId,
    title,
    body,
    data: {
      ...data,
      type: "support_reply",
      notificationId: notification?.id,
    },
  });
}

async function sendAutomaticSupportMessage(job: typeof supportAutomaticMessagesTable.$inferSelect) {
  const now = new Date();
  const [claimed] = await db
    .update(supportAutomaticMessagesTable)
    .set({ status: "processing", updatedAt: now })
    .where(and(
      eq(supportAutomaticMessagesTable.id, job.id),
      eq(supportAutomaticMessagesTable.status, "scheduled"),
    ))
    .returning();

  if (!claimed) return;

  try {
    const conversation = claimed.conversationId
      ? { id: claimed.conversationId }
      : await getOrCreateConversation(claimed.userId);

    const [message] = await db
      .insert(supportMessagesTable)
      .values({
        conversationId: conversation.id,
        senderId: null,
        senderRole: "admin",
        body: claimed.body,
        source: "automatic",
        automationKey: claimed.automationKey,
      })
      .returning();

    await db
      .update(supportConversationsTable)
      .set({ status: "open", lastMessageAt: now, updatedAt: now })
      .where(eq(supportConversationsTable.id, conversation.id));

    await db
      .update(supportAutomaticMessagesTable)
      .set({
        status: "sent",
        conversationId: conversation.id,
        messageId: message.id,
        sentAt: now,
        updatedAt: now,
      })
      .where(eq(supportAutomaticMessagesTable.id, claimed.id));

    await createSupportReplyNotification({
      userId: claimed.userId,
      conversationId: conversation.id,
      messageId: message.id,
      body: claimed.body,
    });
  } catch (err) {
    await db
      .update(supportAutomaticMessagesTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(supportAutomaticMessagesTable.id, claimed.id))
      .catch(() => undefined);
    throw err;
  }
}

let supportAutomationWorkerStarted = false;
let supportAutomationWorkerBusy = false;

async function processDueAutomaticSupportMessages() {
  if (supportAutomationWorkerBusy) return;

  supportAutomationWorkerBusy = true;
  try {
    const now = new Date();
    const dueJobs = await db
      .select()
      .from(supportAutomaticMessagesTable)
      .where(and(
        eq(supportAutomaticMessagesTable.status, "scheduled"),
        lte(supportAutomaticMessagesTable.scheduledAt, now),
      ))
      .orderBy(asc(supportAutomaticMessagesTable.scheduledAt), asc(supportAutomaticMessagesTable.id))
      .limit(25);

    for (const job of dueJobs) {
      await sendAutomaticSupportMessage(job).catch((err) => {
        logger.warn({ err, jobId: job.id }, "Failed to send automatic support message");
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to process due automatic support messages");
  } finally {
    supportAutomationWorkerBusy = false;
  }
}

function startSupportAutomationWorker() {
  if (supportAutomationWorkerStarted) return;

  supportAutomationWorkerStarted = true;
  const run = () => {
    void processDueAutomaticSupportMessages();
  };
  const startupTimer = setTimeout(run, 5000);
  const interval = setInterval(run, SUPPORT_AUTOMATION_POLL_INTERVAL_MS);
  startupTimer.unref?.();
  interval.unref?.();
}

async function listConversationMessages(conversationId: number) {
  return db
    .select({
      id: supportMessagesTable.id,
      conversationId: supportMessagesTable.conversationId,
      senderId: supportMessagesTable.senderId,
      senderRole: supportMessagesTable.senderRole,
      body: supportMessagesTable.body,
      source: supportMessagesTable.source,
      automationKey: supportMessagesTable.automationKey,
      readAt: supportMessagesTable.readAt,
      createdAt: supportMessagesTable.createdAt,
    })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conversationId))
    .orderBy(asc(supportMessagesTable.createdAt), asc(supportMessagesTable.id));
}

async function refreshConversationLastMessageAt(conversationId: number) {
  const [lastMessage] = await db
    .select({ createdAt: supportMessagesTable.createdAt })
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, conversationId))
    .orderBy(desc(supportMessagesTable.createdAt), desc(supportMessagesTable.id))
    .limit(1);

  const [conversation] = await db
    .select({ createdAt: supportConversationsTable.createdAt })
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.id, conversationId))
    .limit(1);

  await db
    .update(supportConversationsTable)
    .set({
      lastMessageAt: lastMessage?.createdAt ?? conversation?.createdAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(supportConversationsTable.id, conversationId));
}

async function markAutomaticSupportReportsReviewed(conversationId: number) {
  await db
    .update(supportAutomaticMessagesTable)
    .set({ status: "reviewed", updatedAt: new Date() })
    .where(and(
      eq(supportAutomaticMessagesTable.conversationId, conversationId),
      eq(supportAutomaticMessagesTable.status, "sent"),
    ));
}

router.get("/support/me", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const readAt = new Date();
    await db
      .update(notificationsTable)
      .set({ readAt })
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.type, "support_reply"),
          isNull(notificationsTable.readAt),
        ),
      );

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
      .set({ readAt })
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

router.get("/support/me/unread-count", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const [conversation] = await db
      .select({ id: supportConversationsTable.id })
      .from(supportConversationsTable)
      .where(eq(supportConversationsTable.userId, user.id))
      .limit(1);

    if (!conversation) {
      res.json({ unreadCount: 0 });
      return;
    }

    const [unread] = await db
      .select({ unreadCount: count() })
      .from(supportMessagesTable)
      .where(
        and(
          eq(supportMessagesTable.conversationId, conversation.id),
          eq(supportMessagesTable.senderRole, "admin"),
          isNull(supportMessagesTable.readAt),
        ),
      );

    res.json({ unreadCount: Number(unread?.unreadCount ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to load support unread count");
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

router.post("/support/hotline-call", async (req, res) => {
  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const hotlineNumber = String(req.body?.hotlineNumber ?? HOTLINE_NUMBER).trim() || HOTLINE_NUMBER;
    const conversation = await getOrCreateConversation(user.id);
    const [pendingJob] = await db
      .select()
      .from(supportAutomaticMessagesTable)
      .where(and(
        eq(supportAutomaticMessagesTable.userId, user.id),
        eq(supportAutomaticMessagesTable.automationKey, HOTLINE_FOLLOW_UP_AUTOMATION_KEY),
        eq(supportAutomaticMessagesTable.status, "scheduled"),
      ))
      .orderBy(desc(supportAutomaticMessagesTable.createdAt), desc(supportAutomaticMessagesTable.id))
      .limit(1);

    if (pendingJob) {
      res.status(200).json(pendingJob);
      return;
    }

    const now = new Date();
    const scheduledAt = new Date(now.getTime() + HOTLINE_FOLLOW_UP_DELAY_MS);
    const [job] = await db
      .insert(supportAutomaticMessagesTable)
      .values({
        userId: user.id,
        conversationId: conversation.id,
        automationKey: HOTLINE_FOLLOW_UP_AUTOMATION_KEY,
        triggerLabel: `مكالمة الخط الساخن ${hotlineNumber}`,
        body: HOTLINE_FOLLOW_UP_MESSAGE,
        status: "scheduled",
        scheduledAt,
        updatedAt: now,
      })
      .returning();

    res.status(202).json(job);
  } catch (err) {
    req.log.error({ err }, "Failed to schedule hotline follow up");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/support/conversations", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const searchTerm = normalizeMessageBody(req.query?.q).slice(0, 160);
    const normalizedSearchTerm = searchTerm.toLowerCase();
    const matchingMessageConversationIds = new Set<number>();

    if (searchTerm) {
      const messageMatches = await db
        .select({ conversationId: supportMessagesTable.conversationId })
        .from(supportMessagesTable)
        .where(ilike(supportMessagesTable.body, `%${searchTerm}%`))
        .limit(500);

      for (const item of messageMatches) {
        matchingMessageConversationIds.add(item.conversationId);
      }
    }

    let conversations = await db
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

    if (searchTerm) {
      conversations = conversations.filter((conversation) => (
        conversation.user.name.toLowerCase().includes(normalizedSearchTerm)
        || conversation.user.email.toLowerCase().includes(normalizedSearchTerm)
        || matchingMessageConversationIds.has(conversation.id)
      ));
    }

    const enriched = await Promise.all(
      conversations.map(async (conversation) => {
        const [lastMessage] = await db
          .select({
            id: supportMessagesTable.id,
            body: supportMessagesTable.body,
            senderRole: supportMessagesTable.senderRole,
            source: supportMessagesTable.source,
            automationKey: supportMessagesTable.automationKey,
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

router.post("/admin/support/conversations/open", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const userId = parsePositiveInt(String(req.body?.userId ?? ""));
    if (!userId) {
      res.status(400).json({ error: "معرف الطالب غير صالح" });
      return;
    }

    const [targetUser] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!targetUser) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    const conversation = await getOrCreateConversation(targetUser.id);

    res.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        user: targetUser,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to open support conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/support/automatic-messages", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const reports = await db
      .select({
        id: supportAutomaticMessagesTable.id,
        conversationId: supportAutomaticMessagesTable.conversationId,
        messageId: supportAutomaticMessagesTable.messageId,
        automationKey: supportAutomaticMessagesTable.automationKey,
        triggerLabel: supportAutomaticMessagesTable.triggerLabel,
        body: supportAutomaticMessagesTable.body,
        status: supportAutomaticMessagesTable.status,
        scheduledAt: supportAutomaticMessagesTable.scheduledAt,
        sentAt: supportAutomaticMessagesTable.sentAt,
        createdAt: supportAutomaticMessagesTable.createdAt,
        user: {
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          phone: usersTable.phone,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(supportAutomaticMessagesTable)
      .innerJoin(usersTable, eq(supportAutomaticMessagesTable.userId, usersTable.id))
      .where(eq(supportAutomaticMessagesTable.status, "sent"))
      .orderBy(desc(supportAutomaticMessagesTable.sentAt), desc(supportAutomaticMessagesTable.id))
      .limit(200);

    res.json(reports);
  } catch (err) {
    req.log.error({ err }, "Failed to list automatic support messages");
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

    await markAutomaticSupportReportsReviewed(conversationId);

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
      .select({
        id: supportConversationsTable.id,
        userId: supportConversationsTable.userId,
      })
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

    await createSupportReplyNotification({
      userId: conversation.userId,
      conversationId,
      messageId: message.id,
      body,
    }).catch((err) => {
      req.log.warn({ err, conversationId, messageId: message.id }, "Failed to create support reply notification");
    });

    res.status(201).json(message);
  } catch (err) {
    req.log.error({ err }, "Failed to create admin support reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/support/messages/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const messageId = parsePositiveInt(req.params.id);
    if (!messageId) {
      res.status(400).json({ error: "معرف الرسالة غير صالح" });
      return;
    }

    const body = normalizeMessageBody(req.body?.body ?? req.body?.content ?? req.body?.message);
    if (!body) {
      res.status(400).json({ error: "نص الرسالة مطلوب" });
      return;
    }

    const [message] = await db
      .update(supportMessagesTable)
      .set({ body })
      .where(eq(supportMessagesTable.id, messageId))
      .returning();

    if (!message) {
      res.status(404).json({ error: "الرسالة غير موجودة" });
      return;
    }

    res.json(message);
  } catch (err) {
    req.log.error({ err }, "Failed to update support message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/support/messages/:id", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const messageId = parsePositiveInt(req.params.id);
    if (!messageId) {
      res.status(400).json({ error: "معرف الرسالة غير صالح" });
      return;
    }

    const [deleted] = await db
      .delete(supportMessagesTable)
      .where(eq(supportMessagesTable.id, messageId))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "الرسالة غير موجودة" });
      return;
    }

    await refreshConversationLastMessageAt(deleted.conversationId);
    res.json({ success: true, deletedId: deleted.id, conversationId: deleted.conversationId });
  } catch (err) {
    req.log.error({ err }, "Failed to delete support message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/support/direct-messages", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const rawUserIds = Array.isArray(req.body?.userIds) ? (req.body.userIds as unknown[]) : [];
    const parsedUserIds: number[] = [];
    for (const value of rawUserIds) {
      const parsed = Number.parseInt(String(value), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        parsedUserIds.push(parsed);
      }
    }
    const userIds = Array.from(new Set<number>(parsedUserIds)).slice(0, 250);
    const body = normalizeMessageBody(req.body?.body ?? req.body?.content ?? req.body?.message);

    if (userIds.length === 0) {
      res.status(400).json({ error: "اختر مستخدمًا واحدًا على الأقل" });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "نص الرسالة مطلوب" });
      return;
    }

    const targetUsers = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));

    if (targetUsers.length === 0) {
      res.status(404).json({ error: "المستخدمون المحددون غير موجودين" });
      return;
    }

    const now = new Date();
    const sent: Array<{ userId: number; conversationId: number; messageId: number }> = [];

    for (const targetUser of targetUsers) {
      const conversation = await getOrCreateConversation(targetUser.id);
      const [message] = await db
        .insert(supportMessagesTable)
        .values({
          conversationId: conversation.id,
          senderId: admin.id,
          senderRole: "admin",
          body,
          source: "admin_direct",
        })
        .returning();

      await db
        .update(supportConversationsTable)
        .set({ status: "open", lastMessageAt: now, updatedAt: now })
        .where(eq(supportConversationsTable.id, conversation.id));

      await createSupportReplyNotification({
        userId: targetUser.id,
        conversationId: conversation.id,
        messageId: message.id,
        body,
      }).catch((err) => {
        req.log.warn({ err, userId: targetUser.id, messageId: message.id }, "Failed to create direct support notification");
      });

      sent.push({ userId: targetUser.id, conversationId: conversation.id, messageId: message.id });
    }

    res.status(201).json({
      success: true,
      requestedCount: userIds.length,
      sentCount: sent.length,
      conversations: sent,
      users: targetUsers,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create direct admin support messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

startSupportAutomationWorker();

export default router;
