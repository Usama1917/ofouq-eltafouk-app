export function getBaseUrl(): string {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, "");
  }

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}/api-server`;
  }
  return "http://localhost:8080";
}
