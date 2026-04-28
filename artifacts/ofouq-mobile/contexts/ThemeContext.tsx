import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { COLORS } from "@/constants/colors";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_KEY = "ofouq_theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  colors: typeof COLORS.light;
  isDark: boolean;
  setPreference: (pref: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveTheme(pref: ThemePreference, systemScheme: ColorSchemeName): ResolvedTheme {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return systemScheme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme());

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
          setPreferenceState(stored);
        }
      } catch {
        // use default
      }
    })();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setPreference = useCallback(async (pref: ThemePreference) => {
    setPreferenceState(pref);
    await AsyncStorage.setItem(THEME_KEY, pref);
  }, []);

  const resolved = resolveTheme(preference, systemScheme);
  const isDark = resolved === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  return (
    <ThemeContext.Provider value={{ preference, resolved, colors, isDark, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}
