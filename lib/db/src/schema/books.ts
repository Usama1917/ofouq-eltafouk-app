import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const booksTable = pgTable("books", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  subject: text("subject").notNull().default("علوم"),
  coverUrl: text("cover_url"),
  pointsPrice: integer("points_price").notNull().default(0),
  priceEgp: integer("price_egp").notNull().default(0),
  originalPriceEgp: integer("original_price_egp"),
  sortOrder: integer("sort_order").notNull().default(0),
  freeShipping: boolean("free_shipping").notNull().default(false),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookReservationsTable = pgTable("book_reservations", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookPurchasesTable = pgTable("book_purchases", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id),
  pointsSpent: integer("points_spent").notNull(),
  originalPriceEgp: integer("original_price_egp").notNull().default(0),
  discountPercent: integer("discount_percent").notNull().default(0),
  discountAmountEgp: integer("discount_amount_egp").notNull().default(0),
  finalPriceEgp: integer("final_price_egp").notNull().default(0),
  shippingCostEgp: integer("shipping_cost_egp").notNull().default(0),
  voucherCode: text("voucher_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookVouchersTable = pgTable("book_vouchers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  bookId: integer("book_id").references(() => booksTable.id, { onDelete: "cascade" }),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: integer("discount_value").notNull().default(0),
  discountPercent: integer("discount_percent").notNull(),
  active: boolean("active").notNull().default(true),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBookSchema = createInsertSchema(booksTable).omit({ id: true, createdAt: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
export type BookReservation = typeof bookReservationsTable.$inferSelect;
export type BookPurchase = typeof bookPurchasesTable.$inferSelect;
export type BookVoucher = typeof bookVouchersTable.$inferSelect;
