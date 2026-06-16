import { pgTable, serial, text, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  authorName: text("author_name").notNull(),
  authorAvatar: text("author_avatar"),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdIdx: index("posts_created_idx").on(table.createdAt),
}));

export const commentsTable = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id),
  content: text("content").notNull(),
  authorName: text("author_name").notNull(),
  authorAvatar: text("author_avatar"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  postIdx: index("comments_post_idx").on(table.postId, table.createdAt),
}));

export const postLikesTable = pgTable("post_likes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // One like per (post, session): lets the route use onConflictDoNothing + atomic counter. See review B-18.
  postSessionUniq: unique("post_likes_post_session_uniq").on(table.postId, table.sessionId),
}));

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, likesCount: true, commentsCount: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
export type Comment = typeof commentsTable.$inferSelect;
