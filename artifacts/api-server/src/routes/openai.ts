import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { SendOpenaiMessageBody, CreateOpenaiConversationBody } from "@workspace/api-zod";
import { getSessionUserId } from "../lib/auth";
import OpenAI from "openai";

const router: IRouter = Router();

// ── Auth gate ────────────────────────────────────────────────────────────────
// SECURITY (review B-01): every /openai endpoint requires an authenticated user,
// and every query below is scoped to that user. The gate is path-prefixed so it
// does NOT block the other root-mounted routers. The conversations.userId column
// (added to the schema) is what makes per-user scoping possible.
function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "يجب تسجيل الدخول لاستخدام المساعد الذكي." });
  }
  (req as Request & { userId?: number }).userId = userId;
  next();
}
router.use("/openai", requireUser);

function callerId(req: Request): number {
  return (req as Request & { userId?: number }).userId as number;
}

// Per-user cap on the expensive streaming endpoint (cost-abuse defence, review B-07).
const aiSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => String((req as Request & { userId?: number }).userId ?? req.ip),
  message: { error: "طلبات كثيرة على المساعد. حاول مرة أخرى بعد قليل." },
});

const MAX_MESSAGE_CHARS = 4000; // review B-07: bound input size
const MAX_HISTORY_MESSAGES = 20; // review B-07: don't replay the whole transcript every call

let openaiClient: OpenAI | null = null;

function getConfiguredOpenAIClient(): OpenAI | null {
  if (openaiClient) {
    return openaiClient;
  }

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (!baseURL || !apiKey) {
    return null;
  }

  openaiClient = new OpenAI({ apiKey, baseURL });
  return openaiClient;
}

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const SYSTEM_PROMPT = `أنت مساعد تعليمي ذكي لمنصة "التفوق". مهمتك مساعدة الطلاب في:
- فهم المواد الدراسية والمناهج التعليمية
- الإجابة على الأسئلة الأكاديمية في مختلف المواد
- تقديم شرح مبسط للمفاهيم الصعبة
- تحفيز الطلاب ودعم مسيرتهم التعليمية
- تقديم نصائح لمهارات الدراسة والتنظيم

You can respond in both Arabic and English depending on the student's language.
Always be encouraging, patient, and educational in your responses.`;

router.get("/openai/conversations", async (req, res) => {
  try {
    const userId = callerId(req);
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
    res.json(convs);
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/conversations", async (req, res) => {
  try {
    const userId = callerId(req);
    const body = CreateOpenaiConversationBody.parse(req.body);
    const [conv] = await db.insert(conversations).values({ userId, title: body.title }).returning();
    res.status(201).json(conv);
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/openai/conversations/:id", async (req, res) => {
  try {
    const userId = callerId(req);
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(400).json({ error: "Invalid conversation id" });
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    res.json({ ...conv, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/openai/conversations/:id", async (req, res) => {
  try {
    const userId = callerId(req);
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(400).json({ error: "Invalid conversation id" });
    // Verify ownership before deleting (review B-01: prevent IDOR delete).
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  try {
    const userId = callerId(req);
    const id = parseId(String(req.params.id));
    if (id === null) return res.status(400).json({ error: "Invalid conversation id" });
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
    res.json(msgs);
  } catch (err) {
    req.log.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/conversations/:id/messages", aiSendLimiter, async (req, res) => {
  try {
    const userId = callerId(req);
    const openai = getConfiguredOpenAIClient();
    if (!openai) {
      return res.status(503).json({
        error:
          "خدمة الذكاء الاصطناعي غير مفعلة في البيئة المحلية. أضف AI_INTEGRATIONS_OPENAI_BASE_URL و AI_INTEGRATIONS_OPENAI_API_KEY في ملف البيئة.",
      });
    }

    const conversationId = parseId(String(req.params.id));
    if (conversationId === null) return res.status(400).json({ error: "Invalid conversation id" });
    const body = SendOpenaiMessageBody.parse(req.body);
    const content = String(body.content ?? "").trim();
    if (!content) return res.status(400).json({ error: "الرسالة فارغة." });
    if (content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: "الرسالة طويلة جدًا." });
    }

    // Ownership check (review B-01): caller may only post to their own conversation.
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    // Save user message
    await db.insert(messages).values({ conversationId, role: "user", content });

    // Get conversation history (bounded — review B-07).
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(MAX_HISTORY_MESSAGES);
    history.reverse();

    const chatMessages = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...chatMessages],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    // Save assistant message
    await db.insert(messages).values({ conversationId, role: "assistant", content: fullResponse });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      // Stream already started: emit a terminal SSE error frame and close so the
      // client doesn't hang (review B-38).
      try {
        res.write(`data: ${JSON.stringify({ error: true })}\n\n`);
      } catch {
        /* socket already gone */
      }
      res.end();
    }
  }
});

export default router;
