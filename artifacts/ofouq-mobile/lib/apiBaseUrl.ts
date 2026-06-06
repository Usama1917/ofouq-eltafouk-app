import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_BUILD_PROFILE, getBaseUrl } from "@/constants/api";

const API_BASE_URL_OVERRIDE_KEY = "ofouq_api_base_url_override";

let cachedOverride: string | null | undefined;

function isPreviewOrDevelopmentBuild() {
  return API_BUILD_PROFILE !== "production";
}

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("اكتب عنوان الخادم أولا.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("عنوان الخادم غير صحيح.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("عنوان الخادم يجب أن يبدأ بـ http أو https.");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

export function getCachedApiBaseUrlOverride() {
  return isPreviewOrDevelopmentBuild() ? cachedOverride ?? null : null;
}

export async function loadApiBaseUrlOverride() {
  if (!isPreviewOrDevelopmentBuild()) {
    cachedOverride = null;
    return null;
  }

  if (cachedOverride !== undefined) {
    return cachedOverride;
  }

  const storedValue = await AsyncStorage.getItem(API_BASE_URL_OVERRIDE_KEY);
  cachedOverride = storedValue ? normalizeApiBaseUrl(storedValue) : null;
  return cachedOverride;
}

export async function resolveApiBaseUrl() {
  const override = await loadApiBaseUrlOverride();
  return override ?? getBaseUrl();
}

export async function saveApiBaseUrlOverride(value: string) {
  if (!isPreviewOrDevelopmentBuild()) {
    throw new Error("تغيير عنوان الخادم متاح في نسخة المعاينة فقط.");
  }

  const normalized = normalizeApiBaseUrl(value);
  await AsyncStorage.setItem(API_BASE_URL_OVERRIDE_KEY, normalized);
  cachedOverride = normalized;
  return normalized;
}

export async function clearApiBaseUrlOverride() {
  await AsyncStorage.removeItem(API_BASE_URL_OVERRIDE_KEY);
  cachedOverride = null;
}
