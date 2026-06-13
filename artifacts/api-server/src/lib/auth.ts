import crypto from "node:crypto";

// ── Auth primitives (no external deps) ──────────────────────────────────────
// Passwords are hashed with scrypt; session tokens are HMAC-signed and stateless
// (carry the user id + an expiry, verified by signature). This replaces the old
// forgeable `session_<id>` scheme and the plaintext password storage.

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "";

// In production we refuse to run with an unsigned/guessable key. Locally we fall
// back to a fixed dev key so `pnpm dev` keeps working without extra setup.
if (!AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "AUTH_SECRET must be set in production (used to sign login tokens). Set a long random value in the server environment.",
  );
}
const SIGNING_KEY = AUTH_SECRET || "dev-only-insecure-key-do-not-use-in-production";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// ── Passwords ───────────────────────────────────────────────────────────────
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function isHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

/**
 * Verify a password against the stored value. Hashed values are compared with a
 * constant-time check. Legacy plaintext values (pre-migration) are also accepted
 * so existing accounts can still log in — callers should rehash on success
 * (see `needsRehash`).
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (isHashed(stored)) {
    const [, saltHex, hashHex] = stored.split("$");
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    let actual: Buffer;
    try {
      actual = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), expected.length);
    } catch {
      return false;
    }
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  // Legacy plaintext fallback (one-time, until the row is rehashed on next login).
  return String(plain) === String(stored);
}

/** True when the stored password is still legacy plaintext and should be upgraded. */
export function needsRehash(stored: string | null | undefined): boolean {
  return !isHashed(stored);
}

// ── Tokens ──────────────────────────────────────────────────────────────────
function sign(data: string): string {
  return crypto.createHmac("sha256", SIGNING_KEY).update(data).digest("base64url");
}

export function issueToken(userId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = Buffer.from(`${userId}.${expiresAt}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, providedSig] = parts;
  const expectedSig = sign(body);
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
  ) {
    return null;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [uidStr, expStr] = decoded.split(".");
  const userId = Number.parseInt(uidStr, 10);
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;
  return userId;
}

// ── Request helpers ───────────────────────────────────────────────────────────
export function getBearerToken(req: any): string | null {
  const header = req?.headers?.authorization;
  if (typeof header !== "string" || header.length === 0) return null;
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
}

/** Extract and verify the caller's user id from the Authorization header, or null. */
export function getSessionUserId(req: any): number | null {
  return verifyToken(getBearerToken(req));
}
