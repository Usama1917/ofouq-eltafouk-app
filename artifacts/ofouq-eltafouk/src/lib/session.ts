// Central "session expired" handling for the admin/owner web.
//
// Login tokens are now signed and EXPIRING. When a stored token is rejected
// mid-session, every protected request returns 401. Rather than wiring a check
// into each of the ~40 raw fetch() call sites (and the generated query client),
// we install a single fetch interceptor: any 401 from a protected /api/ call
// triggers a clean sign-out + redirect to login.
//
// A 401 from /api/auth/login or /api/auth/register is a normal "wrong
// credentials" response, NOT an expired session — those are excluded so a failed
// login attempt doesn't bounce the user.

let sessionExpiredHandler: (() => void) | null = null;
let installed = false;

export function setSessionExpiredHandler(fn: (() => void) | null) {
  sessionExpiredHandler = fn;
}

function isAuthAttemptPath(url: string) {
  return url.includes("/api/auth/login") || url.includes("/api/auth/register");
}

export function installUnauthorizedInterceptor() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await original(input, init);
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (res.status === 401 && url.includes("/api/") && !isAuthAttemptPath(url)) {
        // A protected call was rejected → the session is no longer valid.
        sessionExpiredHandler?.();
      }
    } catch {
      /* never let interception break a real request */
    }
    return res;
  };
}
