import AsyncStorage from "@react-native-async-storage/async-storage";

import { API_BUILD_PROFILE, getBaseUrl } from "@/constants/api";

const API_BASE_URL_OVERRIDE_KEY = "ofouq_api_base_url_override";

let cachedOverride: string | null | undefined;

function isPreviewOrDevelopmentBuild() {
  return API_BUILD_PROFILE !== "production";
}

/**
 * A usable API override must point at a real host: localhost, a bare IPv4, or a
 * dotted domain. This rejects garbage like `exp` (from a mangled `exp://…` Expo URL),
 * which previously slipped through and pointed the app at the Metro bundler.
 */
function isUsableOverrideHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (!host) return false;
  if (host === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(":")) return true; // IPv6
  return host.includes("."); // domain
}

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("اكتب عنوان الخادم أولا.");
  }

  // Drop any non-http(s) scheme (e.g. exp://, exps://) before adding http://, so an
  // Expo URL pasted by mistake doesn't become `http://exp//…`.
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  let candidate = trimmed;
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      candidate = trimmed.slice(schemeMatch[0].length);
    }
  }

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("عنوان الخادم غير صحيح.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("عنوان الخادم يجب أن يبدأ بـ http أو https.");
  }

  if (!isUsableOverrideHost(parsed.hostname)) {
    throw new Error("عنوان الخادم غير صحيح.");
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
  if (!storedValue) {
    cachedOverride = null;
    return null;
  }

  try {
    const normalized = normalizeApiBaseUrl(storedValue);
    // Repair a previously-mangled entry in place so it doesn't resurface.
    if (normalized !== storedValue) {
      await AsyncStorage.setItem(API_BASE_URL_OVERRIDE_KEY, normalized);
    }
    cachedOverride = normalized;
  } catch {
    // Stored override is invalid (e.g. the old `http://exp//…` bug) — drop it and
    // fall back to the build-time API base URL.
    await AsyncStorage.removeItem(API_BASE_URL_OVERRIDE_KEY);
    cachedOverride = null;
  }
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
