import { getBaseUrl } from "@/constants/api";

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
  const base = getBaseUrl();
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

export function isSupportedProfileImageType(mimeType?: string | null) {
  return !mimeType || SUPPORTED_PROFILE_IMAGE_TYPES.has(mimeType);
}
