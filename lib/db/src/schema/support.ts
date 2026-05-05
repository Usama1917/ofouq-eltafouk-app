import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const supportConversationsTable = pgTable(
  "support_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userUnique: unique("support_conversations_user_uniq").on(table.userId),
  }),
);

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => supportConversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").references(() => usersTable.id, { onDelete: "set null" }),
  senderRole: text("sender_role").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupportConversationSchema = createInsertSchema(supportConversationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSupportMessageSchema = createInsertSchema(supportMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type SupportConversation = typeof supportConversationsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;

export type InsertSupportConversation = z.infer<typeof insertSupportConversationSchema>;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
