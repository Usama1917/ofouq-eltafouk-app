import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { academicYearsTable, subjectsTable } from "./academic";

export const subjectSubscriptionRequestsTable = pgTable(
  "subject_subscription_requests",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    yearId: integer("year_id").notNull().references(() => academicYearsTable.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    codeImageUrl: text("code_image_url"),
    status: text("status").notNull().default("pending"),
    reviewNotes: text("review_notes").notNull().default(""),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (table) => ({
    requestUniq: unique("subject_subscription_requests_student_subject_code_uniq").on(
      table.studentId,
      table.subjectId,
      table.code,
      table.status,
    ),
  }),
);

export const subjectSubscriptionsTable = pgTable(
  "subject_subscriptions",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    yearId: integer("year_id").notNull().references(() => academicYearsTable.id, { onDelete: "cascade" }),
    subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("book_code"),
    status: text("status").notNull().default("active"),
    grantedByRequestId: integer("granted_by_request_id").references(() => subjectSubscriptionRequestsTable.id, {
      onDelete: "set null",
    }),
    grantedByUserId: integer("granted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    studentSubjectUnique: unique("subject_subscriptions_student_subject_uniq").on(table.studentId, table.subjectId),
  }),
);

export const insertSubjectSubscriptionRequestSchema = createInsertSchema(subjectSubscriptionRequestsTable).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
});
export const insertSubjectSubscriptionSchema = createInsertSchema(subjectSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SubjectSubscriptionRequest = typeof subjectSubscriptionRequestsTable.$inferSelect;
export type SubjectSubscription = typeof subjectSubscriptionsTable.$inferSelect;

export type InsertSubjectSubscriptionRequest = z.infer<typeof insertSubjectSubscriptionRequestSchema>;
export type InsertSubjectSubscription = z.infer<typeof insertSubjectSubscriptionSchema>;
