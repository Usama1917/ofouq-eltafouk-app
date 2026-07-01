import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Moral review (v2). When a user sets/changes a PUBLIC identity field (name or
 * avatar), the change applies to their own `users` row immediately but does NOT
 * become public until an admin approves it here. One row = one separate "message"
 * per field, so changing both the name and the photo creates two requests.
 */
export const profileModerationRequestsTable = pgTable(
  "profile_moderation_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Which public field this request is for: "name" | "avatar".
    field: text("field").notNull(),
    // The new value the user set (the name text, or the avatar URL).
    proposedValue: text("proposed_value"),
    // The previous public (approved) value, kept for the admin's before/after view.
    previousValue: text("previous_value"),
    // "pending" | "approved" | "rejected" | "superseded".
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: integer("reviewed_by"),
  },
  (t) => ({
    statusIdx: index("pmr_status_idx").on(t.status),
    userIdx: index("pmr_user_idx").on(t.userId),
  }),
);

/** Audit log for each admin "report" action (5 → auto-suspend the reported user). */
export const userReportsTable = pgTable(
  "user_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reportedBy: integer("reported_by").notNull(),
    requestId: integer("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_reports_user_idx").on(t.userId),
  }),
);

export type ProfileModerationRequest = typeof profileModerationRequestsTable.$inferSelect;
export type UserReport = typeof userReportsTable.$inferSelect;
