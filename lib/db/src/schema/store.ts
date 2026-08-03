import { pgTable, serial, integer, text, boolean, timestamp, index, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { booksTable } from "./books";

// ── v2 Phase 5 — bookstore (Amazon-style: cart → order → shipment tracking) ──
// Everything here is ADDITIVE and independent of the legacy points-redemption
// path (book_reservations / book_purchases in ./books stay untouched).

// One row per (student, book) currently in the student's cart. Quantity is
// bumped instead of inserting duplicate rows.
export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userBookUnique: unique("cart_items_user_book_uniq").on(table.userId, table.bookId),
    userIdx: index("cart_items_user_idx").on(table.userId),
  }),
);

// Saved delivery addresses for a student. One may be flagged default.
export const shippingAddressesTable = pgTable(
  "shipping_addresses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    governorate: text("governorate").notNull(),
    city: text("city").notNull().default(""),
    street: text("street").notNull().default(""),
    notes: text("notes"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("shipping_addresses_user_idx").on(table.userId),
  }),
);

// A placed order. Money + address are SNAPSHOTTED at checkout so later edits to
// the book or the address never rewrite history. Status drives shipment tracking.
// Lifecycle: placed → confirmed → packed → shipped → out_for_delivery → delivered
//            (+ cancelled at any point).
export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    // Human-friendly order code (e.g. "OF-000123"); filled server-side from id.
    orderNumber: text("order_number"),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("placed"),
    // Address snapshot (copied from shipping_addresses at checkout).
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    governorate: text("governorate").notNull(),
    city: text("city").notNull().default(""),
    street: text("street").notNull().default(""),
    addressNotes: text("address_notes"),
    // Money snapshot (all in EGP, integer pounds).
    subtotalEgp: integer("subtotal_egp").notNull().default(0),
    shippingEgp: integer("shipping_egp").notNull().default(0),
    discountEgp: integer("discount_egp").notNull().default(0),
    totalEgp: integer("total_egp").notNull().default(0),
    voucherCode: text("voucher_code"),
    // "cod" (cash on delivery) to start; card/wallet gateways come later.
    paymentMethod: text("payment_method").notNull().default("cod"),
    // ── ERPNext sync ────────────────────────────────────────────────────────
    // Checkout must NEVER fail because the ERP is unreachable, so an order is
    // saved first and pushed after: this column is the outbox state driving the
    // retry worker.
    //   pending → not pushed yet · sent → the invoice exists · failed → retrying
    //   skipped → integration disabled/not configured (nothing to do)
    erpSyncState: text("erp_sync_state").notNull().default("pending"),
    // The ERPNext Sales Invoice name (e.g. "ACC-SINV-2026-00123"). Also the
    // idempotency marker: an order that already has one is never pushed twice.
    erpInvoiceName: text("erp_invoice_name"),
    // Last failure reason, surfaced in the admin so a stuck order is visible
    // rather than silently missing from the ERP.
    erpSyncError: text("erp_sync_error"),
    erpSyncedAt: timestamp("erp_synced_at", { withTimezone: true }),
    // Courier waybill ("بوليصة") assigned in the ERP. `shippingNumber` is the
    // first/primary one; `shippingNumbers` holds them all, because one order can
    // be split across several packages and therefore several waybills — without
    // the list a split shipment is indistinguishable from a single one.
    shippingNumber: text("shipping_number"),
    shippingNumbers: jsonb("shipping_numbers").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("orders_user_idx").on(table.userId),
    statusIdx: index("orders_status_idx").on(table.status),
    // The retry worker scans for pending/failed pushes every cycle — without this
    // it would sequential-scan the whole orders table each time.
    erpSyncIdx: index("orders_erp_sync_idx").on(table.erpSyncState),
    // Status webhooks arrive keyed by the ERP's invoice name, so that lookup is
    // the hot path on the inbound side.
    erpInvoiceIdx: index("orders_erp_invoice_idx").on(table.erpInvoiceName),
  }),
);

// Line items of an order. Title + unit price are snapshotted so the receipt is
// stable even if the book is later renamed, repriced, or deleted.
export const orderItemsTable = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    // Kept even if the catalog book is later removed (snapshot below carries it).
    bookId: integer("book_id").references(() => booksTable.id, { onDelete: "set null" }),
    titleSnapshot: text("title_snapshot").notNull(),
    unitPriceEgp: integer("unit_price_egp").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => ({
    orderIdx: index("order_items_order_idx").on(table.orderId),
  }),
);

// Append-only timeline of an order's status changes — powers the student's
// "track my order" screen and the admin audit of who moved it when.
export const orderStatusHistoryTable = pgTable(
  "order_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index("order_status_history_order_idx").on(table.orderId),
  }),
);

// ── Shipping rate table (admin-editable, per-governorate via zones) ───────────
// Egypt Post "Wassalha" tariff: a base price covers up to `baseWeightGrams`,
// then `perExtraKgEgp` for each additional kg. The admin edits these freely
// (prices are seeded from public estimates; the owner plugs in contract rates).
export const shippingZonesTable = pgTable(
  "shipping_zones",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    basePriceEgp: integer("base_price_egp").notNull().default(0),
    perExtraKgEgp: integer("per_extra_kg_egp").notNull().default(0),
    baseWeightGrams: integer("base_weight_grams").notNull().default(2000),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Maps each of Egypt's 27 governorates (stored by the SAME Arabic string the app
// uses everywhere — see ofouq-mobile/lib/egyptGovernorates.ts) to a shipping zone.
export const governorateZonesTable = pgTable(
  "governorate_zones",
  {
    id: serial("id").primaryKey(),
    governorate: text("governorate").notNull().unique(),
    zoneId: integer("zone_id")
      .notNull()
      .references(() => shippingZonesTable.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    zoneIdx: index("governorate_zones_zone_idx").on(table.zoneId),
  }),
);

// Wishlist — a student's saved books (the ⭐/♥ in the store).
export const bookFavoritesTable = pgTable(
  "book_favorites",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => booksTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userBookUnique: unique("book_favorites_user_book_uniq").on(table.userId, table.bookId),
    userIdx: index("book_favorites_user_idx").on(table.userId),
  }),
);

// Single-row store-wide settings, editable by the admin.
export const storeSettingsTable = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  // Orders whose subtotal reaches this get free shipping (null = feature off).
  freeShippingThresholdEgp: integer("free_shipping_threshold_egp"),
  // Loyalty points earned per this many EGP of subtotal (e.g. 10 → 1pt/10 EGP).
  pointsPerEgpUnit: integer("points_per_egp_unit").notNull().default(10),
  // Books at/below this stock count show up in the admin low-stock alert.
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  // Owner-curated catalog display: an ordered list of rows. A "normal" row shows
  // 1–2 book cards statically (1 → full-width landscape, 2 → side-by-side portrait);
  // a "carousel" row holds any number of books, shows 2 at a time and auto-rotates.
  // null = no custom layout (mobile falls back to a default grid). Legacy rows saved
  // as a plain number[] are read as { type: "normal", books }.
  catalogLayout: jsonb("catalog_layout").$type<{ type: "normal" | "carousel"; title?: string; books: number[] }[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertShippingAddressSchema = createInsertSchema(shippingAddressesTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShippingAddress = z.infer<typeof insertShippingAddressSchema>;

export type CartItem = typeof cartItemsTable.$inferSelect;
export type ShippingAddress = typeof shippingAddressesTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type OrderStatusHistory = typeof orderStatusHistoryTable.$inferSelect;
export type ShippingZone = typeof shippingZonesTable.$inferSelect;
export type GovernorateZone = typeof governorateZonesTable.$inferSelect;
export type BookFavorite = typeof bookFavoritesTable.$inferSelect;
export type StoreSettings = typeof storeSettingsTable.$inferSelect;
