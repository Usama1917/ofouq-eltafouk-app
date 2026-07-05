import { Router, type IRouter } from "express";
import {
  db,
  automatedMessagesTable,
  notificationCampaignsTable,
  notificationColorsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { getGamificationSummary } from "../lib/gamification";
import { defaultMessages, runEveningReminderSweep } from "../lib/automated-messages";
import { normalizeNotificationIcon } from "../lib/notification-icons";
import { normalizeHexColor } from "../lib/notification-colors";
import { getSessionUserId } from "../lib/auth";

// Admin-only gamification + automated-message management. All paths live under
// /admin/* so the app-level /api/admin gate (DB role/status check) protects them.
const router: IRouter = Router();

// The gamification trio + the event-driven system messages (subscription flow, new
// lesson, resume-lesson) — all owner-editable from the "الرسائل المؤتمتة" screen.
const MESSAGE_ORDER = [
  "evening_reminder",
  "study_reminder",
  "goal_congrats",
  "points_milestone",
  "subscription_pending",
  "subscription_approved",
  "subscription_rejected",
  "new_lesson",
  "resume_lesson",
  "exam_opened",
  "exam_passed",
  "exam_retry",
] as const;
const ASSIGNABLE_KEYS = new Set<string>(MESSAGE_ORDER);

// ---- Automated messages config --------------------------------------------

// List the 3 automated messages, each as its stored row or its built-in default.
router.get("/admin/automated-messages", async (req, res) => {
  try {
    const rows = await db.select().from(automatedMessagesTable);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const defaults = defaultMessages();
    const merged = MESSAGE_ORDER.map((key) => {
      const def = defaults.find((d) => d.key === key)!;
      const row = byKey.get(key);
      if (row) {
        return {
          key: row.key,
          enabled: row.enabled,
          titleAr: row.titleAr,
          bodyAr: row.bodyAr,
          titleEn: row.titleEn,
          bodyEn: row.bodyEn,
          sendHour: row.sendHour,
          // tone is fixed in code; icon + color are owner-editable (row wins, else default).
          tone: def.tone,
          icon: row.icon ?? def.icon ?? null,
          color: row.color ?? def.color ?? null,
          config: row.config ?? null,
          updatedAt: row.updatedAt,
        };
      }
      return { ...def, updatedAt: null };
    });
    return res.json({ messages: merged });
  } catch (err) {
    req.log.error({ err }, "Failed to list automated messages");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update (upsert) one automated message's text / schedule / enabled / config.
router.put("/admin/automated-messages/:key", async (req, res) => {
  try {
    const key = req.params.key;
    if (!ASSIGNABLE_KEYS.has(key)) return res.status(404).json({ error: "رسالة غير معروفة" });

    const b = req.body ?? {};
    const def = defaultMessages().find((d) => d.key === key)!;

    const titleAr = typeof b.titleAr === "string" && b.titleAr.trim() ? b.titleAr.trim() : def.titleAr;
    const bodyAr = typeof b.bodyAr === "string" && b.bodyAr.trim() ? b.bodyAr.trim() : def.bodyAr;
    const titleEn = typeof b.titleEn === "string" ? b.titleEn.trim() : def.titleEn;
    const bodyEn = typeof b.bodyEn === "string" ? b.bodyEn.trim() : def.bodyEn;
    const enabled = typeof b.enabled === "boolean" ? b.enabled : def.enabled;

    // sendHour only applies to time-scheduled messages; keep null for event-driven ones.
    let sendHour: number | null = def.sendHour;
    if (def.sendHour !== null) {
      if (b.sendHour === null) sendHour = def.sendHour;
      else if (Number.isInteger(b.sendHour) && b.sendHour >= 0 && b.sendHour <= 23) sendHour = b.sendHour;
    } else {
      sendHour = null;
    }

    const config = b.config && typeof b.config === "object" ? b.config : def.config;

    // icon: a valid palette key, or null = "auto" (glyph derived from the tone).
    const icon = normalizeNotificationIcon(b.icon);
    // color: a valid hex, or null = "auto" (colour derived from the tone).
    const color = normalizeHexColor(b.color);

    const values = { key, enabled, titleAr, bodyAr, titleEn, bodyEn, sendHour, icon, color, config, updatedAt: new Date() };
    const [row] = await db
      .insert(automatedMessagesTable)
      .values(values)
      .onConflictDoUpdate({ target: automatedMessagesTable.key, set: { enabled, titleAr, bodyAr, titleEn, bodyEn, sendHour, icon, color, config, updatedAt: new Date() } })
      .returning();
    return res.json({ message: row });
  } catch (err) {
    req.log.error({ err }, "Failed to update automated message");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Manually run the evening streak reminder now (for testing / on-demand send).
router.post("/admin/automated-messages/evening-reminder/run", async (req, res) => {
  try {
    const result = await runEveningReminderSweep();
    return res.json({ success: true, ...result });
  } catch (err) {
    req.log.error({ err }, "Failed to run evening reminder");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Custom notification colours (shared palette the owner adds to) ---------

// List the owner-added custom colours (the client shows these next to its fixed presets).
router.get("/admin/notification-colors", async (req, res) => {
  try {
    const rows = await db
      .select({ id: notificationColorsTable.id, hex: notificationColorsTable.hex })
      .from(notificationColorsTable)
      .orderBy(desc(notificationColorsTable.createdAt));
    return res.json({ colors: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list notification colors");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add a custom colour by hex code (shared for everyone). Idempotent on the hex.
router.post("/admin/notification-colors", async (req, res) => {
  try {
    const hex = normalizeHexColor(req.body?.hex);
    if (!hex) return res.status(400).json({ error: "كود اللون غير صالح (مثال: ‎#8B5CF6‎)" });

    const actorId = getSessionUserId(req) ?? null;
    const [inserted] = await db
      .insert(notificationColorsTable)
      .values({ hex, createdByUserId: actorId })
      .onConflictDoNothing({ target: notificationColorsTable.hex })
      .returning({ id: notificationColorsTable.id, hex: notificationColorsTable.hex });

    if (inserted) return res.status(201).json({ color: inserted });

    // Already existed → return the existing row so the client can select it.
    const [existing] = await db
      .select({ id: notificationColorsTable.id, hex: notificationColorsTable.hex })
      .from(notificationColorsTable)
      .where(eq(notificationColorsTable.hex, hex))
      .limit(1);
    return res.json({ color: existing ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to add notification color");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a custom colour (fixed presets live in the client, so they can't be removed).
router.delete("/admin/notification-colors/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    await db.delete(notificationColorsTable).where(eq(notificationColorsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete notification color");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---- Delivery report -------------------------------------------------------

// List campaigns (manual + automated) newest-first with recipient + read counts.
router.get("/admin/notification-report", async (req, res) => {
  try {
    const limitRaw = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const rows = await db
      .select({
        id: notificationCampaignsTable.id,
        kind: notificationCampaignsTable.kind,
        sourceKey: notificationCampaignsTable.sourceKey,
        title: notificationCampaignsTable.title,
        body: notificationCampaignsTable.body,
        audienceSummary: notificationCampaignsTable.audienceSummary,
        sentByUserId: notificationCampaignsTable.sentByUserId,
        pushSentCount: notificationCampaignsTable.pushSentCount,
        createdAt: notificationCampaignsTable.createdAt,
        recipientCount: sql<number>`count(${notificationsTable.id})`.mapWith(Number),
        readCount: sql<number>`count(${notificationsTable.id}) filter (where ${notificationsTable.readAt} is not null)`.mapWith(Number),
      })
      .from(notificationCampaignsTable)
      .leftJoin(notificationsTable, eq(notificationsTable.campaignId, notificationCampaignsTable.id))
      .groupBy(notificationCampaignsTable.id)
      .orderBy(desc(notificationCampaignsTable.createdAt))
      .limit(limit);

    return res.json({ campaigns: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to load notification report");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Per-campaign recipient list: who received it, when, and whether they opened it.
router.get("/admin/notification-report/:campaignId", async (req, res) => {
  try {
    const campaignId = Number.parseInt(req.params.campaignId, 10);
    if (!Number.isInteger(campaignId) || campaignId <= 0) return res.status(400).json({ error: "معرّف غير صالح" });

    const [campaign] = await db
      .select()
      .from(notificationCampaignsTable)
      .where(eq(notificationCampaignsTable.id, campaignId))
      .limit(1);
    if (!campaign) return res.status(404).json({ error: "غير موجود" });

    const recipients = await db
      .select({
        userId: notificationsTable.userId,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        title: notificationsTable.title,
        body: notificationsTable.body,
        sentAt: notificationsTable.createdAt,
        readAt: notificationsTable.readAt,
      })
      .from(notificationsTable)
      .innerJoin(usersTable, eq(usersTable.id, notificationsTable.userId))
      .where(eq(notificationsTable.campaignId, campaignId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(1000);

    return res.json({ campaign, recipients });
  } catch (err) {
    req.log.error({ err }, "Failed to load campaign recipients");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Per-user notification history (every message this user received + when + read).
router.get("/admin/users/:id/notifications", async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "معرّف غير صالح" });

    const items = await db
      .select({
        id: notificationsTable.id,
        campaignId: notificationsTable.campaignId,
        type: notificationsTable.type,
        title: notificationsTable.title,
        body: notificationsTable.body,
        tone: notificationsTable.tone,
        sentAt: notificationsTable.createdAt,
        readAt: notificationsTable.readAt,
      })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(200);

    return res.json({ notifications: items });
  } catch (err) {
    req.log.error({ err }, "Failed to load user notification history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// A student's points / streak for the admin user page.
router.get("/admin/users/:id/gamification", async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    const summary = await getGamificationSummary(userId);
    return res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to load user gamification");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
