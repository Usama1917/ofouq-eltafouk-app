import { pgTable, serial, text, integer, timestamp, index, boolean } from "drizzle-orm/pg-core";
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
  // v2 Phase 2 (quiz): how many questions to serve per attempt from this video's
  // question bank (random sample). Null = serve all published questions. The card
  // only shows when the video has ≥1 published question (see schema/quiz.ts).
  quizQuestionCount: integer("quiz_question_count"),
  // v2 Phase 2 (quiz): the language of THIS video's quiz — set once per exam by the
  // admin. Drives the mobile exam layout direction (option letter side + text align):
  // "ar" → letters on the right / RTL, "en" → letters on the left / LTR. Default "ar".
  quizLanguage: text("quiz_language").notNull().default("ar"),
  // v2 Phase 2 (quiz watch-gate): when enabled, the quiz stays LOCKED until the
  // student has really watched (playback coverage — seeking does NOT count) at least
  // `quizWatchGatePercent`% of the video's duration. Per-video, admin-controlled;
  // admin/owner bypass. Enforced server-side in routes/quiz.ts. Default: off / 75%.
  quizWatchGateEnabled: boolean("quiz_watch_gate_enabled").notNull().default(false),
  quizWatchGatePercent: integer("quiz_watch_gate_percent").notNull().default(75),
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
