import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// One-time-password challenges for two-factor login, first-time phone verification,
// and account recovery. The code itself is NEVER stored in plaintext — only a
// keyed hash (see api-server lib/otp.ts). A random `challengeId` is handed to the
// client so it can reference the pending challenge without exposing the user id or
// an enumerable integer key. Rows are short-lived (a few minutes) and consumed on
// successful verification; a periodic cleanup deletes expired rows.
export const authOtpChallengesTable = pgTable(
  "auth_otp_challenges",
  {
    id: serial("id").primaryKey(),
    // Opaque, high-entropy handle returned to the client (not the integer id).
    challengeId: text("challenge_id").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // "login" | "phone_verify" | "recovery"
    purpose: text("purpose").notNull(),
    // "sms" | "email"
    channel: text("channel").notNull().default("sms"),
    // The phone/email the code was sent to (stored so a resend hits the same target;
    // surfaced to the client only masked, e.g. ******1234).
    destination: text("destination").notNull(),
    // Keyed hash of the code — never the code itself.
    codeHash: text("code_hash").notNull(),
    // Failed verification attempts; the challenge is burned past a small cap.
    attempts: integer("attempts").notNull().default(0),
    // How many times a fresh code was (re)sent for this challenge — throttles resend.
    resendCount: integer("resend_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set once the code is verified; a consumed challenge can't be reused.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Client looks a pending challenge up by its opaque handle.
    challengeIdIdx: index("auth_otp_challenge_id_idx").on(table.challengeId),
    // Rate-limit / "latest pending challenge" lookups are scoped per user+purpose.
    userPurposeIdx: index("auth_otp_user_purpose_idx").on(table.userId, table.purpose),
    // Expiry sweep deletes WHERE expires_at < now().
    expiresIdx: index("auth_otp_expires_idx").on(table.expiresAt),
  }),
);

export const insertAuthOtpChallengeSchema = createInsertSchema(authOtpChallengesTable).omit({
  id: true,
  createdAt: true,
});

export type AuthOtpChallenge = typeof authOtpChallengesTable.$inferSelect;
export type InsertAuthOtpChallenge = z.infer<typeof insertAuthOtpChallengeSchema>;
