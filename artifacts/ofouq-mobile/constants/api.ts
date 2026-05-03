import Constants from "expo-constants";
import { Platform } from "react-native";

const DEFAULT_API_PORT = "8080";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
let warnedAboutLocalFallback = false;

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
    return normalizeBaseUrl(apiBaseUrl);
  }

  const domain = cleanEnvValue(process.env.EXPO_PUBLIC_DOMAIN);
  if (domain) {
    return `https://${domain}/api-server`;
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
