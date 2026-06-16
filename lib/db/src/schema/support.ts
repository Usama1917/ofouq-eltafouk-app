import { integer, pgTable, serial, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const supportConversationsTable = pgTable(
  "support_conversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  source: text("source").notNull().default("manual"),
  automationKey: text("automation_key"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Admin support inbox: per-conversation and per-sender history. See review B-10.
  conversationIdx: index("support_messages_conversation_idx").on(table.conversationId, table.createdAt),
  senderIdx: index("support_messages_sender_idx").on(table.senderId, table.createdAt),
}));

export const supportAutomaticMessagesTable = pgTable("support_automatic_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => supportConversationsTable.id, { onDelete: "set null" }),
  messageId: integer("message_id").references(() => supportMessagesTable.id, { onDelete: "set null" }),
  automationKey: text("automation_key").notNull(),
  triggerLabel: text("trigger_label").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
export const insertSupportAutomaticMessageSchema = createInsertSchema(supportAutomaticMessagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SupportConversation = typeof supportConversationsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
export type SupportAutomaticMessage = typeof supportAutomaticMessagesTable.$inferSelect;

export type InsertSupportConversation = z.infer<typeof insertSupportConversationSchema>;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type InsertSupportAutomaticMessage = z.infer<typeof insertSupportAutomaticMessageSchema>;
