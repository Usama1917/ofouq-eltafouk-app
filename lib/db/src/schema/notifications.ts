import { boolean, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
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
    availableAt: timestamp("available_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userDedupeUnique: unique("notifications_user_dedupe_uniq").on(table.userId, table.dedupeKey),
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
    lastWatchedAt: timestamp("last_watched_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    studentLessonUnique: unique("lesson_watch_progress_student_lesson_uniq").on(table.studentId, table.lessonId),
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

export type Notification = typeof notificationsTable.$inferSelect;
export type LessonWatchProgress = typeof lessonWatchProgressTable.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertLessonWatchProgress = z.infer<typeof insertLessonWatchProgressSchema>;
