import crypto from "node:crypto";

// ── Auth primitives (no external deps) ──────────────────────────────────────
// Passwords are hashed with scrypt; session tokens are HMAC-signed and stateless
// (carry the user id + a token version + an expiry, verified by signature). The
// token version lets us invalidate all of a user's sessions on logout / password
// change without a server-side session store (review B-02).

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || "";
const DEV_FALLBACK_KEY = "dev-only-insecure-key-do-not-use-in-production";

// SECURITY (review B-06): the insecure dev fallback key is only permitted when
// NODE_ENV is EXPLICITLY "development" or "test". Any other value — unset, "prod",
// "staging", a typo — is treated as production and MUST provide a real secret.
// Previously the guard only fired on the exact string "production", so a mis-set
// env silently shipped a public, forgeable signing key.
const isExplicitDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (!isExplicitDev) {
  if (!AUTH_SECRET) {
    throw new Error(
      "AUTH_SECRET (or SESSION_SECRET) must be set unless NODE_ENV is explicitly 'development' or 'test'. Set a long random value in the server environment.",
    );
  }
  if (AUTH_SECRET === DEV_FALLBACK_KEY) {
    throw new Error("AUTH_SECRET must not equal the built-in dev fallback key.");
  }
  if (AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters long.");
  }
}
const SIGNING_KEY = AUTH_SECRET || DEV_FALLBACK_KEY;

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Rolling sessions: when a still-valid token is older than this, callers reissue a
// fresh 30-day token so an actively-used app effectively never forces a re-login
// (and therefore never re-triggers SMS OTP). A token left unused past its 30-day
// life still expires normally. See /auth/me.
const TOKEN_REFRESH_AFTER_SECONDS = 60 * 60 * 24 * 7; // refresh once a token is >7 days old
// Pre-auth tickets prove "password was correct for user X" between the password
// step and the OTP/phone step. They grant NO access on their own and are short-lived.
const TICKET_TTL_SECONDS = 60 * 10; // 10 minutes

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
 * (see `needsRehash`). The legacy branch is also constant-time (review B-23).
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
  // Compare fixed-length digests so the comparison is constant-time (review B-23).
  const a = crypto.createHash("sha256").update(String(plain)).digest();
  const b = crypto.createHash("sha256").update(String(stored)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** True when the stored password is still legacy plaintext and should be upgraded. */
export function needsRehash(stored: string | null | undefined): boolean {
  return !isHashed(stored);
}

// ── Tokens ──────────────────────────────────────────────────────────────────
function sign(data: string): string {
  return crypto.createHmac("sha256", SIGNING_KEY).update(data).digest("base64url");
}

export function issueToken(userId: number, tokenVersion = 0): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = Buffer.from(`${userId}.${tokenVersion}.${expiresAt}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

export type TokenPayload = { userId: number; tokenVersion: number; expiresAt: number };

/**
 * Verify a token's signature + expiry and return its payload. Accepts both the
 * legacy 2-part body (`userId.exp`, treated as tokenVersion 0) and the current
 * 3-part body (`userId.version.exp`) so already-issued tokens keep working across
 * the deploy that introduces versioning.
 */
export function verifyTokenPayload(token: string | null | undefined): TokenPayload | null {
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
  const segs = decoded.split(".");
  let uidStr: string;
  let verStr: string;
  let expStr: string;
  if (segs.length === 3) {
    [uidStr, verStr, expStr] = segs;
  } else if (segs.length === 2) {
    [uidStr, expStr] = segs;
    verStr = "0";
  } else {
    return null;
  }
  const userId = Number.parseInt(uidStr, 10);
  const tokenVersion = Number.parseInt(verStr, 10);
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;
  return { userId, tokenVersion: Number.isFinite(tokenVersion) ? tokenVersion : 0, expiresAt };
}

// ── Rolling refresh ───────────────────────────────────────────────────────────
/**
 * Given a currently-valid token payload, return a freshly-issued token when the
 * existing one has aged past TOKEN_REFRESH_AFTER_SECONDS, or null when it is still
 * young enough to keep using. Lets an active session slide forward indefinitely so
 * the user is rarely forced to log in again (and rarely re-prompted for an OTP).
 */
export function maybeRefreshToken(payload: TokenPayload): string | null {
  const issuedAt = payload.expiresAt - TOKEN_TTL_SECONDS;
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSeconds >= TOKEN_REFRESH_AFTER_SECONDS) {
    return issueToken(payload.userId, payload.tokenVersion);
  }
  return null;
}

// ── Pre-auth tickets (between password and OTP/phone steps) ────────────────────
export function issueTicket(userId: number, purpose: string, ttlSeconds = TICKET_TTL_SECONDS): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  // Leading "t" + purpose distinguishes a ticket from a 2/3-segment session token,
  // so a ticket can never be accepted as a session and vice versa.
  const body = Buffer.from(`t.${purpose}.${userId}.${expiresAt}`).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verify a pre-auth ticket's signature, expiry, and purpose. Returns the user id or null. */
export function verifyTicket(token: string | null | undefined, expectedPurpose: string): number | null {
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
  const segs = decoded.split(".");
  if (segs.length !== 4 || segs[0] !== "t") return null;
  const [, purpose, uidStr, expStr] = segs;
  if (purpose !== expectedPurpose) return null;
  const userId = Number.parseInt(uidStr, 10);
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;
  return userId;
}

export function verifyToken(token: string | null | undefined): number | null {
  return verifyTokenPayload(token)?.userId ?? null;
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

/** Like getSessionUserId but also returns the token version (for freshness checks). */
export function getSessionTokenPayload(req: any): TokenPayload | null {
  return verifyTokenPayload(getBearerToken(req));
}
