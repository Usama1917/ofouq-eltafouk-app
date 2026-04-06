import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  subject: text("subject").notNull(),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  posterUrl: text("poster_url"),
  duration: integer("duration").notNull().default(0),
  instructor: text("instructor").notNull(),
  videoType: text("video_type").notNull().default("youtube"),
  publishStatus: text("publish_status").notNull().default("published"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const videoSegmentsTable = pgTable("video_segments", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startSeconds: integer("start_seconds").notNull().default(0),
  segmentType: text("segment_type").notNull().default("parts"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true });
export const insertVideoSegmentSchema = createInsertSchema(videoSegmentsTable).omit({ id: true, createdAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertVideoSegment = z.infer<typeof insertVideoSegmentSchema>;
export type Video = typeof videosTable.$inferSelect;
export type VideoSegment = typeof videoSegmentsTable.$inferSelect;
