import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Per-student points wallet. Each student gets exactly one row (unique user_id).
// The legacy demo data had a single shared account with no owner; `userId` is
// nullable only so that old row survives `push` — every real wallet created by the
// API sets userId, and the unique index keeps it one-account-per-student.
export const pointsAccountTable = pgTable("points_account", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  balance: integer("balance").notNull().default(0),
  totalEarned: integer("total_earned").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pointsTransactionsTable = pgTable(
  "points_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    // "earn" (lesson/quiz/daily) | "spend" (rewards) | "purchase" | "adjust"
    type: text("type").notNull(),
    // A stable key for idempotent earns, e.g. "lesson_complete:42". The unique index
    // below stops the same event from being awarded twice for the same user.
    sourceKey: text("source_key"),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("points_tx_user_created_idx").on(table.userId, table.createdAt),
    // De-dupe earns: at most one row per (user, sourceKey). Spends/purchases pass a
    // null sourceKey and Postgres treats nulls as distinct, so they aren't constrained.
    userSourceIdx: uniqueIndex("points_tx_user_source_idx").on(table.userId, table.sourceKey),
  }),
);

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPointsTransaction = z.infer<typeof insertPointsTransactionSchema>;
export type PointsAccount = typeof pointsAccountTable.$inferSelect;
export type PointsTransaction = typeof pointsTransactionsTable.$inferSelect;
