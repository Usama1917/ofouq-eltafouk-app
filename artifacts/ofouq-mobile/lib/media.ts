import { getBaseUrl } from "@/constants/api";
import { getCachedApiBaseUrlOverride } from "@/lib/apiBaseUrl";

const SUPPORTED_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function resolveMediaUrl(url?: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("file:")) return url;
  // Use the SAME base URL as API calls: honour the dev/preview server-address override
  // (set on the login screen) first, then the build-time base URL. Without this, images
  // fall back to the baked-in URL — e.g. the stale/hardcoded IP inside a preview APK —
  // and silently fail to load even though API calls (which DO use the override) succeed.
  // That mismatch is exactly why quiz/question images showed on iOS but not on Android.
  const base = getCachedApiBaseUrlOverride() ?? getBaseUrl();
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export function isSupportedProfileImageType(mimeType?: string | null) {
  return !mimeType || SUPPORTED_PROFILE_IMAGE_TYPES.has(mimeType);
}
