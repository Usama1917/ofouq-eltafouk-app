import { boolean, integer, jsonb, pgTable, serial, text, timestamp, unique, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lessonsTable } from "./academic";
import { usersTable } from "./users";

// A "campaign" is one send event — a manual admin broadcast OR one firing of an
// automated message — that fanned out to many students. It anchors the delivery
// report: each per-user `notifications` row points back to its campaign, so the
// admin can see, per send, who received it / when / who opened it. (v2 Phase 1)
export const notificationCampaignsTable = pgTable(
  "notification_campaigns",
  {
    id: serial("id").primaryKey(),
    // "manual" = admin broadcast; "automated" = a gamification auto-message firing.
    kind: text("kind").notNull(),
    // For automated campaigns: the message key (e.g. "evening_reminder"). Null for manual.
    sourceKey: text("source_key"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    // Plain-language audience description shown in the report (e.g. "كل الطلاب").
    audienceSummary: text("audience_summary"),
    // The admin who triggered a manual send; null for system/automated.
    sentByUserId: integer("sent_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    totalRecipients: integer("total_recipients").notNull().default(0),
    pushSentCount: integer("push_sent_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Report lists campaigns newest-first.
    createdIdx: index("notification_campaigns_created_idx").on(table.createdAt),
    // Automated campaigns are found-or-created by sourceKey (e.g. "goal_congrats:2026-06-30")
    // so a given day's auto-message has exactly one campaign. Manual sends pass null
    // (Postgres treats nulls as distinct, so they're unconstrained).
    sourceKeyIdx: uniqueIndex("notification_campaigns_source_key_idx").on(table.sourceKey),
  }),
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    // Links this per-user notification back to the send that produced it (for the
    // delivery report). Null for one-off / system notifications without a campaign.
    campaignId: integer("campaign_id").references(() => notificationCampaignsTable.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    tone: text("tone").notNull().default("primary"),
    actionUrl: text("action_url"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    dedupeKey: text("dedupe_key"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userDedupeUnique: unique("notifications_user_dedupe_uniq").on(table.userId, table.dedupeKey),
    // Per-user feed: WHERE user_id = ? AND available_at <= now() ORDER BY created_at DESC. See review B-09.
    userFeedIdx: index("notifications_user_feed_idx").on(table.userId, table.availableAt, table.createdAt),
    userReadIdx: index("notifications_user_read_idx").on(table.userId, table.readAt),
    // Delivery report: per-campaign recipient list + read counts.
    campaignIdx: index("notifications_campaign_idx").on(table.campaignId),
  }),
);

export const lessonWatchProgressTable = pgTable(
  "lesson_watch_progress",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }),
    currentSeconds: integer("current_seconds").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentLessonUnique: unique("lesson_watch_progress_student_lesson_uniq").on(table.studentId, table.lessonId),
    // Admin aggregates group by lessonId across all students. See review B-11.
    lessonIdx: index("lesson_watch_progress_lesson_idx").on(table.lessonId),
  }),
);

// Owner-defined custom notification badge colours (hex), shared across ALL admins
// (not per-user). The client also has a fixed preset palette; these are the extra
// colours the owner added by hex code and can delete. (v2 Phase 1)
export const notificationColorsTable = pgTable("notification_colors", {
  id: serial("id").primaryKey(),
  // Stored normalized as a lowercase "#rrggbb" string; unique so the same colour
  // can't be added twice.
  hex: text("hex").notNull().unique(),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushNotificationTokensTable = pgTable(
  "push_notification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("unknown"),
    deviceName: text("device_name"),
    deviceInfo: jsonb("device_info").$type<Record<string, unknown>>(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenUnique: unique("push_notification_tokens_token_uniq").on(table.token),
    // Per-user device lookups + broadcast filter on disabled_at. See review B-30.
    userIdx: index("push_notification_tokens_user_idx").on(table.userId),
    activeIdx: index("push_notification_tokens_active_idx").on(table.disabledAt),
  }),
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export const insertLessonWatchProgressSchema = createInsertSchema(lessonWatchProgressTable).omit({
  id: true,
  lastWatchedAt: true,
  updatedAt: true,
});
export const insertPushNotificationTokenSchema = createInsertSchema(pushNotificationTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationCampaign = typeof notificationCampaignsTable.$inferSelect;
export type NotificationColor = typeof notificationColorsTable.$inferSelect;
export type LessonWatchProgress = typeof lessonWatchProgressTable.$inferSelect;
export type PushNotificationToken = typeof pushNotificationTokensTable.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertLessonWatchProgress = z.infer<typeof insertLessonWatchProgressSchema>;
export type InsertPushNotificationToken = z.infer<typeof insertPushNotificationTokenSchema>;
