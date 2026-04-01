import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
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
  login: (email: string, password: string, requiredRole?: string) => Promise<AuthUser>;
  register: (data: Record<string, unknown>) => Promise<AuthUser>;
  logout: () => void;
  updateUser: (u: AuthUser) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiCall(path: string, opts: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
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
    throw new Error(raw.trim() || "حدث خطأ");
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

  // Register token getter for generated API client
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("ofouq_token"));
    return () => setAuthTokenGetter(null);
  }, []);

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("ofouq_user");
    const storedToken = localStorage.getItem("ofouq_token");
    if (stored && storedToken) {
      try {
        setUser(JSON.parse(stored));
        setToken(storedToken);
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string, requiredRole?: string): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, requiredRole }),
    });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("ofouq_user", JSON.stringify(data.user));
    localStorage.setItem("ofouq_token", data.token);
    return data.user;
  };

  const register = async (formData: Record<string, unknown>): Promise<AuthUser> => {
    const data = await apiCall("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(formData),
    });
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("ofouq_user", JSON.stringify(data.user));
    localStorage.setItem("ofouq_token", data.token);
    return data.user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("ofouq_user");
    localStorage.removeItem("ofouq_token");
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
