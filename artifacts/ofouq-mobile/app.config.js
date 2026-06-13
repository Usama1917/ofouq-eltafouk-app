const { withAndroidManifest } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Android push (FCM) needs google-services.json embedded in the build. Wire it in
// only when present, so builds don't fail before Firebase is set up. EAS can expose
// it as a file secret via GOOGLE_SERVICES_JSON; locally drop the file next to app.json.
// iOS push is unaffected (Expo/EAS manages APNs separately).
function resolveGoogleServicesFile() {
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const local = path.join(__dirname, "google-services.json");
  return fs.existsSync(local) ? "./google-services.json" : undefined;
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function extractHost(value) {
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

function isPrivateIpv4(host) {
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

function isPrivateIpv6(host) {
  const normalized = host.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isLocalOrPrivateHost(host) {
  if (!host) return false;
  const normalized = host.toLowerCase();
  return (
    LOCAL_HOSTS.has(normalized) ||
    normalized.endsWith(".local") ||
    isPrivateIpv4(normalized) ||
    isPrivateIpv6(normalized)
  );
}

function assertProductionApiSafety(buildProfile, apiBaseUrl, allowLocalHttp) {
  if (buildProfile !== "production") return;

  if (allowLocalHttp) {
    throw new Error("Production builds must not set EXPO_PUBLIC_ALLOW_LOCAL_HTTP=1.");
  }

  if (!apiBaseUrl) return;

  let parsed;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new Error("Production EXPO_PUBLIC_API_BASE_URL must be a valid HTTPS URL.");
  }

  if (parsed.protocol !== "https:" || isLocalOrPrivateHost(parsed.hostname)) {
    throw new Error("Production EXPO_PUBLIC_API_BASE_URL must be a public HTTPS URL.");
  }
}

function withExplicitCleartextTraffic(config, enabled) {
  return withAndroidManifest(config, (configWithManifest) => {
    const application = configWithManifest.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = enabled ? "true" : "false";
    }
    return configWithManifest;
  });
}

module.exports = ({ config }) => {
  const projectId =
    clean(process.env.EXPO_PUBLIC_EAS_PROJECT_ID) ??
    clean(process.env.EAS_PROJECT_ID) ??
    clean(config.extra?.eas?.projectId);
  const buildProfile =
    clean(process.env.EAS_BUILD_PROFILE) ??
    clean(process.env.EXPO_PUBLIC_BUILD_PROFILE) ??
    clean(config.extra?.buildProfile);
  const apiBaseUrl = clean(process.env.EXPO_PUBLIC_API_BASE_URL);
  const allowLocalHttp = clean(process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP) === "1";
  const isLocalHttpTesting = allowLocalHttp && buildProfile !== "production";

  assertProductionApiSafety(buildProfile, apiBaseUrl, allowLocalHttp);

  const googleServicesFile = resolveGoogleServicesFile();

  // iOS App Transport Security: keep HTTPS enforced in shipped builds. Only relax
  // it (allow cleartext / local networking) for local-HTTP dev/preview testing, so
  // the App Store build is not submitted with ATS disabled.
  const iosInfoPlist = {
    ...(config.ios?.infoPlist ?? {}),
    ...(isLocalHttpTesting
      ? {
          NSAppTransportSecurity: {
            NSAllowsArbitraryLoads: true,
            NSAllowsLocalNetworking: true,
          },
        }
      : {}),
  };

  const nextConfig = {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: iosInfoPlist,
    },
    android: {
      ...config.android,
      usesCleartextTraffic: isLocalHttpTesting,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      ...(buildProfile ? { buildProfile } : {}),
      ...(projectId
        ? {
            eas: {
              ...(config.extra?.eas ?? {}),
              projectId,
            },
          }
        : {}),
    },
  };

  return withExplicitCleartextTraffic(nextConfig, isLocalHttpTesting);
};
