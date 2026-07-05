import { pgTable, serial, integer, boolean, date, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// One row per student per calendar day (day boundary computed in Africa/Cairo time,
// not UTC, so "today" matches the student's clock). Drives the daily-goal ring and
// the streak: the streak logic reads/writes `users.last_active_day`, and this table
// is the per-day ledger behind it. `pointsEarned` is the points earned *that day*
// (for "today's progress"), separate from the lifetime wallet total.
export const dailyActivityTable = pgTable(
  "daily_activity",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // "YYYY-MM-DD" in Africa/Cairo. Stored as a DATE for cheap range/streak queries.
    activityDate: date("activity_date", { mode: "string" }).notNull(),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    lessonsCompleted: integer("lessons_completed").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
    // True once that day's watched minutes reached the student's daily goal.
    goalMet: boolean("goal_met").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Upsert target + "did the student do anything on day X" lookups.
    userDayIdx: uniqueIndex("daily_activity_user_day_idx").on(table.userId, table.activityDate),
  }),
);

export const insertDailyActivitySchema = createInsertSchema(dailyActivityTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyActivity = z.infer<typeof insertDailyActivitySchema>;
export type DailyActivity = typeof dailyActivityTable.$inferSelect;

// Admin-editable config for each automated gamification message. One row per message
// `key`. The owner can toggle it on/off, edit the Arabic/English text, set the send
// hour (for the time-based evening reminder), and tune extra config (e.g. the points
// milestones). Seeded with sensible defaults the first time the API boots.
export const automatedMessagesTable = pgTable("automated_messages", {
  id: serial("id").primaryKey(),
  // Stable identifier: "evening_reminder" | "goal_congrats" | "points_milestone".
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  titleAr: text("title_ar").notNull(),
  bodyAr: text("body_ar").notNull(),
  titleEn: text("title_en").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  // Cairo hour (0–23) for time-scheduled messages (evening reminder). Null = event-driven.
  sendHour: integer("send_hour"),
  // Owner-chosen badge icon key for the notification (see notification-icons palette).
  // Null = "auto" (the mobile app derives the glyph from the tone, i.e. the old behavior).
  icon: text("icon"),
  // Owner-chosen badge colour (hex, e.g. "#8B5CF6). Null = "auto" (colour derived from
  // the tone). Drives both the glyph colour and its lighter-tint background.
  color: text("color"),
  // Extra per-message settings, e.g. { milestones: [100, 500, 1000] } or { minStreak: 1 }.
  config: jsonb("config").$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAutomatedMessageSchema = createInsertSchema(automatedMessagesTable).omit({ id: true, updatedAt: true });
export type InsertAutomatedMessage = z.infer<typeof insertAutomatedMessageSchema>;
export type AutomatedMessage = typeof automatedMessagesTable.$inferSelect;
