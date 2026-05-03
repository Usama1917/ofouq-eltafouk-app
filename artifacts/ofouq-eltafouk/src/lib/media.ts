const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
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
  if (/^https?:\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `${BASE}${url.startsWith("/") ? url : `/${url}`}`;
}

export function isSupportedProfileImageFile(file: File) {
  return SUPPORTED_PROFILE_IMAGE_TYPES.has(file.type);
}

export async function uploadProfilePhoto(file: File): Promise<string> {
  if (!isSupportedProfileImageFile(file)) {
    throw new Error("اختر صورة بصيغة JPG أو PNG أو WebP أو HEIC.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("اختر صورة بحجم أقل من 5MB.");
  }

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch(`${BASE}/api/auth/profile-photo/upload`, {
    method: "POST",
    body: fd,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? "تعذر رفع الصورة الشخصية.");
  }
  return String(payload.url);
}
