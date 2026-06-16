import { boolean, integer, jsonb, pgTable, serial, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lessonsTable } from "./academic";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
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
export type LessonWatchProgress = typeof lessonWatchProgressTable.$inferSelect;
export type PushNotificationToken = typeof pushNotificationTokensTable.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertLessonWatchProgress = z.infer<typeof insertLessonWatchProgressSchema>;
export type InsertPushNotificationToken = z.infer<typeof insertPushNotificationTokenSchema>;
