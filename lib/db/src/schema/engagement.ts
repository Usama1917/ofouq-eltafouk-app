import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { lessonsTable } from "./academic";

// ── v2 Phase 4 — quick-wins bundle ────────────────────────────────────────────

// Saved / bookmarked lessons (the ⭐ star). One row per (student, lesson).
export const lessonBookmarksTable = pgTable(
  "lesson_bookmarks",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessonsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentLessonUnique: unique("lesson_bookmarks_student_lesson_uniq").on(table.studentId, table.lessonId),
    studentIdx: index("lesson_bookmarks_student_idx").on(table.studentId),
  }),
);

// Student notes pinned to a moment in a lesson's video. Private to the student.
export const lessonNotesTable = pgTable(
  "lesson_notes",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessonsTable.id, { onDelete: "cascade" }),
    // The video position (seconds) the note is anchored to; tapping the note seeks here.
    atSeconds: integer("at_seconds").notNull().default(0),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentLessonIdx: index("lesson_notes_student_lesson_idx").on(table.studentId, table.lessonId),
  }),
);

export type LessonBookmark = typeof lessonBookmarksTable.$inferSelect;
export type LessonNote = typeof lessonNotesTable.$inferSelect;
