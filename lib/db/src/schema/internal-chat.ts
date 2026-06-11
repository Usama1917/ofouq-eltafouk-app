import { integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Internal team chat between owners and admins. Three conversation kinds:
//   - "owners": one group for all owners
//   - "all":    one group for all owners + admins
//   - "direct": one private 1:1 per (admin, owner) pair
// Group membership is NOT stored — it's derived from usersTable.role at read
// time, so it auto-updates as staff change. Only "direct" rows carry the pair.
export const internalConversationsTable = pgTable(
  "internal_conversations",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // "owners" | "all" | "direct"
    adminId: integer("admin_id").references(() => usersTable.id, { onDelete: "cascade" }),
    ownerId: integer("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // One direct conversation per (admin, owner) pair. Group singletons (NULL,
    // NULL) are guarded in code via getOrCreateGroupConversation, not here.
    directUnique: unique("internal_conversations_direct_uniq").on(table.adminId, table.ownerId),
  }),
);

export const internalMessagesTable = pgTable("internal_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => internalConversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").references(() => usersTable.id, { onDelete: "set null" }),
  senderRole: text("sender_role").notNull(), // snapshot: "owner" | "admin"
  body: text("body"), // nullable — image-only messages allowed
  imageUrl: text("image_url"),
  mentions: jsonb("mentions").$type<number[]>(), // mentioned user ids
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"), // soft delete → tombstone
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-(conversation, user) read marker. Unread for a user = messages newer than
// their lastReadAt (works for groups where readAt-per-message can't).
export const internalConversationReadsTable = pgTable(
  "internal_conversation_reads",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => internalConversationsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
  },
  (table) => ({
    readUnique: unique("internal_conversation_reads_uniq").on(table.conversationId, table.userId),
  }),
);

export const insertInternalConversationSchema = createInsertSchema(internalConversationsTable).omit({
  id: true,
  createdAt: true,
});
export const insertInternalMessageSchema = createInsertSchema(internalMessagesTable).omit({
  id: true,
  createdAt: true,
});
export const insertInternalConversationReadSchema = createInsertSchema(internalConversationReadsTable).omit({
  id: true,
});

export type InternalConversation = typeof internalConversationsTable.$inferSelect;
export type InternalMessage = typeof internalMessagesTable.$inferSelect;
export type InternalConversationRead = typeof internalConversationReadsTable.$inferSelect;

export type InsertInternalConversation = z.infer<typeof insertInternalConversationSchema>;
export type InsertInternalMessage = z.infer<typeof insertInternalMessageSchema>;
export type InsertInternalConversationRead = z.infer<typeof insertInternalConversationReadSchema>;
