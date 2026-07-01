import { toEnglishDigits } from "@/lib/format";

// Shared validation rules for the mobile auth screens. Kept framework-agnostic so
// both Login and Register reuse the exact same logic. The backend remains the source
// of truth for duplicate email/phone; these helpers only catch obvious client-side
// mistakes before a request is sent.

export const PASSWORD_MIN_LENGTH = 6;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

// Public sign-up only accepts real, well-known email providers — not throwaway/demo
// addresses. Mirrors the API allowlist in api-server/src/routes/auth.ts.
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "icloud.com",
  "mail.com",
  "email.com",
  "inbox.com",
  "eltafouk.com",
];

/** True when `value` is a valid email whose domain is on the sign-up allowlist. */
export function isAllowedEmailDomain(value: string): boolean {
  const match = value.trim().toLowerCase().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  if (!match) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(match[1]);
}

/**
 * Egyptian mobile numbers are 11 digits starting with "01" (e.g. 01012345678).
 * We also accept the same number with a +20 / 0020 / 20 country prefix. Arabic and
 * Persian digits are normalised to Latin before checking.
 */
export function isValidPhone(value: string): boolean {
  const digits = toEnglishDigits(value).replace(/[\s()+-]/g, "");
  const local = digits.replace(/^(?:0020|\+20|20)/, "");
  return /^01[0-2,5]\d{8}$/.test(local.startsWith("0") ? local : `0${local}`);
}

/** A login identifier is valid if it looks like an email OR a phone number. */
export function isValidIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.includes("@") ? isValidEmail(trimmed) : isValidPhone(trimmed);
}
