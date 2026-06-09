import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// First-time student onboarding/intro answers. One row per student (unique userId).
// Stores STABLE internal option keys (e.g. "facebook", "secondary_1") — never the
// display label — so Arabic/English labels can change without touching the data.
export const studentOnboardingResponsesTable = pgTable("student_onboarding_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  heardAboutUs: text("heard_about_us"),
  gradeLevel: text("grade_level"),
  // JSON array of subject keys, e.g. ["physics","chemistry"]. Nullable; treat null as [].
  interestedSubjects: jsonb("interested_subjects").$type<string[]>(),
  mainGoal: text("main_goal"),
  currentLevel: text("current_level"),
  learningPreference: text("learning_preference"),
  preferredStudyTime: text("preferred_study_time"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type StudentOnboardingResponse = typeof studentOnboardingResponsesTable.$inferSelect;
