import Constants from "expo-constants";
import { Platform } from "react-native";

const DEFAULT_API_PORT = "8080";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
let warnedAboutLocalFallback = false;

export const API_BUILD_PROFILE = cleanEnvValue(process.env.EXPO_PUBLIC_BUILD_PROFILE) ?? "development";
export const SHOULD_SHOW_PREVIEW_API_DEBUG = API_BUILD_PROFILE === "preview";

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/$/, "");
}

function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractHost(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();

  try {
    const url = candidate.includes("://") ? new URL(candidate) : new URL(`http://${candidate}`);
    return url.hostname || null;
  } catch {
    const host = candidate.replace(/^[a-z]+:\/\//i, "").split("/")[0]?.split(":")[0];
    return host || null;
  }
}

function isLocalHost(host: string | null) {
  return Boolean(host && LOCAL_HOSTS.has(host));
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(host: string) {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isLocalOrPrivateHost(host: string | null) {
  if (!host) return false;
  const normalized = host.toLowerCase();
  return (
    isLocalHost(normalized) ||
    normalized.endsWith(".local") ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

function requireProductionHttps(url: string, source: string) {
  const normalized = normalizeBaseUrl(url);

  if (process.env.NODE_ENV !== "production") {
    return normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`[API] ${source} must be a valid HTTPS URL for production builds.`);
  }

  const allowsLocalHttp =
    process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === "1" &&
    process.env.EXPO_PUBLIC_BUILD_PROFILE !== "production" &&
    parsed.protocol === "http:" &&
    isLocalOrPrivateHost(parsed.hostname);

  if (allowsLocalHttp) {
    return normalized;
  }

  if (parsed.protocol !== "https:" || isLocalOrPrivateHost(parsed.hostname)) {
    throw new Error(
      `[API] ${source} must use a public HTTPS URL in production builds. Local or cleartext URLs are not allowed.`,
    );
  }

  return normalized;
}

function getExpoLanHost() {
  const constants = Constants as unknown as {
    linkingUri?: string;
    expoConfig?: { hostUri?: string };
    expoGoConfig?: { debuggerHost?: string; hostUri?: string };
    manifest?: { debuggerHost?: string; hostUri?: string };
    manifest2?: {
      extra?: {
        expoClient?: { hostUri?: string };
        expoGo?: { debuggerHost?: string; hostUri?: string };
      };
    };
  };

  const candidates = [
    constants.linkingUri,
    constants.expoConfig?.hostUri,
    constants.expoGoConfig?.debuggerHost,
    constants.expoGoConfig?.hostUri,
    constants.manifest2?.extra?.expoClient?.hostUri,
    constants.manifest2?.extra?.expoGo?.debuggerHost,
    constants.manifest2?.extra?.expoGo?.hostUri,
    constants.manifest?.debuggerHost,
    constants.manifest?.hostUri,
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host && !isLocalHost(host)) return host;
  }

  return null;
}

export function getBaseUrl(): string {
  const apiBaseUrl = cleanEnvValue(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (apiBaseUrl) {
    return requireProductionHttps(apiBaseUrl, "EXPO_PUBLIC_API_BASE_URL");
  }

  const domain = cleanEnvValue(process.env.EXPO_PUBLIC_DOMAIN);
  if (domain) {
    const host = extractHost(domain);
    if (!host) {
      throw new Error("[API] EXPO_PUBLIC_DOMAIN must be a valid public domain.");
    }
    return requireProductionHttps(`https://${host}/api-server`, "EXPO_PUBLIC_DOMAIN");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[API] Production builds require EXPO_PUBLIC_API_BASE_URL=https://... or EXPO_PUBLIC_DOMAIN=<public-domain>.",
    );
  }

  const apiHost = cleanEnvValue(process.env.EXPO_PUBLIC_API_HOST) ?? getExpoLanHost();
  const apiPort = cleanEnvValue(process.env.EXPO_PUBLIC_API_PORT) ?? DEFAULT_API_PORT;

  if (apiHost && !isLocalHost(apiHost)) {
    return `http://${apiHost}:${apiPort}`;
  }

  if (Platform.OS !== "web" && !warnedAboutLocalFallback) {
    warnedAboutLocalFallback = true;
    console.warn(
      "[API] Could not infer a LAN API host from Expo. Set EXPO_PUBLIC_API_BASE_URL=http://<computer-lan-ip>:8080 when testing on a real iPhone.",
    );
  }

  if (Platform.OS !== "web" && Boolean((Constants as unknown as { isDevice?: boolean }).isDevice)) {
    return `http://missing-api-host.invalid:${apiPort}`;
  }

  return `http://localhost:${apiPort}`;
}
