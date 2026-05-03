import React, { createContext, useContext, useMemo } from "react";
import { NativeModules, useColorScheme, View, type FlexStyle } from "react-native";

import { COLORS } from "@/constants/colors";
import {
  AppLanguage,
  AppStrings,
  TextDirection,
  TRANSLATIONS,
  isAppLanguage,
} from "@/lib/i18n";

export type { AppLanguage };

type PreferencesContextValue = {
  language: AppLanguage;
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

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const language = useMemo(getDeviceLanguage, []);

  const resolvedScheme: "light" | "dark" = systemScheme === "dark" ? "dark" : "light";
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
    }),
    [alignEnd, alignStart, direction, isRTL, language, resolvedScheme, rowDirection, reverseRowDirection, strings, textAlign],
  );

  return (
    <PreferencesContext.Provider value={value}>
      <View style={{ flex: 1, direction }}>{children}</View>
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
