import { Router, type IRouter, type Request } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  issueToken,
  issueTicket,
  verifyTicket,
  maybeRefreshToken,
  getSessionUserId as resolveSessionUserId,
  getSessionTokenPayload,
} from "../lib/auth";
import { createChallenge, resendChallenge, verifyChallenge, type VerifyResult } from "../lib/otp";
import { PRIVILEGED_ROLES } from "../lib/roles";

// Two-factor SMS login is gated by an explicit env flag so it can be built and
// shipped dark, then switched on only once a real SMS provider + sender ID are in
// place. Off by default → login behaves exactly as before. Applies to ALL roles
// when on (students on mobile, staff on the web portal).
const OTP_2FA_ENABLED = (process.env.OTP_2FA_ENABLED ?? "").toLowerCase() === "true";

function twoFactorRequiredFor(_user: { role: string }): boolean {
  return OTP_2FA_ENABLED;
}

// Map an OTP verification failure to an HTTP response. Shared by every verify step.
function sendOtpFailure(res: any, reason: Exclude<VerifyResult, { ok: true }>["reason"]) {
  switch (reason) {
    case "wrong_code":
      return res.status(401).json({ error: "الكود غير صحيح", code: "otp/wrong_code" });
    case "expired":
      return res.status(410).json({ error: "انتهت صلاحية الكود. اطلب كودًا جديدًا.", code: "otp/expired" });
    case "too_many_attempts":
      return res
        .status(429)
        .json({ error: "حاولت كثيرًا. اطلب كودًا جديدًا بعد قليل.", code: "otp/too_many_attempts" });
    case "already_used":
    case "not_found":
    default:
      return res.status(400).json({ error: "هذا الكود لم يعد صالحًا. اطلب كودًا جديدًا.", code: "otp/invalid" });
  }
}

// Public self-registration may only create non-privileged accounts. Admin/owner/
// moderator accounts are created through authenticated owner-only flows.
const PUBLIC_REGISTRATION_ROLES = new Set(["student", "teacher", "parent"]);

// The admin/owner web portal sends `X-Ofouq-Client: web`. That portal is STAFF-ONLY:
// students must use the mobile app, so a web login / web session / web registration
// is rejected for any non-privileged role. The mobile app sends no such header and is
// unaffected. The web frontend gates this too, but THIS is the real server-side lock.
function isAdminWebClient(req: Request): boolean {
  return (req.get("x-ofouq-client") ?? "").toLowerCase() === "web";
}
function isStaffRole(role: string | null | undefined): boolean {
  return typeof role === "string" && PRIVILEGED_ROLES.has(role);
}

const router: IRouter = Router();
const profilePhotosUploadDir = path.resolve(process.cwd(), "uploads/profile-photos");
fs.mkdirSync(profilePhotosUploadDir, { recursive: true });
const PROFILE_PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const profilePhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, profilePhotosUploadDir),
  filename: (_req, file, cb) => {
    // Server-side extension from the validated mimetype + a high-entropy name so
    // uploads can't be enumerated or carry an attacker-chosen extension (review B-03/B-19).
    const ext = PROFILE_PHOTO_EXTENSIONS[file.mimetype] ?? ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadProfilePhotoFile = multer({
  storage: profilePhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PROFILE_PHOTO_EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, GIF, or HEIC image files are allowed"));
    }
  },
});

function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

function normalizePhone(phone: unknown) {
  const value = String(phone ?? "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\s()-]/g, "");

  return value.length > 0 ? value : "";
}

// SECURITY (review B-20): do NOT reveal which identifier collided — a generic
// message prevents account/phone enumeration via the registration endpoint.
function sendRegisterConflict(res: any) {
  return res.status(409).json({
    error: "البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل",
    code: "auth/register_conflict",
  });
}

// Minimum password policy (review B-21). Applied on register + change-password.
function validatePasswordStrength(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8) {
    return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  }
  return null;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["admin:full", "owner:full"],
  admin: ["admin:full"],
  teacher: ["content:manage"],
  student: ["student:self"],
  parent: ["parent:self"],
};

function withPermissions<T extends { role: string }>(safeUser: T) {
  return {
    ...safeUser,
    permissions: ROLE_PERMISSIONS[safeUser.role] ?? ["student:self"],
  };
}

function getSessionUserId(req: any) {
  return resolveSessionUserId(req);
}

async function touchUserActivity(userId: number) {
  const [updated] = await db
    .update(usersTable)
    .set({ lastActiveAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();

  return updated;
}

function getErrorDetails(err: unknown, depth = 0): Record<string, unknown> {
  if (depth > 4) {
    return { name: "Error", message: "Max error depth reached" };
  }

  if (err instanceof Error) {
    const maybeErrorWithCause = err as Error & { code?: string; cause?: unknown };
    const details: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: maybeErrorWithCause.code,
    };
    if (maybeErrorWithCause.cause) {
      details.cause = getErrorDetails(maybeErrorWithCause.cause, depth + 1);
    }
    return details;
  }

  if (err && typeof err === "object") {
    const raw = err as { code?: string; message?: string; cause?: unknown };
    const details: Record<string, unknown> = {
      name: "NonErrorObject",
      message: raw.message ?? String(err),
      code: raw.code,
    };
    if (raw.cause) {
      details.cause = getErrorDetails(raw.cause, depth + 1);
    }
    return details;
  }

  return { name: "UnknownError", message: String(err) };
}

function collectErrorSignals(err: unknown, acc: string[] = [], depth = 0) {
  if (depth > 4 || !err) return acc;

  if (err instanceof Error) {
    const maybeErrorWithCause = err as Error & { code?: string; cause?: unknown };
    if (typeof maybeErrorWithCause.code === "string" && maybeErrorWithCause.code) {
      acc.push(maybeErrorWithCause.code);
    }
    if (typeof maybeErrorWithCause.message === "string" && maybeErrorWithCause.message) {
      acc.push(maybeErrorWithCause.message);
    }
    if (maybeErrorWithCause.cause) {
      collectErrorSignals(maybeErrorWithCause.cause, acc, depth + 1);
    }
    return acc;
  }

  if (typeof err === "object") {
    const raw = err as { code?: string; message?: string; cause?: unknown };
    if (typeof raw.code === "string" && raw.code) acc.push(raw.code);
    if (typeof raw.message === "string" && raw.message) acc.push(raw.message);
    if (raw.cause) collectErrorSignals(raw.cause, acc, depth + 1);
  }

  return acc;
}

function isDatabaseUnavailableError(err: unknown) {
  const signals = collectErrorSignals(err).map((signal) => signal.toLowerCase());
  const codeMatches = ["econnrefused", "etimedout", "enotfound", "eai_again", "57p01", "08006", "08001"];
  const messageMatches = [
    "connection terminated unexpectedly",
    "connect econnrefused",
    "no pg_hba.conf entry",
    "could not connect",
    "database does not exist",
    "getaddrinfo enotfound",
  ];
  return signals.some((signal) => codeMatches.includes(signal) || messageMatches.some((msg) => signal.includes(msg)));
}

function isUniqueConstraintError(err: unknown) {
  const signals = collectErrorSignals(err).map((signal) => signal.toLowerCase());
  return signals.some((signal) => signal === "23505" || signal.includes("duplicate key"));
}

function sendDatabaseError(res: any, err: unknown) {
  const errorDetails = getErrorDetails(err);
  if (process.env.NODE_ENV === "development" || process.env.AUTH_DEBUG === "true") {
    return res.status(503).json({
      error: "تعذّر الاتصال بقاعدة البيانات. تحقق من DATABASE_URL وحالة Postgres.",
      details: errorDetails,
    });
  }
  return res.status(503).json({ error: "تعذّر الاتصال بقاعدة البيانات" });
}

// Intentionally public: the registration screen uploads the avatar BEFORE the
// account exists (no token yet). Abuse is bounded by the image-only filter, the
// 5MB size limit, and the global rate limiter. (Tighter per-IP upload caps +
// orphan cleanup are a later hardening step.)
router.post("/auth/profile-photo/upload", (req, res) => {
  uploadProfilePhotoFile.single("avatar")(req, res, (err) => {
    if (err) {
      req.log.error({ err: getErrorDetails(err) }, "Upload profile photo validation error");
      return res.status(400).json({ error: "تعذر رفع الصورة الشخصية" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No profile photo file provided" });
    }
    return res.json({ url: `/api/uploads/profile-photos/${req.file.filename}` });
  });
});

// Register
router.post("/auth/register", async (req, res) => {
  try {
    // Browser portal is staff-only, and staff accounts are created by the owner — never
    // self-registered — so public registration is disabled entirely from the web.
    if (isAdminWebClient(req)) {
      return res.status(403).json({ error: "التسجيل غير متاح من المتصفح." });
    }
    const {
      name,
      email,
      password,
      role = "student",
      phone,
      age,
      address,
      parentPhone,
      specialty,
      qualifications,
      howDidYouHear,
      supportNeeded,
      governorate,
      avatarUrl,
    } = req.body ?? {};

    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    const normalizedPhone = normalizePhone(phone);
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" });
    }
    const pwError = validatePasswordStrength(password);
    if (pwError) return res.status(400).json({ error: pwError });
    // Never trust a client-supplied privileged role on public registration.
    const requestedRole = String(role);
    const safeRole = PUBLIC_REGISTRATION_ROLES.has(requestedRole) ? requestedRole : "student";

    const [existingEmail, existingPhone] = await Promise.all([
      db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1),
      normalizedPhone
        ? db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.phone, normalizedPhone))
            .limit(1)
        : Promise.resolve([]),
    ]);
    const conflictFields = {
      email: existingEmail.length > 0,
      phone: existingPhone.length > 0,
    };
    if (conflictFields.email || conflictFields.phone) {
      return sendRegisterConflict(res);
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        name: String(name),
        email: normalizedEmail,
        password: hashPassword(String(password)),
        role: safeRole,
        status: "active",
        lastActiveAt: new Date(),
        phone: normalizedPhone || undefined,
        age: age === undefined ? undefined : Number.parseInt(String(age), 10),
        address: address === undefined ? undefined : String(address),
        parentPhone: parentPhone === undefined ? undefined : String(parentPhone),
        specialty: specialty === undefined ? undefined : String(specialty),
        qualifications: qualifications === undefined ? undefined : String(qualifications),
        howDidYouHear: howDidYouHear === undefined ? undefined : String(howDidYouHear),
        supportNeeded: supportNeeded === undefined ? undefined : String(supportNeeded),
        governorate: governorate === undefined ? undefined : String(governorate),
        avatarUrl: avatarUrl === undefined ? undefined : String(avatarUrl),
      })
      .returning();

    const { password: _pw, ...safeUser } = user;
    return res.status(201).json({ user: withPermissions(safeUser), token: issueToken(user.id, user.tokenVersion ?? 0) });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Register error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    if (isUniqueConstraintError(err)) {
      return sendRegisterConflict(res);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Login
router.post("/auth/login", async (req, res) => {
  const { email, identifier, password } = (req.body ?? {}) as {
    email?: string;
    identifier?: string;
    password?: string;
  };
  // Accept the login identifier from either `email` (legacy clients, admin dashboard)
  // or `identifier` (mobile email-or-phone field). Look up by email first so existing
  // email logins are unchanged, then fall back to phone.
  const rawIdentifier = typeof identifier === "string" && identifier
    ? identifier
    : typeof email === "string"
      ? email
      : "";
  const normalizedEmail = normalizeEmail(rawIdentifier);
  const plainPassword = typeof password === "string" ? password : "";

  try {
    if (!normalizedEmail || !plainPassword) {
      return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
    }

    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (!user) {
      const normalizedPhone = normalizePhone(rawIdentifier);
      if (normalizedPhone) {
        [user] = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
      }
    }
    if (!user) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (!verifyPassword(plainPassword, user.password)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });

    // Browser portal is staff-only: reject a non-privileged web login with the SAME
    // generic message as a wrong password, so a student can't tell that their account
    // exists or that a staff web login exists at all. Mobile (no header) is unaffected.
    if (isAdminWebClient(req) && !isStaffRole(user.role)) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }

    // Upgrade legacy plaintext passwords to a hash on first successful login.
    if (needsRehash(user.password)) {
      try {
        await db.update(usersTable).set({ password: hashPassword(plainPassword) }).where(eq(usersTable.id, user.id));
      } catch (rehashErr) {
        req.log.warn({ err: getErrorDetails(rehashErr), userId: user.id }, "Password rehash on login failed");
      }
    }

    // ── Two-factor gate ──────────────────────────────────────────────────────
    // Password was correct. When 2FA is on we DON'T issue a session token here;
    // instead we hand back a pre-auth step the client must complete:
    //   - no verified phone yet → "phone_setup" (collect + verify a number first)
    //   - otherwise            → "otp" (we SMS a code to the verified phone)
    // The real token is only minted by /auth/login/verify-otp or the phone-verify step.
    if (twoFactorRequiredFor(user)) {
      const hasVerifiedPhone = Boolean(user.phoneVerifiedAt) && Boolean(user.phone);
      if (!hasVerifiedPhone) {
        return res.json({
          twoFactor: { stage: "phone_setup", setupTicket: issueTicket(user.id, "phone_setup") },
        });
      }
      const challenge = await createChallenge({
        userId: user.id,
        purpose: "login",
        destination: user.phone as string,
        channel: "sms",
      });
      return res.json({
        twoFactor: {
          stage: "otp",
          challengeId: challenge.challengeId,
          maskedDestination: challenge.maskedDestination,
          channel: "sms",
          ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
        },
      });
    }

    const activeUser = await touchUserActivity(user.id);
    const { password: _pw, ...safeUser } = activeUser ?? user;
    return res.json({ user: withPermissions(safeUser), token: issueToken(user.id, user.tokenVersion ?? 0) });
  } catch (err) {
    const errorDetails = getErrorDetails(err);
    req.log.error({ err: errorDetails, email: normalizedEmail }, "Login error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    if (process.env.NODE_ENV === "development" || process.env.AUTH_DEBUG === "true") {
      return res.status(500).json({
        error: "خطأ في الخادم أثناء تسجيل الدخول",
        details: errorDetails,
      });
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Shared tail of a successful login once identity AND second factor are proven:
// re-check the account is usable + the web portal is staff-only, then mint the
// real session token. Used by both the OTP-verify and phone-verify steps.
async function finalizeLogin(req: Request, res: any, userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
  if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });
  if (isAdminWebClient(req) && !isStaffRole(user.role)) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }
  const activeUser = await touchUserActivity(user.id);
  const { password: _pw, ...safeUser } = activeUser ?? user;
  return res.json({ user: withPermissions(safeUser), token: issueToken(user.id, user.tokenVersion ?? 0) });
}

// Step 2 of a 2FA login: verify the SMS code and mint the session token.
router.post("/auth/login/verify-otp", async (req, res) => {
  try {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!challengeId || !code) return res.status(400).json({ error: "الكود مطلوب" });

    const result = await verifyChallenge(challengeId, code);
    if (!result.ok) return sendOtpFailure(res, result.reason);
    if (result.purpose !== "login") return res.status(400).json({ error: "طلب غير صالح" });

    return await finalizeLogin(req, res, result.userId);
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Verify login OTP error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Resend the current OTP (login OR phone-verify), throttled by the OTP engine.
router.post("/auth/2fa/resend", async (req, res) => {
  try {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    if (!challengeId) return res.status(400).json({ error: "طلب غير صالح" });
    const r = await resendChallenge(challengeId);
    if (!r.ok) {
      if (r.reason === "cooldown") {
        return res
          .status(429)
          .json({ error: "انتظر قليلًا قبل طلب كود جديد", code: "otp/cooldown", retryAfterSeconds: r.retryAfterSeconds });
      }
      if (r.reason === "too_many_resends") {
        return res.status(429).json({ error: "تجاوزت عدد مرات الإرسال. ابدأ من جديد.", code: "otp/too_many_resends" });
      }
      return res.status(400).json({ error: "هذا الطلب لم يعد صالحًا. ابدأ من جديد.", code: "otp/invalid" });
    }
    return res.json({
      challengeId: r.result.challengeId,
      maskedDestination: r.result.maskedDestination,
      ...(r.result.devCode ? { devCode: r.result.devCode } : {}),
    });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Resend OTP error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// First-time phone setup during a 2FA login: the client submits a phone number
// (authorised by the short-lived setupTicket from /auth/login) and we send a
// verification code to it. No session is granted yet.
router.post("/auth/2fa/phone", async (req, res) => {
  try {
    const setupTicket = typeof req.body?.setupTicket === "string" ? req.body.setupTicket : "";
    const userId = verifyTicket(setupTicket, "phone_setup");
    if (!userId) return res.status(401).json({ error: "انتهت الجلسة. سجّل الدخول من جديد.", code: "auth/ticket_expired" });

    const normalizedPhone = normalizePhone(req.body?.phone);
    if (!normalizedPhone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });

    // The number must not already belong to a DIFFERENT account.
    const [clash] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.phone, normalizedPhone), ne(usersTable.id, userId)))
      .limit(1);
    if (clash) return res.status(409).json({ error: "رقم الهاتف مستخدم بالفعل", code: "auth/phone_conflict" });

    // Store the number as UNVERIFIED until the code is confirmed.
    await db.update(usersTable).set({ phone: normalizedPhone, phoneVerifiedAt: null }).where(eq(usersTable.id, userId));

    const challenge = await createChallenge({ userId, purpose: "phone_verify", destination: normalizedPhone, channel: "sms" });
    return res.json({
      challengeId: challenge.challengeId,
      maskedDestination: challenge.maskedDestination,
      ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
    });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "2FA phone setup error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: "رقم الهاتف مستخدم بالفعل", code: "auth/phone_conflict" });
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Verify the first-time phone code: mark the phone verified and log the user in.
router.post("/auth/2fa/phone/verify", async (req, res) => {
  try {
    const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!challengeId || !code) return res.status(400).json({ error: "الكود مطلوب" });

    const result = await verifyChallenge(challengeId, code);
    if (!result.ok) return sendOtpFailure(res, result.reason);
    if (result.purpose !== "phone_verify") return res.status(400).json({ error: "طلب غير صالح" });

    await db.update(usersTable).set({ phoneVerifiedAt: new Date() }).where(eq(usersTable.id, result.userId));
    return await finalizeLogin(req, res, result.userId);
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "2FA phone verify error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Get current user
router.get("/auth/me", async (req, res) => {
  try {
    const payload = getSessionTokenPayload(req);
    if (!payload) return res.status(401).json({ error: "غير مصرح" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });
    // Reject tokens invalidated by a logout / password change (review B-02).
    if ((user.tokenVersion ?? 0) !== payload.tokenVersion) {
      return res.status(401).json({ error: "انتهت الجلسة. سجّل الدخول من جديد." });
    }
    // Reject non-staff sessions on the browser portal (staff-only); logs out any
    // student session that lingers in a browser without revealing the gate.
    if (isAdminWebClient(req) && !isStaffRole(user.role)) {
      return res.status(401).json({ error: "غير مصرح" });
    }
    const activeUser = await touchUserActivity(user.id);
    const { password: _pw, ...safeUser } = activeUser ?? user;
    // Rolling session: if this token has aged past the refresh window, hand back a
    // fresh one so an actively-used session never expires (and never re-prompts an
    // OTP). The client stores `token` when present; older clients ignore it.
    const refreshed = maybeRefreshToken(payload);
    return res.json({ ...withPermissions(safeUser), ...(refreshed ? { token: refreshed } : {}) });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Get profile error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

router.post("/auth/activity", async (req, res) => {
  try {
    const id = getSessionUserId(req);
    if (!id) return res.status(401).json({ error: "غير مصرح" });

    const [user] = await db
      .select({ id: usersTable.id, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (user.status === "suspended") return res.status(403).json({ error: "الحساب موقوف" });

    // The mobile app reports its current language here so admin broadcasts can be
    // delivered to each user in their own language.
    const rawLanguage = typeof req.body?.language === "string" ? req.body.language.trim().toLowerCase() : "";
    const normalizedLanguage = rawLanguage === "ar" || rawLanguage === "en" ? rawLanguage : null;
    if (normalizedLanguage) {
      await db.update(usersTable).set({ language: normalizedLanguage }).where(eq(usersTable.id, user.id));
    }

    const activeUser = await touchUserActivity(user.id);
    return res.json({ lastActiveAt: activeUser?.lastActiveAt ?? new Date() });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Touch activity error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Update profile
router.put("/auth/profile", async (req, res) => {
  try {
    const id = getSessionUserId(req);
    if (!id) return res.status(401).json({ error: "غير مصرح" });

    const { name, phone, age, address, bio, governorate, avatarUrl } = req.body ?? {};
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name);
    if (phone !== undefined) updateData.phone = String(phone);
    if (age !== undefined) updateData.age = Number.parseInt(String(age), 10);
    if (address !== undefined) updateData.address = String(address);
    if (bio !== undefined) updateData.bio = String(bio);
    if (governorate !== undefined) updateData.governorate = String(governorate);
    if (avatarUrl !== undefined) updateData.avatarUrl = String(avatarUrl);

    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const { password: _pw, ...safeUser } = user;
    return res.json(withPermissions(safeUser));
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Update profile error");
    if (isDatabaseUnavailableError(err)) {
      return sendDatabaseError(res, err);
    }
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Logout: invalidate EVERY session for the caller by bumping their token version
// (review B-02). The next /auth/me with an old token returns 401.
router.post("/auth/logout", async (req, res) => {
  try {
    const id = getSessionUserId(req);
    if (!id) return res.status(401).json({ error: "غير مصرح" });
    await db
      .update(usersTable)
      .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Logout error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// Self-service password change. Verifies the current password, stores a fresh
// hash, bumps tokenVersion to invalidate all other sessions, and returns a new
// token for the current device (review B-02).
router.post("/auth/change-password", async (req, res) => {
  try {
    const id = getSessionUserId(req);
    if (!id) return res.status(401).json({ error: "غير مصرح" });
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (!verifyPassword(currentPassword, user.password)) {
      return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    }

    const [updated] = await db
      .update(usersTable)
      .set({ password: hashPassword(newPassword), tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, id))
      .returning();
    return res.json({ ok: true, token: issueToken(updated.id, updated.tokenVersion ?? 0) });
  } catch (err) {
    req.log.error({ err: getErrorDetails(err) }, "Change password error");
    if (isDatabaseUnavailableError(err)) return sendDatabaseError(res, err);
    return res.status(500).json({ error: "خطأ في الخادم" });
  }
});

export default router;
