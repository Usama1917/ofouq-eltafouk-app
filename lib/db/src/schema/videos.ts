import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const videosTable = pgTable("videos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // English counterparts (nullable; app falls back to Arabic when absent).
  titleEn: text("title_en"),
  descriptionEn: text("description_en"),
  instructorEn: text("instructor_en"),
  subject: text("subject").notNull(),
  videoUrl: text("video_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  posterUrl: text("poster_url"),
  duration: integer("duration").notNull().default(0),
  instructor: text("instructor").notNull(),
  videoType: text("video_type").notNull().default("youtube"),
  publishStatus: text("publish_status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // GET /videos orders by createdAt desc. See review B-33.
  createdIdx: index("videos_created_idx").on(table.createdAt),
}));

export const videoSegmentsTable = pgTable("video_segments", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => videosTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleEn: text("title_en"),
  startSeconds: integer("start_seconds").notNull().default(0),
  segmentType: text("segment_type").notNull().default("parts"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Loaded on every lesson/video open. See review B-28.
  videoIdx: index("video_segments_video_idx").on(table.videoId, table.orderIndex),
}));

export const insertVideoSchema = createInsertSchema(videosTable).omit({ id: true, createdAt: true });
export const insertVideoSegmentSchema = createInsertSchema(videoSegmentsTable).omit({ id: true, createdAt: true });
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type InsertVideoSegment = z.infer<typeof insertVideoSegmentSchema>;
export type Video = typeof videosTable.$inferSelect;
export type VideoSegment = typeof videoSegmentsTable.$inferSelect;
