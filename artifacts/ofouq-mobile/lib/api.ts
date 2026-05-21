import { SHOULD_SHOW_PREVIEW_API_DEBUG, getBaseUrl } from "@/constants/api";

export type ApiFetchOptions = RequestInit & {
  token?: string | null;
};

const SHOULD_LOG_NETWORK = process.env.NODE_ENV !== "production" || SHOULD_SHOW_PREVIEW_API_DEBUG;

export type ApiNetworkError = Error & {
  networkErrorName?: string;
  networkErrorMessage?: string;
  requestMethod?: string;
  requestUrl?: string;
};

export type ApiError = Error & {
  status?: number;
  code?: string;
  fields?: Record<string, unknown>;
};

export function getApiUrl(path: string) {
  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeBodyPreview(raw: string) {
  if (!raw) return "";
  return raw.length > 800 ? `${raw.slice(0, 800)}…` : raw;
}

function isAcademicVideoPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return /^\/api\/(?:videos(?:\/|$)|academic\/(?:years|subjects|units|lessons|watch-history|videos)(?:\/|$))/.test(
    normalized,
  );
}

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: value.length > 0 ? shapeOf(value[0]) : null,
    };
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        Array.isArray(entry) ? `array(${entry.length})` : entry === null ? "null" : typeof entry,
      ]),
    );
  }

  return value === null ? "null" : typeof value;
}

function responseItemSummary(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      itemCount: payload.length,
      firstItemShape: payload.length > 0 ? shapeOf(payload[0]) : null,
    };
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { subjects?: unknown }).subjects)) {
    const subjects = (payload as { subjects: unknown[] }).subjects;
    return {
      itemCount: subjects.length,
      firstItemShape: subjects.length > 0 ? shapeOf(subjects[0]) : null,
    };
  }

  return {
    itemCount: null,
    firstItemShape: shapeOf(payload),
  };
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

  const url = getApiUrl(path);
  const method = requestOptions.method ?? "GET";
  const shouldLogAcademicVideo = SHOULD_SHOW_PREVIEW_API_DEBUG && isAcademicVideoPath(path);

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

    if (shouldLogAcademicVideo) {
      console.info("[API][academic-video] request", {
        method,
        url,
        hasAuthHeader: headers.has("Authorization"),
      });
    }

    res = await fetch(url, {
      ...requestOptions,
      headers,
    });
  } catch (err) {
    const networkErrorName = err instanceof Error ? err.name : typeof err;
    const networkErrorMessage = err instanceof Error ? err.message : String(err);

    if (SHOULD_LOG_NETWORK) {
      console.warn("[API] network failure", {
        method,
        url,
        hasAuthToken: Boolean(token),
        name: networkErrorName,
        message: networkErrorMessage,
      });
    }
    const apiError = new Error("تعذر الوصول إلى الخادم، تأكد من اتصال الهاتف بنفس الشبكة.") as ApiNetworkError;
    apiError.networkErrorName = networkErrorName;
    apiError.networkErrorMessage = networkErrorMessage;
    apiError.requestMethod = method;
    apiError.requestUrl = url;
    throw apiError;
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

  if (shouldLogAcademicVideo) {
    console.info("[API][academic-video] response", {
      method,
      url,
      status: res.status,
      ok: res.ok,
      hasAuthHeader: headers.has("Authorization"),
      ...responseItemSummary(payload),
    });
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `API error ${res.status}`;
    const apiError = new Error(message) as ApiError;
    apiError.status = res.status;
    if (payload && typeof payload === "object") {
      const body = payload as { code?: unknown; fields?: unknown };
      if (typeof body.code === "string") apiError.code = body.code;
      if (body.fields && typeof body.fields === "object") {
        apiError.fields = body.fields as Record<string, unknown>;
      }
    }
    throw apiError;
  }

  return payload as T;
}
