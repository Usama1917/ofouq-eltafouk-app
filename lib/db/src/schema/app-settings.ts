import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Single-row APP-WIDE settings, editable by the OWNER from the web panel
// («الإعدادات» tab). Mirrors the store_settings singleton pattern.
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  // Blocks screenshots / screen recording on the mobile app's protected screens
  // (the lesson video player). true = blocked (the app's historical behavior);
  // false = students may capture freely. The mobile app fail-safes to TRUE when
  // it can't reach the server, so a network error never lowers protection.
  screenCaptureBlockEnabled: boolean("screen_capture_block_enabled").notNull().default(true),
  // Cursor for the ERPNext order-status poll. The ERP hands back a `changed_at`
  // watermark with every batch; we store it and send it as `since` next time so
  // each pass only sees what actually moved. null = never polled, which asks the
  // ERP for the current state of every app order.
  erpPollCursor: text("erp_poll_cursor"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
