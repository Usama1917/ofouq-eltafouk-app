import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager, NativeModules, useColorScheme, View, type FlexStyle } from "react-native";

import { COLORS } from "@/constants/colors";
import {
  AppLanguage,
  AppStrings,
  TextDirection,
  TRANSLATIONS,
  isAppLanguage,
} from "@/lib/i18n";

export type { AppLanguage };
export type AppThemePreference = "system" | "light" | "dark";

export const LANGUAGE_STORAGE_KEY = "ofouq_language";
export const THEME_STORAGE_KEY = "ofouq_theme";

type PreferencesContextValue = {
  language: AppLanguage;
  themePreference: AppThemePreference;
  resolvedScheme: "light" | "dark";
  colors: typeof COLORS.light;
  strings: AppStrings;
  direction: TextDirection;
  isRTL: boolean;
  textAlign: "right" | "left";
  rowDirection: FlexStyle["flexDirection"];
  reverseRowDirection: FlexStyle["flexDirection"];
  alignStart: "flex-start" | "flex-end";
  alignEnd: "flex-start" | "flex-end";
  setLanguage: (language: AppLanguage) => Promise<void>;
  setThemePreference: (themePreference: AppThemePreference) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

function getDeviceLocale() {
  const settings = NativeModules.SettingsManager?.settings;
  const appleLocale = settings?.AppleLocale;
  const appleLanguage = Array.isArray(settings?.AppleLanguages) ? settings.AppleLanguages[0] : undefined;
  const androidLocale = NativeModules.I18nManager?.localeIdentifier;
  return String(appleLocale ?? appleLanguage ?? androidLocale ?? "");
}

function getDeviceLanguage(): AppLanguage {
  const locale = getDeviceLocale().replace("_", "-").toLowerCase();
  const languageCode = locale.split("-")[0] ?? null;
  return isAppLanguage(languageCode) ? languageCode : "ar";
}

function isAppThemePreference(value: string | null): value is AppThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function applyNativeDirection(language: AppLanguage) {
  const shouldBeRTL = language === "ar";

  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(false);
  I18nManager.forceRTL(shouldBeRTL);
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [language, setLanguageState] = useState<AppLanguage>(() => getDeviceLanguage());
  const [themePreference, setThemePreferenceState] = useState<AppThemePreference>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPreferences() {
      try {
        const [storedLanguage, storedThemePreference] = await Promise.all([
          AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
          AsyncStorage.getItem(THEME_STORAGE_KEY),
        ]);
        const nextLanguage = isAppLanguage(storedLanguage) ? storedLanguage : getDeviceLanguage();
        const nextThemePreference = isAppThemePreference(storedThemePreference) ? storedThemePreference : "system";

        // Persist the resolved language so other parts of the app (e.g. the activity ping
        // that reports language to the server) always read the real current language.
        if (storedLanguage !== nextLanguage) {
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage).catch(() => undefined);
        }

        applyNativeDirection(nextLanguage);

        if (isMounted) {
          setLanguageState(nextLanguage);
          setThemePreferenceState(nextThemePreference);
        }
      } catch {
        const fallbackLanguage = getDeviceLanguage();
        applyNativeDirection(fallbackLanguage);

        if (isMounted) {
          setLanguageState(fallbackLanguage);
          setThemePreferenceState("system");
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = useCallback(
    async (nextLanguage: AppLanguage) => {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    },
    [],
  );

  const setThemePreference = useCallback(
    async (nextThemePreference: AppThemePreference) => {
      if (nextThemePreference === themePreference) return;

      const previousThemePreference = themePreference;
      setThemePreferenceState(nextThemePreference);

      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemePreference);
      } catch (error) {
        setThemePreferenceState(previousThemePreference);
        throw error;
      }
    },
    [themePreference],
  );

  const resolvedScheme: "light" | "dark" = themePreference === "system"
    ? systemScheme === "dark"
      ? "dark"
      : "light"
    : themePreference;
  const strings = TRANSLATIONS[language];
  const direction = strings.direction;
  const isRTL = direction === "rtl";
  const textAlign: "right" | "left" = isRTL ? "right" : "left";
  const rowDirection: FlexStyle["flexDirection"] = "row";
  const reverseRowDirection: FlexStyle["flexDirection"] = "row-reverse";
  const alignStart: "flex-start" | "flex-end" = "flex-start";
  const alignEnd: "flex-start" | "flex-end" = "flex-end";

  const value = useMemo(
    () => ({
      language,
      themePreference,
      resolvedScheme,
      colors: resolvedScheme === "dark" ? COLORS.dark : COLORS.light,
      strings,
      direction,
      isRTL,
      textAlign,
      rowDirection,
      reverseRowDirection,
      alignStart,
      alignEnd,
      setLanguage,
      setThemePreference,
    }),
    [
      alignEnd,
      alignStart,
      direction,
      isRTL,
      language,
      resolvedScheme,
      rowDirection,
      reverseRowDirection,
      setLanguage,
      setThemePreference,
      strings,
      textAlign,
      themePreference,
    ],
  );

  if (!isReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: resolvedScheme === "dark" ? COLORS.dark.background : COLORS.light.background,
        }}
      />
    );
  }

  return (
    <PreferencesContext.Provider value={value}>
      <View style={{ flex: 1, direction, backgroundColor: value.colors.background }}>{children}</View>
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
