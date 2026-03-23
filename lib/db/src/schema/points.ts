import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pointsAccountTable = pgTable("points_account", {
  id: serial("id").primaryKey(),
  balance: integer("balance").notNull().default(100),
  totalEarned: integer("total_earned").notNull().default(100),
  totalSpent: integer("total_spent").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pointsTransactionsTable = pgTable("points_transactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPointsTransaction = z.infer<typeof insertPointsTransactionSchema>;
export type PointsAccount = typeof pointsAccountTable.$inferSelect;
export type PointsTransaction = typeof pointsTransactionsTable.$inferSelect;
