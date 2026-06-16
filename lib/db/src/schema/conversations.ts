import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  // Owner of the conversation. Nullable so pre-existing rows keep working; new rows
  // always set it and every query filters by it. See review B-01.
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index("conversations_user_idx").on(table.userId, table.createdAt),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
