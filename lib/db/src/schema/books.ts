import { pgTable, serial, text, integer, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core";
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
  // v2 — store card art. The portrait (3:4) image shows in the 2-column grid;
  // the landscape (16:9) image shows when a book sits alone on its row (full
  // width). Dark variants are optional — the app falls back to the light image
  // when a dark one is absent, and both fall back to `coverUrl` for old books.
  coverPortraitUrl: text("cover_portrait_url"),
  coverLandscapeUrl: text("cover_landscape_url"),
  coverPortraitDarkUrl: text("cover_portrait_dark_url"),
  coverLandscapeDarkUrl: text("cover_landscape_dark_url"),
  pointsPrice: integer("points_price").notNull().default(0),
  priceEgp: integer("price_egp").notNull().default(0),
  originalPriceEgp: integer("original_price_egp"),
  sortOrder: integer("sort_order").notNull().default(0),
  freeShipping: boolean("free_shipping").notNull().default(false),
  available: boolean("available").notNull().default(true),
  // ── v2 Phase 5 — store (Amazon-style) additive columns ────────────────────
  // Units in stock; the store hides / blocks checkout when this reaches 0.
  stockQuantity: integer("stock_quantity").notNull().default(0),
  // Extra product-gallery image URLs beyond `coverUrl` (nullable = none yet).
  imageUrls: jsonb("image_urls").$type<string[]>(),
  // Optional shipping weight in grams (feeds governorate shipping calc later).
  weightGrams: integer("weight_grams"),
  // The academic subject this book unlocks digitally once bought (nullable = a
  // book with no digital content). Plain int (no FK) to avoid a cross-schema
  // import cycle; the store joins it to `subjects` manually.
  unlocksSubjectId: integer("unlocks_subject_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookReservationsTable = pgTable("book_reservations", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => booksTable.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bookIdx: index("book_reservations_book_idx").on(table.bookId),
}));

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bookIdx: index("book_purchases_book_idx").on(table.bookId),
}));

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
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  bookIdx: index("book_vouchers_book_idx").on(table.bookId),
}));

export const insertBookSchema = createInsertSchema(booksTable).omit({ id: true, createdAt: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof booksTable.$inferSelect;
export type BookReservation = typeof bookReservationsTable.$inferSelect;
export type BookPurchase = typeof bookPurchasesTable.$inferSelect;
export type BookVoucher = typeof bookVouchersTable.$inferSelect;
