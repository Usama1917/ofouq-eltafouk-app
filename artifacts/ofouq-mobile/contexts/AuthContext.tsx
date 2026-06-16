import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { apiFetch, setUnauthorizedHandler, type ApiError } from "@/lib/api";
import { LANGUAGE_STORAGE_KEY } from "@/contexts/PreferencesContext";
import { unregisterCurrentPushToken } from "@/lib/pushNotifications";
import { getStoredToken, setStoredToken, clearStoredToken } from "@/lib/tokenStore";

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
  lastActiveAt?: string | null;
  onboardingCompleted?: boolean;
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

// review F-08: the session token now lives in the OS secure store (Keychain /
// Keystore) via lib/tokenStore, not plaintext AsyncStorage. The cached user
// profile (non-sensitive, kept for a fast launch) stays in AsyncStorage.
const AUTH_USER_KEY = "ofouq_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // review F-17: guards logout() against re-entry. On token expiry every
  // protected request returns 401 and fires onUnauthorized → logout(); logout()
  // itself DELETEs the push-token with the now-expired token, which returns 401
  // → onUnauthorized → logout() again, a feedback loop. This flag makes logout()
  // run its side effects at most once until it fully settles.
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [storedUser, storedToken] = await Promise.all([
          AsyncStorage.getItem(AUTH_USER_KEY),
          getStoredToken(),
        ]);
        if (storedUser && storedToken) {
          // Show the cached session immediately for a fast launch…
          setUser(JSON.parse(storedUser));
          setToken(storedToken);
          // …then validate the token. Tokens are now signed + expiring, so a
          // previously-stored token may be invalid; clear it silently if the
          // server rejects it (a network failure keeps the cached session so the
          // app still works offline).
          try {
            const fresh = await apiFetch<User>("/api/auth/me", { token: storedToken });
            setUser(fresh);
            await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(fresh));
          } catch (err) {
            if ((err as ApiError)?.status === 401) {
              setUser(null);
              setToken(null);
              await Promise.all([
                AsyncStorage.removeItem(AUTH_USER_KEY),
                clearStoredToken(),
              ]);
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;

    let lastPingAt = 0;
    const pingActivity = async () => {
      const now = Date.now();
      if (now - lastPingAt < 60 * 1000) return;
      lastPingAt = now;
      // Report the current app language so admin broadcasts reach this user in their language.
      const language = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).catch(() => null);
      await apiFetch<{ lastActiveAt: string }>("/api/auth/activity", {
        method: "POST",
        token,
        body: JSON.stringify({ language: language === "en" ? "en" : "ar" }),
      }).catch(() => undefined);
    };

    void pingActivity();
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void pingActivity();
      }
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") {
        void pingActivity();
      }
    }, 5 * 60 * 1000);

    return () => {
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: User; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    setToken(data.token);
    await Promise.all([
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user)),
      setStoredToken(data.token),
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
      setStoredToken(data.token),
    ]);
  }, []);

  const logout = useCallback(async () => {
    // review F-17: ignore overlapping logout() calls (e.g. the 401 storm from
    // unregisterCurrentPushToken below) so the unregister DELETE — and its own
    // 401 → onUnauthorized → logout() — fires only once per expiry.
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    const currentToken = token;
    setUser(null);
    setToken(null);
    try {
      await Promise.all([
        unregisterCurrentPushToken(currentToken).catch(() => undefined),
        AsyncStorage.removeItem(AUTH_USER_KEY),
        clearStoredToken(),
      ]);
    } finally {
      isLoggingOutRef.current = false;
    }
  }, [token]);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
  }, []);

  // When any protected request returns 401 (expired/invalid token), sign out and
  // route to login — instead of leaving the user appearing logged-in while every
  // action silently fails.
  const redirectingRef = useRef(false);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      try {
        router.replace("/login");
      } catch {
        /* router may not be mounted yet */
      }
      setTimeout(() => {
        redirectingRef.current = false;
      }, 1500);
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

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
