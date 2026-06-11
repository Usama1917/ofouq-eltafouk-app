import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db,
  internalConversationsTable,
  internalMessagesTable,
  internalConversationReadsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";

const router: IRouter = Router();

// ── Image upload (chat attachments) ────────────────────────────────────────────
const chatImagesUploadDir = path.resolve(process.cwd(), "uploads/chat-images");
fs.mkdirSync(chatImagesUploadDir, { recursive: true });
const chatImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatImagesUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadChatImage = multer({
  storage: chatImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ── Auth helpers (mirror support.ts) ────────────────────────────────────────────
function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function getSessionUserId(req: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token?.startsWith("session_")) return null;
  return parsePositiveInt(token.replace("session_", ""));
}
type Staff = { id: number; name: string; email: string; role: string; status: string; avatarUrl: string | null };
async function requireStaff(req: any, res: any): Promise<Staff | null> {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولًا" });
    return null;
  }
  const [user] = await db
    .select({
      id: usersTable.id, name: usersTable.name, email: usersTable.email,
      role: usersTable.role, status: usersTable.status, avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.status !== "active") {
    res.status(401).json({ error: "غير مصرح" });
    return null;
  }
  if (user.role !== "admin" && user.role !== "owner") {
    res.status(403).json({ error: "هذه الميزة متاحة للملاك والمشرفين فقط" });
    return null;
  }
  return user as Staff;
}

function normalizeBody(value: unknown) {
  return String(value ?? "").trim().slice(0, 2000);
}
function preview(value: string | null, hasImage: boolean) {
  const t = (value ?? "").trim();
  if (t) return t.length > 120 ? `${t.slice(0, 117)}...` : t;
  return hasImage ? "📷 صورة" : "";
}

const GROUP_TITLES: Record<string, string> = { owners: "مجموعة الملّاك", all: "المشرفون والملّاك" };

// ── Conversation resolution ────────────────────────────────────────────────────
async function getOrCreateGroup(type: "owners" | "all") {
  const [existing] = await db
    .select().from(internalConversationsTable)
    .where(and(eq(internalConversationsTable.type, type), isNull(internalConversationsTable.adminId), isNull(internalConversationsTable.ownerId)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(internalConversationsTable).values({ type, lastMessageAt: new Date() }).returning();
  return created;
}
async function getOrCreateDirect(adminId: number, ownerId: number) {
  const [existing] = await db
    .select().from(internalConversationsTable)
    .where(and(eq(internalConversationsTable.type, "direct"), eq(internalConversationsTable.adminId, adminId), eq(internalConversationsTable.ownerId, ownerId)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(internalConversationsTable).values({ type: "direct", adminId, ownerId, lastMessageAt: new Date() }).returning();
  return created;
}

// Members of a conversation (derived for groups). Returns user ids.
async function memberIds(conv: { type: string; adminId: number | null; ownerId: number | null }): Promise<number[]> {
  if (conv.type === "direct") return [conv.adminId, conv.ownerId].filter((x): x is number => x != null);
  const roles = conv.type === "owners" ? ["owner"] : ["owner", "admin"];
  const rows = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(inArray(usersTable.role, roles), eq(usersTable.status, "active")));
  return rows.map((r) => r.id);
}
// Full member rows (for the @mention picker), excluding nobody — the client
// filters out the current user.
async function loadMembers(conv: { type: string; adminId: number | null; ownerId: number | null }) {
  const ids = await memberIds(conv);
  if (!ids.length) return [];
  return db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, avatarUrl: usersTable.avatarUrl })
    .from(usersTable).where(inArray(usersTable.id, ids));
}
function isMemberOf(user: Staff, conv: { type: string; adminId: number | null; ownerId: number | null }) {
  if (conv.type === "owners") return user.role === "owner";
  if (conv.type === "all") return user.role === "owner" || user.role === "admin";
  // direct
  return conv.adminId === user.id || conv.ownerId === user.id;
}

async function unreadFor(conversationId: number, userId: number): Promise<number> {
  const [readRow] = await db.select({ lastReadAt: internalConversationReadsTable.lastReadAt })
    .from(internalConversationReadsTable)
    .where(and(eq(internalConversationReadsTable.conversationId, conversationId), eq(internalConversationReadsTable.userId, userId)))
    .limit(1);
  const since = readRow?.lastReadAt ?? new Date(0);
  const [row] = await db.select({ n: count() }).from(internalMessagesTable)
    .where(and(
      eq(internalMessagesTable.conversationId, conversationId),
      gt(internalMessagesTable.createdAt, since),
      ne(internalMessagesTable.senderId, userId),
      isNull(internalMessagesTable.deletedAt),
    ));
  return Number(row?.n ?? 0);
}

async function markRead(conversationId: number, userId: number) {
  await db.insert(internalConversationReadsTable)
    .values({ conversationId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [internalConversationReadsTable.conversationId, internalConversationReadsTable.userId],
      set: { lastReadAt: new Date() },
    });
}

async function lastMessageOf(conversationId: number) {
  const [m] = await db.select().from(internalMessagesTable)
    .where(eq(internalMessagesTable.conversationId, conversationId))
    .orderBy(desc(internalMessagesTable.createdAt), desc(internalMessagesTable.id)).limit(1);
  if (!m) return null;
  return {
    id: m.id,
    preview: m.deletedAt ? "تم حذف الرسالة" : preview(m.body, Boolean(m.imageUrl)),
    senderId: m.senderId,
    createdAt: m.createdAt,
  };
}

// Build the conversation list visible to the caller.
async function deriveConversations(user: Staff) {
  type Item = {
    key: string; id: number | null; type: string; title: string;
    counterpart: { id: number; name: string; avatarUrl: string | null; role: string } | null;
    lastMessage: { id: number; preview: string; senderId: number | null; createdAt: Date } | null;
    lastMessageAt: Date | null; unreadCount: number;
  };
  const items: Item[] = [];

  const groupTypes: ("owners" | "all")[] = user.role === "owner" ? ["owners", "all"] : ["all"];
  for (const gt of groupTypes) {
    const conv = await getOrCreateGroup(gt);
    items.push({
      key: gt, id: conv.id, type: gt, title: GROUP_TITLES[gt], counterpart: null,
      lastMessage: await lastMessageOf(conv.id), lastMessageAt: conv.lastMessageAt,
      unreadCount: await unreadFor(conv.id, user.id),
    });
  }

  // Direct: counterpart is every admin (for an owner) or every owner (for an admin).
  const counterpartRole = user.role === "owner" ? "admin" : "owner";
  const counterparts = await db
    .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, role: usersTable.role })
    .from(usersTable)
    .where(and(eq(usersTable.role, counterpartRole), eq(usersTable.status, "active")));

  for (const cp of counterparts) {
    const adminId = user.role === "admin" ? user.id : cp.id;
    const ownerId = user.role === "owner" ? user.id : cp.id;
    const [conv] = await db.select().from(internalConversationsTable)
      .where(and(eq(internalConversationsTable.type, "direct"), eq(internalConversationsTable.adminId, adminId), eq(internalConversationsTable.ownerId, ownerId)))
      .limit(1);
    items.push({
      key: `direct:${cp.id}`,
      id: conv?.id ?? null,
      type: "direct",
      title: cp.name,
      counterpart: { id: cp.id, name: cp.name, avatarUrl: cp.avatarUrl, role: cp.role },
      lastMessage: conv ? await lastMessageOf(conv.id) : null,
      lastMessageAt: conv?.lastMessageAt ?? null,
      unreadCount: conv ? await unreadFor(conv.id, user.id) : 0,
    });
  }

  // Groups first, then direct sorted by most-recent activity.
  items.sort((a, b) => {
    const ga = a.type === "direct" ? 1 : 0;
    const gb = b.type === "direct" ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
  });
  return items;
}

// Resolve a conversation from a {type, counterpartId} descriptor, creating it if
// needed. Returns null + sends the response on auth failure.
async function resolveConversation(user: Staff, type: string, counterpartId: number | null, res: any) {
  if (type === "owners") {
    if (user.role !== "owner") { res.status(403).json({ error: "مجموعة الملّاك للملّاك فقط" }); return null; }
    return getOrCreateGroup("owners");
  }
  if (type === "all") {
    return getOrCreateGroup("all");
  }
  if (type === "direct") {
    if (!counterpartId) { res.status(400).json({ error: "الطرف الآخر مطلوب" }); return null; }
    const [cp] = await db.select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.id, counterpartId)).limit(1);
    if (!cp || cp.status !== "active" || (cp.role !== "admin" && cp.role !== "owner")) {
      res.status(404).json({ error: "الطرف الآخر غير موجود" }); return null;
    }
    // direct must pair exactly one admin with one owner
    if (user.role === cp.role) { res.status(400).json({ error: "الدردشة الخاصة بين مشرف ومالك فقط" }); return null; }
    const adminId = user.role === "admin" ? user.id : cp.id;
    const ownerId = user.role === "owner" ? user.id : cp.id;
    return getOrCreateDirect(adminId, ownerId);
  }
  res.status(400).json({ error: "نوع محادثة غير صالح" });
  return null;
}

function serializeMessage(m: typeof internalMessagesTable.$inferSelect, senderName?: string | null, senderAvatar?: string | null) {
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderRole: m.senderRole,
    senderName: senderName ?? null,
    senderAvatar: senderAvatar ?? null,
    body: deleted ? null : m.body,
    imageUrl: deleted ? null : m.imageUrl,
    mentions: deleted ? [] : (m.mentions ?? []),
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    createdAt: m.createdAt,
  };
}

async function loadMessages(conversationId: number) {
  const rows = await db
    .select({ m: internalMessagesTable, name: usersTable.name, avatar: usersTable.avatarUrl })
    .from(internalMessagesTable)
    .leftJoin(usersTable, eq(internalMessagesTable.senderId, usersTable.id))
    .where(eq(internalMessagesTable.conversationId, conversationId))
    .orderBy(asc(internalMessagesTable.createdAt), asc(internalMessagesTable.id))
    .limit(500);
  return rows.map((r) => serializeMessage(r.m, r.name, r.avatar));
}

async function notifyParticipants(args: {
  conv: { id: number; type: string; adminId: number | null; ownerId: number | null; title: string };
  sender: Staff; body: string | null; hasImage: boolean; messageId: number; mentions: number[];
}) {
  const members = (await memberIds(args.conv)).filter((id) => id !== args.sender.id);
  const mentionSet = new Set(args.mentions);
  const previewText = preview(args.body, args.hasImage);
  const rows = members.map((uid) => {
    const mentioned = mentionSet.has(uid);
    return {
      userId: uid,
      type: mentioned ? "internal_chat_mention" : "internal_chat",
      title: mentioned ? `${args.sender.name} ذكرك` : `رسالة جديدة من ${args.sender.name}`,
      body: previewText || (args.hasImage ? "📷 صورة" : ""),
      tone: mentioned ? "warning" : "primary",
      actionUrl: "internal-chat",
      data: { conversationId: args.conv.id, messageId: args.messageId, kind: args.conv.type },
      dedupeKey: `internal-chat:${args.messageId}:${uid}`,
    };
  });
  if (rows.length) {
    await db.insert(notificationsTable).values(rows as any).onConflictDoNothing();
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────────

// List conversations visible to the caller.
router.get("/internal-chat/conversations", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    res.json({ conversations: await deriveConversations(user), me: { id: user.id, role: user.role, name: user.name } });
  } catch (err) {
    req.log.error({ err }, "internal-chat conversations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Total unread badge count.
router.get("/internal-chat/unread-count", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const convs = await deriveConversations(user);
    const total = convs.reduce((s, c) => s + (c.unreadCount || 0), 0);
    res.json({ unreadCount: total });
  } catch (err) {
    req.log.error({ err }, "internal-chat unread-count error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Open a conversation by descriptor (materializes virtual/direct + marks read).
router.get("/internal-chat/open", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const type = String(req.query.type ?? "");
    const counterpartId = parsePositiveInt(req.query.counterpartId as string | undefined);
    const conv = await resolveConversation(user, type, counterpartId, res);
    if (!conv) return;
    if (!isMemberOf(user, conv)) { res.status(403).json({ error: "غير مصرح بهذه المحادثة" }); return; }
    await markRead(conv.id, user.id);
    res.json({ conversation: { id: conv.id, type: conv.type, adminId: conv.adminId, ownerId: conv.ownerId }, messages: await loadMessages(conv.id), members: await loadMembers(conv) });
  } catch (err) {
    req.log.error({ err }, "internal-chat open error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Messages of an existing conversation by id (marks read).
router.get("/internal-chat/conversations/:id/messages", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
    const [conv] = await db.select().from(internalConversationsTable).where(eq(internalConversationsTable.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "المحادثة غير موجودة" }); return; }
    if (!isMemberOf(user, conv)) { res.status(403).json({ error: "غير مصرح بهذه المحادثة" }); return; }
    await markRead(conv.id, user.id);
    res.json({ conversation: { id: conv.id, type: conv.type, adminId: conv.adminId, ownerId: conv.ownerId }, messages: await loadMessages(conv.id), members: await loadMembers(conv) });
  } catch (err) {
    req.log.error({ err }, "internal-chat messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send a message.
router.post("/internal-chat/messages", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const type = String(req.body?.type ?? "");
    const counterpartId = parsePositiveInt(req.body?.counterpartId != null ? String(req.body.counterpartId) : undefined);
    const body = normalizeBody(req.body?.body);
    const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).slice(0, 500) : null;
    if (!body && !imageUrl) { res.status(400).json({ error: "الرسالة فارغة" }); return; }

    const conv = await resolveConversation(user, type, counterpartId, res);
    if (!conv) return;
    if (!isMemberOf(user, conv)) { res.status(403).json({ error: "غير مصرح بهذه المحادثة" }); return; }

    // Keep only mentions that are real members of this conversation.
    const members = new Set(await memberIds(conv));
    const mentions = Array.isArray(req.body?.mentions)
      ? [...new Set(req.body.mentions.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && members.has(n)))] as number[]
      : [];

    const now = new Date();
    const [msg] = await db.insert(internalMessagesTable).values({
      conversationId: conv.id, senderId: user.id, senderRole: user.role,
      body: body || null, imageUrl, mentions: mentions.length ? mentions : null, createdAt: now,
    }).returning();
    await db.update(internalConversationsTable).set({ lastMessageAt: now }).where(eq(internalConversationsTable.id, conv.id));
    await markRead(conv.id, user.id);
    await notifyParticipants({
      conv: { id: conv.id, type: conv.type, adminId: conv.adminId, ownerId: conv.ownerId, title: GROUP_TITLES[conv.type] ?? user.name },
      sender: user, body: body || null, hasImage: Boolean(imageUrl), messageId: msg.id, mentions,
    });
    res.status(201).json({ message: serializeMessage(msg, user.name, user.avatarUrl), conversationId: conv.id });
  } catch (err) {
    req.log.error({ err }, "internal-chat send error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Edit own message.
router.patch("/internal-chat/messages/:id", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
    const body = normalizeBody(req.body?.body);
    if (!body) { res.status(400).json({ error: "الرسالة فارغة" }); return; }
    const [updated] = await db.update(internalMessagesTable)
      .set({ body, editedAt: new Date() })
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.senderId, user.id), isNull(internalMessagesTable.deletedAt)))
      .returning();
    if (!updated) { res.status(404).json({ error: "لا يمكن تعديل هذه الرسالة" }); return; }
    res.json({ message: serializeMessage(updated, user.name, user.avatarUrl) });
  } catch (err) {
    req.log.error({ err }, "internal-chat edit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Soft-delete own message.
router.delete("/internal-chat/messages/:id", async (req, res) => {
  try {
    const user = await requireStaff(req, res);
    if (!user) return;
    const id = parsePositiveInt(req.params.id);
    if (!id) { res.status(400).json({ error: "معرّف غير صالح" }); return; }
    const [updated] = await db.update(internalMessagesTable)
      .set({ deletedAt: new Date(), body: null, imageUrl: null, mentions: null })
      .where(and(eq(internalMessagesTable.id, id), eq(internalMessagesTable.senderId, user.id), isNull(internalMessagesTable.deletedAt)))
      .returning();
    if (!updated) { res.status(404).json({ error: "لا يمكن حذف هذه الرسالة" }); return; }
    res.json({ message: serializeMessage(updated) });
  } catch (err) {
    req.log.error({ err }, "internal-chat delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upload a chat image.
router.post("/internal-chat/upload-image", (req, res) => {
  uploadChatImage.single("image")(req, res, async (err) => {
    try {
      if (err) { res.status(400).json({ error: "تعذّر رفع الصورة" }); return; }
      const user = await requireStaff(req, res);
      if (!user) return;
      if (!(req as any).file) { res.status(400).json({ error: "لا توجد صورة" }); return; }
      res.json({ url: `/api/uploads/chat-images/${(req as any).file.filename}` });
    } catch (e) {
      (req as any).log?.error?.({ err: e }, "internal-chat upload error");
      res.status(500).json({ error: "Internal server error" });
    }
  });
});

export default router;
