import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  phone: text("phone"),
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
  // Bumped on logout / password change to invalidate all previously-issued tokens. See review B-02.
  tokenVersion: integer("token_version").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, joinedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
