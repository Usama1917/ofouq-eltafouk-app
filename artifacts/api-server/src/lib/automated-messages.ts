// Automated gamification messages (v2 Phase 1). Three owner-editable message types:
//   - evening_reminder : time-scheduled "don't break your streak" nudge (daily worker)
//   - goal_congrats    : event-driven, fired when a student crosses the daily goal
//   - points_milestone : event-driven, fired when the wallet crosses a milestone
// Each message has a row in `automated_messages` the owner can toggle / edit / retime;
// until seeded (or if a row is missing) the built-in default below is used, so messages
// keep working out of the box. Every send is anchored to a notification campaign (for
// the delivery report) via notification-delivery.ts.

import { db, usersTable, automatedMessagesTable, notificationCampaignsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { logger } from "./logger";
import { cairoDay, previousDay, recordLessonActivity, type ActivityResult } from "./gamification";
import { getOrCreateDailyCampaign, deliverToUser } from "./notification-delivery";

export type MessageTone = "primary" | "success" | "warning" | "danger";

export interface MessageConfig {
  key: string;
  enabled: boolean;
  titleAr: string;
  bodyAr: string;
  titleEn: string;
  bodyEn: string;
  sendHour: number | null;
  // The notification colour tone (fixed per message, not owner-edited).
  tone: MessageTone;
  // Owner-chosen badge glyph key, or null = "auto" (glyph derived from the tone).
  icon: string | null;
  // Owner-chosen badge colour (hex), or null = "auto" (colour derived from the tone).
  color: string | null;
  config: Record<string, unknown> | null;
}

export const DEFAULT_MILESTONES = [100, 250, 500, 1000, 2000, 5000];

// Built-in defaults. Placeholders like `{streak}` / `{points}` / `{subject}` /
// `{lesson}` / `{unit}` / `{time}` / `{video}` / `{reason}` are filled at send time.
// The gamification trio (top) fires from this file; the rest are event-driven system
// messages that used to be hard-coded in routes/academic.ts and are now owner-editable
// here (text + on/off + badge icon). `icon: null` keeps the original tone-based glyph.
const DEFAULTS: MessageConfig[] = [
  {
    key: "evening_reminder",
    enabled: true,
    titleAr: "متخسرش سلسلتك 🔥",
    bodyAr: "لسه ما ذاكرتش النهارده! ذاكر شوية وحافظ على سلسلة الـ {streak} يوم بتاعتك.",
    titleEn: "Keep your streak 🔥",
    bodyEn: "You haven't studied today — keep your {streak}-day streak alive!",
    sendHour: 20, // 8 PM Cairo
    tone: "warning",
    icon: null,
    color: null,
    config: { minStreak: 1 },
  },
  {
    key: "goal_congrats",
    enabled: true,
    titleAr: "عاش! 🎉",
    bodyAr: "حقّقت هدف النهارده! استمر كده وكمّل سلسلتك.",
    titleEn: "Goal reached! 🎉",
    bodyEn: "You hit today's goal. Keep it up!",
    sendHour: null,
    tone: "success",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "points_milestone",
    enabled: true,
    titleAr: "وسام جديد 🏅",
    bodyAr: "مبروك! وصلت لـ {points} نقطة. استمر في التألق.",
    titleEn: "New badge 🏅",
    bodyEn: "Congrats! You reached {points} points.",
    sendHour: null,
    tone: "success",
    icon: null,
    color: null,
    config: { milestones: DEFAULT_MILESTONES },
  },
  {
    key: "subscription_pending",
    enabled: true,
    titleAr: "طلب اشتراكك في مادة {subject} قيد المراجعة",
    bodyAr: "استلمنا صورة الكود وسيتم مراجعة طلبك في أقرب وقت.",
    titleEn: "Your subscription request for {subject} is under review",
    bodyEn: "We received your code image and will review your request soon.",
    sendHour: null,
    tone: "warning",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "subscription_approved",
    enabled: true,
    titleAr: "تم قبول اشتراكك في مادة {subject}",
    bodyAr: "يمكنك الآن فتح وحدات {subject} ومتابعة الدروس.",
    titleEn: "Your subscription to {subject} was approved",
    bodyEn: "You can now open {subject} units and follow the lessons.",
    sendHour: null,
    tone: "success",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "subscription_rejected",
    enabled: true,
    titleAr: "تم رفض طلب الاشتراك في مادة {subject}",
    bodyAr: "راجع الطلب وحاول مرة أخرى بصورة كود أوضح.{reason}",
    titleEn: "Your subscription request for {subject} was rejected",
    bodyEn: "Please review and try again with a clearer code image.{reason}",
    sendHour: null,
    tone: "danger",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "new_lesson",
    enabled: true,
    titleAr: 'درس جديد: "{lesson}"',
    bodyAr: "تم إضافة الدرس في {unit} - مادة {subject}.",
    titleEn: 'New lesson: "{lesson}"',
    bodyEn: "A new lesson was added in {unit} - {subject}.",
    sendHour: null,
    tone: "primary",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "resume_lesson",
    enabled: true,
    titleAr: 'استكمل مشاهدة "{lesson}"',
    bodyAr: 'وقفت عند {time} في "{video}".',
    titleEn: 'Continue watching "{lesson}"',
    bodyEn: 'You stopped at {time} in "{video}".',
    sendHour: null,
    tone: "warning",
    icon: null,
    color: null,
    config: null,
  },
  // ── Exam notifications (v2 Phase 2) ─────────────────────────────────────────
  // Sent only to students subscribed to the chapter's subject. `{exam}` = the exam's
  // name (امتحان الاستدراك / تحديك الخاص / امتحان الفصل), `{unit}` = chapter, `{subject}`
  // = subject, `{percent}` = the student's score.
  {
    key: "exam_opened",
    enabled: true,
    titleAr: "امتحان جديد متاح 📝",
    bodyAr: "اتفتح {exam} في {unit} - مادة {subject}. اختبر نفسك دلوقتي!",
    titleEn: "A new exam is open 📝",
    bodyEn: "{exam} is now open in {unit} - {subject}. Test yourself now!",
    sendHour: null,
    tone: "primary",
    icon: null,
    color: null,
    config: null,
  },
  {
    key: "exam_passed",
    enabled: true,
    titleAr: "نتيجة ممتازة! 🎉",
    bodyAr: "جبت {percent}% في {exam}. استمر في التألق!",
    titleEn: "Great score! 🎉",
    bodyEn: "You scored {percent}% on {exam}. Keep shining!",
    sendHour: null,
    tone: "success",
    icon: null,
    color: null,
    config: { passPercent: 50 },
  },
  {
    key: "exam_retry",
    enabled: true,
    titleAr: "حاول تاني 💪",
    bodyAr: "نتيجتك في {exam} كانت {percent}%. راجع وحاول تاني — انت قدّها!",
    titleEn: "Try again 💪",
    bodyEn: "You scored {percent}% on {exam}. Review and try again — you've got this!",
    sendHour: null,
    tone: "warning",
    icon: null,
    color: null,
    config: { passPercent: 50 },
  },
];

export function defaultMessages(): MessageConfig[] {
  return DEFAULTS.map((d) => ({ ...d, config: d.config ? { ...d.config } : null }));
}

/** The admin-edited config for `key`, or the built-in default if not yet seeded. The
 * tone is always taken from the code default (not owner-edited); the icon comes from
 * the stored row when set, otherwise the default. */
export async function getMessageConfig(key: string): Promise<MessageConfig | null> {
  const def = DEFAULTS.find((d) => d.key === key) ?? null;
  const [row] = await db.select().from(automatedMessagesTable).where(eq(automatedMessagesTable.key, key)).limit(1);
  if (row) {
    return {
      key: row.key,
      enabled: row.enabled,
      titleAr: row.titleAr,
      bodyAr: row.bodyAr,
      titleEn: row.titleEn,
      bodyEn: row.bodyEn,
      sendHour: row.sendHour,
      tone: def?.tone ?? "primary",
      icon: row.icon ?? def?.icon ?? null,
      color: row.color ?? def?.color ?? null,
      config: row.config ?? null,
    };
  }
  return def;
}

/** Insert any missing default message rows (never overwrites the owner's edits). */
export async function seedAutomatedMessages(): Promise<void> {
  for (const d of DEFAULTS) {
    await db
      .insert(automatedMessagesTable)
      .values({
        key: d.key,
        enabled: d.enabled,
        titleAr: d.titleAr,
        bodyAr: d.bodyAr,
        titleEn: d.titleEn,
        bodyEn: d.bodyEn,
        sendHour: d.sendHour,
        icon: d.icon,
        color: d.color,
        config: d.config,
      })
      .onConflictDoNothing({ target: automatedMessagesTable.key });
  }
}

/** Normalize a stored/owner-supplied tone string to the 4 known tones. */
export function normalizeMessageTone(tone: string | null | undefined): MessageTone {
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "primary";
}

export interface RenderedAutoMessage {
  enabled: boolean;
  title: string;
  body: string;
  tone: MessageTone;
  icon: string | null;
  color: string | null;
}

/**
 * Resolve one automated message for a user's language with `{var}` substitution.
 * Used by the event-driven system notifications in routes/academic.ts so their text
 * / on-off / icon are owner-editable from the "الرسائل المؤتمتة" screen. `enabled`
 * is false when the message has no config or the owner turned it off — the caller
 * should then skip sending.
 */
export async function renderAutomatedMessage(
  key: string,
  language: string | null | undefined,
  vars: Record<string, string | number>,
): Promise<RenderedAutoMessage> {
  const cfg = await getMessageConfig(key);
  if (!cfg) return { enabled: false, title: "", body: "", tone: "primary", icon: null, color: null };
  const { title, body } = resolveText(cfg, language, vars);
  return { enabled: cfg.enabled, title, body, tone: normalizeMessageTone(cfg.tone), icon: cfg.icon, color: cfg.color };
}

function fillVars(text: string, vars: Record<string, string | number>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * Which language variant this message will actually render in: English only when the
 * user prefers "en" AND the owner has kept non-empty English title+body (otherwise we
 * fall back to Arabic). Callers that build language-specific dynamic text (e.g. the
 * rejection reason prefix) must use THIS so their text can't disagree with the body.
 */
export function pickMessageLanguage(cfg: MessageConfig, language: string | null | undefined): "en" | "ar" {
  return language === "en" && cfg.titleEn.trim().length > 0 && cfg.bodyEn.trim().length > 0 ? "en" : "ar";
}

/** Pick the language variant (Arabic default; English only if the user prefers it). */
export function resolveText(cfg: MessageConfig, language: string | null | undefined, vars: Record<string, string | number>) {
  const useEn = pickMessageLanguage(cfg, language) === "en";
  return {
    title: fillVars(useEn ? cfg.titleEn : cfg.titleAr, vars),
    body: fillVars(useEn ? cfg.bodyEn : cfg.bodyAr, vars),
  };
}

export async function getUserLanguage(userId: number): Promise<string | null> {
  const [u] = await db.select({ language: usersTable.language }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return u?.language ?? null;
}

// ---- Event-driven messages -------------------------------------------------

/** Fire the "goal reached 🎉" message (once per student per day). */
export async function fireGoalCongrats(userId: number): Promise<void> {
  const cfg = await getMessageConfig("goal_congrats");
  if (!cfg || !cfg.enabled) return;
  const day = cairoDay();
  const language = await getUserLanguage(userId);
  const { title, body } = resolveText(cfg, language, {});
  const campaignId = await getOrCreateDailyCampaign({
    sourceKey: `goal_congrats:${day}`,
    title: cfg.titleAr,
    body: cfg.bodyAr,
    audienceSummary: "طلاب حقّقوا الهدف اليومي",
  });
  await deliverToUser({
    campaignId,
    userId,
    type: "gamification",
    title,
    body,
    tone: cfg.tone,
    data: { kind: "goal_congrats", route: "rewards", icon: cfg.icon ?? undefined, color: cfg.color ?? undefined },
    dedupeKey: `auto:goal_congrats:${day}:${userId}`,
  });
}

/** Fire the "points milestone 🏅" message for the highest threshold just crossed. */
export async function firePointsMilestone(userId: number, oldBalance: number, newBalance: number): Promise<void> {
  const cfg = await getMessageConfig("points_milestone");
  if (!cfg || !cfg.enabled) return;
  const milestonesRaw = cfg.config?.milestones;
  const milestones = Array.isArray(milestonesRaw) && milestonesRaw.length > 0 ? (milestonesRaw as number[]) : DEFAULT_MILESTONES;
  const crossed = milestones.filter((m) => Number.isFinite(m) && oldBalance < m && newBalance >= m);
  if (crossed.length === 0) return;
  const milestone = Math.max(...crossed);

  const day = cairoDay();
  const language = await getUserLanguage(userId);
  const { title, body } = resolveText(cfg, language, { points: milestone });
  const campaignId = await getOrCreateDailyCampaign({
    sourceKey: `points_milestone:${day}`,
    title: cfg.titleAr,
    body: cfg.bodyAr,
    audienceSummary: "طلاب وصلوا لوسام نقاط",
  });
  await deliverToUser({
    campaignId,
    userId,
    type: "gamification",
    title,
    body,
    tone: cfg.tone,
    // dedupeKey keys on the milestone value → each milestone is sent at most once ever.
    data: { kind: "points_milestone", milestone, route: "rewards", icon: cfg.icon ?? undefined, color: cfg.color ?? undefined },
    dedupeKey: `auto:points_milestone:${milestone}:${userId}`,
  });
}

/**
 * Orchestrates a lesson-activity ping: runs the points/streak/goal engine, then fires
 * any event-driven auto-messages it triggered. The route calls THIS (not the raw
 * engine) so message-sending stays out of the engine and there's no circular import.
 */
export async function handleLessonActivity(opts: {
  userId: number;
  watchedDeltaSeconds: number;
  justCompletedLesson: boolean;
  lessonId: number;
}): Promise<ActivityResult> {
  const result = await recordLessonActivity(opts);

  if (result.goalJustMet) {
    await fireGoalCongrats(opts.userId).catch((err) => logger.warn({ err, userId: opts.userId }, "goal_congrats failed"));
  }
  if (result.pointsAwarded > 0) {
    const oldBalance = result.balanceAfter - result.pointsAwarded;
    await firePointsMilestone(opts.userId, oldBalance, result.balanceAfter).catch((err) =>
      logger.warn({ err, userId: opts.userId }, "points_milestone failed"),
    );
  }
  return result;
}

// ---- Scheduled message: evening streak reminder ----------------------------

/** Cairo hour 0–23 right now. */
function cairoHour(d: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(d);
  return Number.parseInt(s, 10) % 24;
}

/**
 * Send the evening reminder to every student whose streak is about to break: they have
 * a live streak (last active = yesterday, streak ≥ minStreak) but haven't studied today.
 * Idempotent for the day via the per-day campaign + per-user dedupeKey.
 */
export async function runEveningReminderSweep(): Promise<{ targeted: number; sent: number }> {
  const cfg = await getMessageConfig("evening_reminder");
  if (!cfg || !cfg.enabled) return { targeted: 0, sent: 0 };

  const day = cairoDay();
  const yesterday = previousDay(day);
  const minStreak = Math.max(1, Number(cfg.config?.minStreak ?? 1));

  const targets = await db
    .select({ id: usersTable.id, language: usersTable.language, streak: usersTable.streakCount })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "student"),
        eq(usersTable.status, "active"),
        eq(usersTable.lastActiveDay, yesterday),
        gte(usersTable.streakCount, minStreak),
      ),
    );
  if (targets.length === 0) return { targeted: 0, sent: 0 };

  const campaignId = await getOrCreateDailyCampaign({
    sourceKey: `evening_reminder:${day}`,
    title: cfg.titleAr,
    body: cfg.bodyAr,
    audienceSummary: "طلاب سلسلتهم معرّضة للقطع",
  });

  let sent = 0;
  for (const t of targets) {
    const { title, body } = resolveText(cfg, t.language, { streak: t.streak });
    const r = await deliverToUser({
      campaignId,
      userId: t.id,
      type: "gamification",
      title,
      body,
      tone: cfg.tone,
      data: { kind: "evening_reminder", icon: cfg.icon ?? undefined, color: cfg.color ?? undefined },
      dedupeKey: `auto:evening_reminder:${day}:${t.id}`,
    }).catch((err) => {
      logger.warn({ err, userId: t.id }, "evening_reminder delivery failed");
      return { inserted: false, pushSent: false };
    });
    if (r.inserted) sent++;
  }
  return { targeted: targets.length, sent };
}

// ---- Background worker ------------------------------------------------------

const POLL_INTERVAL_MS = 15 * 60 * 1000; // every 15 min; fires once when the hour matches
let workerStarted = false;

async function automationTick(): Promise<void> {
  try {
    const cfg = await getMessageConfig("evening_reminder");
    if (!cfg || !cfg.enabled || cfg.sendHour == null) return;
    if (cairoHour() !== cfg.sendHour) return;

    const day = cairoDay();
    // Already sent today? (survives restarts — the campaign row is the marker.)
    const existing = await db
      .select({ id: notificationCampaignsTable.id })
      .from(notificationCampaignsTable)
      .where(eq(notificationCampaignsTable.sourceKey, `evening_reminder:${day}`))
      .limit(1);
    if (existing.length > 0) return;

    const result = await runEveningReminderSweep();
    if (result.sent > 0) logger.info({ ...result, day }, "Evening streak reminder sent");
  } catch (err) {
    logger.warn({ err }, "Gamification automation tick failed");
  }
}

/** Start the daily automated-message worker + seed defaults. Call once at boot. */
export function startGamificationAutomationWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  // Seed defaults shortly after boot (give the DB a moment to be ready).
  const seedTimer = setTimeout(() => {
    void seedAutomatedMessages().catch((err) => logger.warn({ err }, "Failed to seed automated messages"));
  }, 6000);

  const startupTimer = setTimeout(() => void automationTick(), 9000);
  const interval = setInterval(() => void automationTick(), POLL_INTERVAL_MS);
  seedTimer.unref?.();
  startupTimer.unref?.();
  interval.unref?.();
}
