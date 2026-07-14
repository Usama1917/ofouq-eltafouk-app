import crypto from "node:crypto";
import { db, authOtpChallengesTable, usersTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { sendSms } from "./sms";
import { logger } from "./logger";

// ── One-time-password (OTP) engine ──────────────────────────────────────────
// Codes are short numeric strings delivered over SMS (email later). They are NEVER
// stored in plaintext: only a keyed HMAC of the code lives in the DB, so a database
// leak can't reveal live codes. Each challenge is single-purpose, time-boxed, and
// burned after a small number of wrong guesses. See schema `auth_otp_challenges`.

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "dev-only-insecure-key-do-not-use-in-production";

function intEnv(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const CODE_LENGTH = Math.min(Math.max(intEnv("OTP_CODE_LENGTH", 6), 4), 8);
const TTL_SECONDS = intEnv("OTP_TTL_SECONDS", 300); // 5 minutes
const MAX_ATTEMPTS = intEnv("OTP_MAX_ATTEMPTS", 5);
const MAX_RESENDS = intEnv("OTP_MAX_RESENDS", 5);
const RESEND_COOLDOWN_SECONDS = intEnv("OTP_RESEND_COOLDOWN_SECONDS", 60);

export type OtpPurpose = "login" | "phone_verify" | "recovery";

export type CreateChallengeResult = {
  challengeId: string;
  maskedDestination: string;
  expiresAt: Date;
  // Present ONLY when the console SMS provider is active (dev/test) so the flow can
  // be exercised without a real gateway. Never populated in production.
  devCode?: string;
};

export type VerifyResult =
  | { ok: true; userId: number; purpose: OtpPurpose; destination: string }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "already_used" | "wrong_code" };

function hashCode(code: string): string {
  return crypto.createHmac("sha256", AUTH_SECRET).update(`otp:${code}`).digest("base64url");
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function generateNumericCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i += 1) code += String(crypto.randomInt(0, 10));
  return code;
}

/** Mask a phone/email so the client can show "we sent a code to ****1234" without leaking it. */
export function maskDestination(destination: string, channel: "sms" | "email"): string {
  if (channel === "email") {
    const [local = "", domain = ""] = destination.split("@");
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }
  const tail = destination.slice(-4);
  return `${"*".repeat(Math.max(destination.length - 4, 3))}${tail}`;
}

function buildMessage(code: string): string {
  // Western digits per the app's i18n convention. Sender name shown by the gateway.
  return `كود التحقق للتفوق: ${code}\nصالح لمدة ${Math.round(TTL_SECONDS / 60)} دقائق. لا تشاركه مع أحد.`;
}

/**
 * Create (or replace) a pending OTP challenge for a user and send the code.
 * Any earlier un-consumed challenge for the same (user, purpose) is removed first,
 * so only one code is ever live per purpose.
 */
export async function createChallenge(args: {
  userId: number;
  purpose: OtpPurpose;
  destination: string;
  channel?: "sms" | "email";
}): Promise<CreateChallengeResult> {
  const channel = args.channel ?? "sms";
  // Drop any prior pending challenge for this purpose (single live code per purpose).
  await db
    .delete(authOtpChallengesTable)
    .where(and(eq(authOtpChallengesTable.userId, args.userId), eq(authOtpChallengesTable.purpose, args.purpose)));

  const code = generateNumericCode(CODE_LENGTH);
  const challengeId = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await db.insert(authOtpChallengesTable).values({
    challengeId,
    userId: args.userId,
    purpose: args.purpose,
    channel,
    destination: args.destination,
    codeHash: hashCode(code),
    expiresAt,
  });

  const sent = await sendSms(args.destination, buildMessage(code));
  if (!sent.ok) {
    logger.error({ userId: args.userId, purpose: args.purpose, provider: sent.provider }, "OTP send failed");
  }

  const result: CreateChallengeResult = {
    challengeId,
    maskedDestination: maskDestination(args.destination, channel),
    expiresAt,
  };
  // Expose the code locally only when the console (no-op) provider is in use.
  if (sent.provider === "console") result.devCode = code;
  return result;
}

/** Resend the code for an existing challenge, throttled by cooldown + a resend cap. */
export async function resendChallenge(challengeId: string): Promise<
  | { ok: true; result: CreateChallengeResult }
  | { ok: false; reason: "not_found" | "expired" | "too_many_resends" | "cooldown"; retryAfterSeconds?: number }
> {
  const [row] = await db
    .select()
    .from(authOtpChallengesTable)
    .where(eq(authOtpChallengesTable.challengeId, challengeId))
    .limit(1);
  if (!row || row.consumedAt) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.resendCount >= MAX_RESENDS) return { ok: false, reason: "too_many_resends" };

  const sinceLast = (Date.now() - row.lastSentAt.getTime()) / 1000;
  if (sinceLast < RESEND_COOLDOWN_SECONDS) {
    return { ok: false, reason: "cooldown", retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast) };
  }

  const code = generateNumericCode(CODE_LENGTH);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  await db
    .update(authOtpChallengesTable)
    .set({
      codeHash: hashCode(code),
      expiresAt,
      attempts: 0,
      resendCount: sql`${authOtpChallengesTable.resendCount} + 1`,
      lastSentAt: new Date(),
    })
    .where(eq(authOtpChallengesTable.challengeId, challengeId));

  const channel = (row.channel as "sms" | "email") ?? "sms";
  const sent = await sendSms(row.destination, buildMessage(code));
  if (!sent.ok) {
    logger.error({ challengeId, provider: sent.provider }, "OTP resend failed");
  }
  const result: CreateChallengeResult = {
    challengeId,
    maskedDestination: maskDestination(row.destination, channel),
    expiresAt,
  };
  if (sent.provider === "console") result.devCode = code;
  return { ok: true, result };
}

/**
 * Verify a submitted code against a pending challenge. On success the challenge is
 * consumed (single-use). Wrong guesses increment a counter and burn the challenge
 * once the cap is reached.
 */
export async function verifyChallenge(challengeId: string, code: string): Promise<VerifyResult> {
  const submitted = String(code ?? "").trim();
  const [row] = await db
    .select()
    .from(authOtpChallengesTable)
    .where(eq(authOtpChallengesTable.challengeId, challengeId))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt) return { ok: false, reason: "already_used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (!constantTimeEquals(hashCode(submitted), row.codeHash)) {
    const attempts = row.attempts + 1;
    await db
      .update(authOtpChallengesTable)
      .set({ attempts })
      .where(eq(authOtpChallengesTable.challengeId, challengeId));
    if (attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
    return { ok: false, reason: "wrong_code" };
  }

  await db
    .update(authOtpChallengesTable)
    .set({ consumedAt: new Date() })
    .where(eq(authOtpChallengesTable.challengeId, challengeId));
  return { ok: true, userId: row.userId, purpose: row.purpose as OtpPurpose, destination: row.destination };
}

/** Best-effort cleanup of expired/consumed challenges. Safe to call periodically. */
export async function purgeExpiredChallenges(): Promise<void> {
  try {
    await db.delete(authOtpChallengesTable).where(lt(authOtpChallengesTable.expiresAt, new Date()));
  } catch (err) {
    logger.warn({ err }, "OTP purge failed");
  }
}

export const otpConfig = {
  codeLength: CODE_LENGTH,
  ttlSeconds: TTL_SECONDS,
  maxAttempts: MAX_ATTEMPTS,
  maxResends: MAX_RESENDS,
  resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
};

// Re-exported so routes can mark a user's phone verified without importing the table directly.
export { usersTable };
