import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { I18nManager, NativeModules, Platform } from "react-native";
import { Language, translations } from "@/localization/translations";

export type { Language };

const LANGUAGE_KEY = "ofouq_language";

interface LanguageContextValue {
  language: Language;
  isRTL: boolean;
  t: typeof translations.ar;
  setLanguage: (lang: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function detectDeviceLanguage(): Language {
  try {
    let locale = "ar";
    if (Platform.OS === "ios") {
      locale =
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
        "ar";
    } else if (Platform.OS === "android") {
      locale = NativeModules.I18nManager?.localeIdentifier || "ar";
    }
    const lang = locale.toLowerCase().startsWith("en") ? "en" : "ar";
    return lang;
  } catch {
    return "ar";
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored === "ar" || stored === "en") {
          applyRTL(stored);
          setLanguageState(stored);
        } else {
          const detected = detectDeviceLanguage();
          applyRTL(detected);
          setLanguageState(detected);
        }
      } catch {
        applyRTL("ar");
        setLanguageState("ar");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const applyRTL = (lang: Language) => {
    const shouldBeRTL = lang === "ar";
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  };

  const setLanguage = useCallback(async (lang: Language) => {
    applyRTL(lang);
    setLanguageState(lang);
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }, []);

  const t = translations[language];
  const isRTL = language === "ar";

  if (!ready) return null;

  return (
    <LanguageContext.Provider value={{ language, isRTL, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
