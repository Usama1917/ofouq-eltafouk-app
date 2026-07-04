import { pgTable, serial, integer, boolean, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { videosTable } from "./videos";

// A simple table: an optional header row plus a grid of string cells. Cell text is
// plain Unicode, so symbols/equations pasted from Word/InDesign are preserved. Rendered
// on web (<table>) and on mobile (a grid of Views).
export interface QuizTable {
  headerRow: boolean;
  cells: string[][]; // rows → columns
}

// An answer option is exactly ONE of: text, image, or table (v2 Phase 2). Text carries
// Unicode symbols; complex equations/figures go in as an image; comparison/data answers
// go in as a table.
export interface QuizOptionContent {
  kind: "text" | "image" | "table";
  text?: string | null;
  imageUrl?: string | null;
  table?: QuizTable | null;
}

// Bank of quiz questions for a video lesson. Single-language (the Arabic and English
// tracks are SEPARATE subjects/videos, so a question is written in whatever language its
// subject uses — no per-question bilingual fields). A question stem is `text` (Unicode,
// may carry symbols/equations) and can additionally carry a figure (`imageUrl`) and/or a
// data table (`table`). Options are 4 content items (text/image/table each). Students get
// a RANDOM sample of `videos.quiz_question_count` published questions per attempt.
export const videoQuestionsTable = pgTable(
  "video_questions",
  {
    id: serial("id").primaryKey(),
    videoId: integer("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    // Question stem (Unicode text; may be empty when the figure/table carries it).
    text: text("text").notNull().default(""),
    // Optional figure shown with the question (e.g. /api/uploads/quiz-images/...).
    imageUrl: text("image_url"),
    // Optional data table shown with the question.
    table: jsonb("table").$type<QuizTable | null>(),
    // Exactly 4 options, each a text/image/table content item. Validated at the API layer.
    options: jsonb("options").$type<QuizOptionContent[]>().notNull(),
    correctIndex: integer("correct_index").notNull(),
    // Optional answer explanation (Unicode text).
    explanation: text("explanation"),
    // "easy" | "medium" | "hard" — admin-only, for internal organisation.
    difficulty: text("difficulty").notNull().default("medium"),
    orderIndex: integer("order_index").notNull().default(0),
    // Admin can hide a question without deleting it; hidden ones are never sampled.
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Every quiz load and the admin editor list questions by video.
    videoIdx: index("video_questions_video_idx").on(table.videoId),
  }),
);

// One row per submitted quiz attempt. `total` = how many questions the student saw
// (the sampled subset), `score` = how many were correct, `percent` =
// round(score / total * 100). `pointsAwarded` is what the wallet actually credited —
// 0 on every attempt after the first, since points are first-attempt-only (enforced
// by the awardPoints sourceKey `quiz_first:<videoId>`).
export const quizAttemptsTable = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videosTable.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    total: integer("total").notNull(),
    percent: integer("percent").notNull(),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Card summary ("last attempt") + the student's attempts history, per (user, video).
    userVideoIdx: index("quiz_attempts_user_video_idx").on(table.userId, table.videoId),
  }),
);

// One row per question in an attempt — the student's chosen option and whether it was
// right. `chosenIndex` is null when the question was left unanswered. Powers the
// "full review" screen shown after submit.
export const quizAnswersTable = pgTable(
  "quiz_attempt_answers",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => quizAttemptsTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => videoQuestionsTable.id, { onDelete: "cascade" }),
    chosenIndex: integer("chosen_index"),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => ({
    attemptIdx: index("quiz_answers_attempt_idx").on(table.attemptId),
  }),
);

export const insertVideoQuestionSchema = createInsertSchema(videoQuestionsTable).omit({ id: true, createdAt: true });
export type InsertVideoQuestion = z.infer<typeof insertVideoQuestionSchema>;
export type VideoQuestion = typeof videoQuestionsTable.$inferSelect;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
export type QuizAnswer = typeof quizAnswersTable.$inferSelect;
