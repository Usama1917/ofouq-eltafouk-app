import { getBaseUrl } from "@/constants/api";

export type ApiFetchOptions = RequestInit & {
  token?: string | null;
};

const SHOULD_LOG_NETWORK = process.env.NODE_ENV !== "production";

function apiUrl(path: string) {
  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeBodyPreview(raw: string) {
  if (!raw) return "";
  return raw.length > 800 ? `${raw.slice(0, 800)}…` : raw;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  const hasFormDataBody =
    typeof FormData !== "undefined" && requestOptions.body instanceof FormData;

  if (requestOptions.body && !hasFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = apiUrl(path);
  const method = requestOptions.method ?? "GET";

  let res: Response;
  try {
    if (SHOULD_LOG_NETWORK) {
      console.info("[API] request", {
        method,
        url,
        hasAuthToken: Boolean(token),
        hasBody: Boolean(requestOptions.body),
      });
    }

    res = await fetch(url, {
      ...requestOptions,
      headers,
    });
  } catch (err) {
    if (SHOULD_LOG_NETWORK) {
      console.warn("[API] network failure", {
        method,
        url,
        hasAuthToken: Boolean(token),
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw new Error("تعذر الوصول إلى الخادم، تأكد من اتصال الهاتف بنفس الشبكة.");
  }

  if (res.status === 204) {
    if (SHOULD_LOG_NETWORK) {
      console.info("[API] response", {
        method,
        url,
        status: res.status,
        ok: res.ok,
        hasAuthToken: Boolean(token),
      });
    }
    return undefined as T;
  }

  const raw = await res.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : null;

  if (SHOULD_LOG_NETWORK) {
    console.info("[API] response", {
      method,
      url,
      status: res.status,
      ok: res.ok,
      hasAuthToken: Boolean(token),
      body: res.ok ? undefined : safeBodyPreview(raw),
    });
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `API error ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}
