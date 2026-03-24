import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type UserRole = "student" | "teacher" | "parent" | "admin" | "moderator" | "owner";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  points: number;
  governorate?: string;
  specialty?: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  governorate?: string;
  specialty?: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_USER_KEY = "ofouq_user";
const AUTH_TOKEN_KEY = "ofouq_token";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem(AUTH_USER_KEY),
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
        ]);
        if (storedUser && storedToken) {
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "فشل تسجيل الدخول" }));
      throw new Error(err.error || "فشل تسجيل الدخول");
    }
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    await Promise.all([
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user)),
      AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token),
    ]);
  }, []);

  const register = useCallback(async (formData: RegisterData) => {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "فشل إنشاء الحساب" }));
      throw new Error(err.error || "فشل إنشاء الحساب");
    }
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    await Promise.all([
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user)),
      AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token),
    ]);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    await Promise.all([
      AsyncStorage.removeItem(AUTH_USER_KEY),
      AsyncStorage.removeItem(AUTH_TOKEN_KEY),
    ]);
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
