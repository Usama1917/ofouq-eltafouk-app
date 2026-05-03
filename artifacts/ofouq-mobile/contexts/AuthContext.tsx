import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

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
  address?: string;
  bio?: string;
  avatarUrl?: string;
  joinedAt?: string;
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
  avatarUrl?: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_USER_KEY = "ofouq_user";
const AUTH_TOKEN_KEY = "ofouq_token";

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
    const data = await apiFetch<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    setToken(data.token);
    await Promise.all([
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user)),
      AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token),
    ]);
  }, []);

  const register = useCallback(async (formData: RegisterData) => {
    const data = await apiFetch<{ user: User; token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(formData),
    });
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
