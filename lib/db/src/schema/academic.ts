import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { videosTable } from "./videos";

export const academicYearsTable = pgTable("academic_years", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  orderIndex: integer("order_index").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subjectsTable = pgTable("subjects", {
  id: serial("id").primaryKey(),
  yearId: integer("year_id").notNull().references(() => academicYearsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📚"),
  description: text("description").notNull().default(""),
  orderIndex: integer("order_index").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  orderIndex: integer("order_index").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lessonsTable = pgTable("lessons", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Nullable by design: lesson can be created first, then media attached.
  videoId: integer("video_id").references(() => videosTable.id, { onDelete: "set null" }),
  orderIndex: integer("order_index").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAcademicYearSchema = createInsertSchema(academicYearsTable).omit({ id: true, createdAt: true });
export const insertSubjectSchema = createInsertSchema(subjectsTable).omit({ id: true, createdAt: true });
export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true });
export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ id: true, createdAt: true });

export type AcademicYear = typeof academicYearsTable.$inferSelect;
export type Subject = typeof subjectsTable.$inferSelect;
export type Unit = typeof unitsTable.$inferSelect;
export type Lesson = typeof lessonsTable.$inferSelect;

export type InsertAcademicYear = z.infer<typeof insertAcademicYearSchema>;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type InsertLesson = z.infer<typeof insertLessonSchema>;
