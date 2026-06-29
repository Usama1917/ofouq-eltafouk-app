import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { installUnauthorizedInterceptor, setSessionExpiredHandler } from "@/lib/session";

export interface AuthUser {
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

// Two-factor login result (see mobile AuthContext for the same shape). When 2FA is
// enabled server-side, a correct password yields an "otp"/"phone_setup" step instead
// of an immediate session.
export type LoginResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "otp"; challengeId: string; maskedDestination: string; channel: string; devCode?: string }
  | { status: "phone_setup"; setupTicket: string };

export type OtpChallenge = { challengeId: string; maskedDestination: string; devCode?: string };

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeOtp: (challengeId: string, code: string) => Promise<AuthUser>;
  startPhoneSetup: (setupTicket: string, phone: string) => Promise<OtpChallenge>;
  completePhoneVerify: (challengeId: string, code: string) => Promise<AuthUser>;
  resendOtp: (challengeId: string) => Promise<OtpChallenge>;
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
          // /auth/me may return a freshly-rolled token when the current one aged past
          // the refresh window — keep the active session sliding forward.
          const rolledToken = typeof raw?.token === "string" && raw.token ? raw.token : storedToken;
          applyAuthState(profile, rolledToken);
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

  // Finalize a { user, token } payload into a staff session, enforcing the staff-only
  // gate (defense-in-depth; the API is the real gate). Shared by login + OTP/phone steps.
  const finalizeStaffSession = (data: any): AuthUser => {
    const nextUser = data.user as AuthUser;
    if (!isStaffRole(nextUser?.role)) {
      // Same generic message as a wrong password — don't reveal the staff-only gate.
      throw new Error("بيانات الدخول غير صحيحة");
    }
    applyAuthState(nextUser, String(data.token));
    return nextUser;
  };

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const data = await apiCall("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data?.twoFactor) {
      const tf = data.twoFactor;
      if (tf.stage === "phone_setup") {
        return { status: "phone_setup", setupTicket: tf.setupTicket };
      }
      return {
        status: "otp",
        challengeId: tf.challengeId,
        maskedDestination: tf.maskedDestination,
        channel: tf.channel ?? "sms",
        devCode: tf.devCode,
      };
    }
    return { status: "authenticated", user: finalizeStaffSession(data) };
  };

  const completeOtp = async (challengeId: string, code: string): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/login/verify-otp", {
      method: "POST",
      body: JSON.stringify({ challengeId, code }),
    });
    return finalizeStaffSession(data);
  };

  const startPhoneSetup = async (setupTicket: string, phone: string): Promise<OtpChallenge> => {
    return apiCall("/api/auth/2fa/phone", {
      method: "POST",
      body: JSON.stringify({ setupTicket, phone }),
    });
  };

  const completePhoneVerify = async (challengeId: string, code: string): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/2fa/phone/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId, code }),
    });
    return finalizeStaffSession(data);
  };

  const resendOtp = async (challengeId: string): Promise<OtpChallenge> => {
    return apiCall("/api/auth/2fa/resend", {
      method: "POST",
      body: JSON.stringify({ challengeId }),
    });
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
    <AuthContext.Provider value={{ user, token, login, completeOtp, startPhoneSetup, completePhoneVerify, resendOtp, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
