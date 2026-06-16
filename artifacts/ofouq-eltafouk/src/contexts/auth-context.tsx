import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { installUnauthorizedInterceptor, setSessionExpiredHandler } from "@/lib/session";

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  status: string;
  avatarUrl?: string | null;
  phone?: string | null;
  age?: number | null;
  address?: string | null;
  bio?: string | null;
  governorate?: string | null;
  specialty?: string | null;
  joinedAt: string;
  lastActiveAt?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: Record<string, unknown>) => Promise<AuthUser>;
  logout: () => void;
  updateUser: (u: AuthUser) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// The browser portal is staff-only — students must use the mobile app. This mirrors
// the server's PRIVILEGED_ROLES; the API is the real gate, this is defense-in-depth.
const STAFF_ROLES = new Set(["admin", "owner", "moderator"]);
function isStaffRole(role: string | null | undefined): boolean {
  return typeof role === "string" && STAFF_ROLES.has(role);
}

function isLikelyApiProxyConnectionFailure(path: string, res: Response, rawBody: string) {
  return path.startsWith("/api/") && res.status === 500 && rawBody.trim().length === 0;
}

async function apiCall(path: string, opts: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        // Mark every request from the browser portal so the API can enforce the
        // staff-only rule (students must use the mobile app). Sent last so it can't
        // be accidentally overridden by a caller's headers.
        "X-Ofouq-Client": "web",
      },
    });
  } catch {
    throw new Error(`تعذر الوصول إلى الخادم (${path}). تأكد من تشغيل خدمات التطبيق واترك أمر التشغيل مفتوحًا في التيرمنال.`);
  }
  const raw = await res.text();
  const data =
    raw.trim().length === 0
      ? {}
      : (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        })();

  if (!res.ok) {
    if (isLikelyApiProxyConnectionFailure(path, res, raw)) {
      throw new Error(
        "الخادم غير متاح الآن. أنت غالبًا شغّلت الواجهة فقط بأمر pnpm --filter @workspace/ofouq-eltafouk run dev. شغّل الـ API على المنفذ 8080 أو استخدم الأمر pnpm start:local من جذر المشروع.",
      );
    }
    if (data && typeof data === "object" && "error" in data && typeof (data as any).error === "string") {
      throw new Error((data as any).error);
    }
    const fallback = raw.trim();
    if (fallback) {
      throw new Error(fallback);
    }
    throw new Error(`فشل الطلب (${res.status}) على ${path}`);
  }

  if (data === null) {
    throw new Error("استجابة غير صالحة من الخادم");
  }

  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthState = (nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem("ofouq_user", JSON.stringify(nextUser));
    localStorage.setItem("ofouq_token", nextToken);
  };

  const clearAuthState = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("ofouq_user");
    localStorage.removeItem("ofouq_token");
  };

  // Register token getter for generated API client
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("ofouq_token"));
    return () => setAuthTokenGetter(null);
  }, []);

  // Session-expiry safety net: any protected request returning 401 (e.g. an
  // expired/invalid token) signs the user out and sends them to login, instead
  // of leaving the app in a half-logged-in broken state.
  useEffect(() => {
    installUnauthorizedInterceptor();
    let redirecting = false;
    setSessionExpiredHandler(() => {
      clearAuthState();
      if (redirecting) return;
      const loginPath = `${BASE}/login`;
      const ownerLoginPath = `${BASE}/owner-login`;
      if (window.location.pathname !== loginPath && window.location.pathname !== ownerLoginPath) {
        redirecting = true;
        window.location.assign(loginPath);
      }
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Restore session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("ofouq_token");
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const raw = await apiCall("/api/auth/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (!active) return;
        // Accept either an enveloped { user } or a bare user object so a
        // response-shape drift doesn't silently sign everyone out.
        const profile = (raw?.user ?? raw) as AuthUser | null | undefined;
        if (profile && profile.id != null && isStaffRole(profile.role)) {
          applyAuthState(profile, storedToken);
        } else {
          // Non-staff (e.g. a lingering student token) gets no browser session.
          clearAuthState();
        }
      } catch {
        if (!active) return;
        clearAuthState();
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const nextUser = data.user as AuthUser;
    // Defense-in-depth: the API already blocks non-staff web logins, but guard the
    // client too so a non-staff account never establishes a browser session. Same
    // generic message as a wrong password — don't reveal the staff-only gate.
    if (!isStaffRole(nextUser?.role)) {
      throw new Error("بيانات الدخول غير صحيحة");
    }
    applyAuthState(nextUser, String(data.token));
    return nextUser;
  };

  const register = async (formData: Record<string, unknown>): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(formData),
    });
    applyAuthState(data.user as AuthUser, String(data.token));
    return data.user;
  };

  const logout = () => {
    clearAuthState();
  };

  const updateUser = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem("ofouq_user", JSON.stringify(u));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
