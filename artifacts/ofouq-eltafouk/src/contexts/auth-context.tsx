import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

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

async function apiCall(path: string, opts: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
  } catch {
    throw new Error(`تعذر الوصول إلى الخادم (${path}). تأكد من تشغيل خدمات التطبيق.`);
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
        const profile = await apiCall("/api/auth/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (!active) return;
        applyAuthState(profile as AuthUser, storedToken);
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
    applyAuthState(data.user as AuthUser, String(data.token));
    return data.user;
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
