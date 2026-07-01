import { pgTable, serial, text, timestamp, integer, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull().default(""),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("active"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  avatarUrl: text("avatar_url"),
  // Moral-review (v2): the last admin-APPROVED public identity shown to OTHER users
  // (e.g. the leaderboard). The user always sees their own live `name`/`avatarUrl`
  // immediately; everyone else sees these approved values until a change is reviewed.
  // Null = never approved yet (brand-new account) → a placeholder is shown publicly.
  publicName: text("public_name"),
  publicAvatarUrl: text("public_avatar_url"),
  // Cumulative admin reports; at 5 the account is auto-suspended (status='suspended').
  reportCount: integer("report_count").notNull().default(0),
  phone: text("phone"),
  // Set once the user's phone number is confirmed via an OTP code. Null = unverified
  // (or never collected). Two-factor SMS login requires a verified phone; an admin
  // "reset" clears this to force re-collection + re-verification on next login.
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  age: integer("age"),
  address: text("address"),
  parentPhone: text("parent_phone"),
  specialty: text("specialty"),
  qualifications: text("qualifications"),
  howDidYouHear: text("how_did_you_hear"),
  supportNeeded: text("support_needed"),
  bio: text("bio"),
  governorate: text("governorate"),
  // Preferred app language ("ar" | "en"), reported by the mobile app. Used to send
  // admin broadcasts/notifications in the user's own language.
  language: text("language"),
  // Owner-set performance expectation for an admin, as a 1–5 star level. Each star
  // maps to a percentage of the equal per-admin share of monthly work the admin is
  // expected to carry (1★=70%, 2★=90%, 3★=100%, 4★=110%, 5★=150%).
  expectationStars: integer("expectation_stars").notNull().default(3),
  // When true, the admin is excluded from the fair workload distribution (frozen):
  // not counted in the denominator and not scored. Distinct from `status`.
  scoringFrozen: boolean("scoring_frozen").notNull().default(false),
  // Owner-controlled per-admin page access. List of admin-page ids HIDDEN from this
  // admin (the owner toggles pages off). Null/empty = all pages visible (the default),
  // so new pages are auto-visible until the owner hides them. Owners ignore this.
  blockedTabs: jsonb("blocked_tabs").$type<string[]>(),
  // Bumped on logout / password change to invalidate all previously-issued tokens. See review B-02.
  tokenVersion: integer("token_version").notNull().default(0),
  // Gamification (v2 Phase 1). Current consecutive-active-days streak, the best the
  // student ever reached, and the last calendar day (Africa/Cairo) they were active —
  // the streak engine compares `last_active_day` to today/yesterday on each activity.
  // `daily_goal_minutes` is the student's per-day study target (drives the goal ring).
  streakCount: integer("streak_count").notNull().default(0),
  streakBest: integer("streak_best").notNull().default(0),
  lastActiveDay: date("last_active_day", { mode: "string" }),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(30),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, joinedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
