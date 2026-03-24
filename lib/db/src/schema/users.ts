import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull().default(""),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("active"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  age: integer("age"),
  address: text("address"),
  parentPhone: text("parent_phone"),
  specialty: text("specialty"),
  qualifications: text("qualifications"),
  howDidYouHear: text("how_did_you_hear"),
  supportNeeded: text("support_needed"),
  bio: text("bio"),
  governorate: text("governorate"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, joinedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
