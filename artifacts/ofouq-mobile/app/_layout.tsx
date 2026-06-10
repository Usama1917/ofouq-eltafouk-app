import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { I18nManager, Platform, StyleSheet, Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getAppIsRTL } from "@/lib/appDirection";
import { FONT } from "@/constants/typography";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PreferencesProvider, usePreferences } from "@/contexts/PreferencesContext";
import { usePushNotifications } from "@/lib/pushNotifications";

// I18nManager RTL helpers are native-only; guard so the web bundle (react-native-web) does not crash.
if (typeof I18nManager.allowRTL === "function") {
  I18nManager.allowRTL(true);
}
if (typeof I18nManager.swapLeftAndRightInRTL === "function") {
  I18nManager.swapLeftAndRightInRTL(false);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const defaultFontStyle = { ...FONT.regular };

type FontComponent = {
  defaultProps?: {
    style?: unknown;
    [key: string]: unknown;
  };
};

function applyDefaultFont(Component: FontComponent) {
  const defaultProps = Component.defaultProps ?? {};
  const existingStyle = defaultProps.style;

  Component.defaultProps = {
    ...defaultProps,
    style: existingStyle ? [defaultFontStyle, existingStyle] : defaultFontStyle,
  };
}

applyDefaultFont(Text as unknown as FontComponent);
applyDefaultFont(TextInput as unknown as FontComponent);

// ── Foundational RTL ──────────────────────────────────────────────────────────
// Patch the global <Text>/<TextInput> render so EVERY text in the app defaults to
// right alignment + RTL writing direction whenever the app language is Arabic,
// unless the component sets its own textAlign (component styles still win). This
// fixes the long-standing recurring issue of Arabic content rendering left-aligned.
// English (LTR) is untouched. Reads getAppIsRTL() at render time so it follows the
// resolved app language even before a native reload applies forceRTL.
const RTL_BASE_TEXT_STYLE = { textAlign: "right", writingDirection: "rtl" } as const;

// ── English-on-Android font scaling ───────────────────────────────────────────
// On Android, English (Latin) text is rendered with the bundled Arabic font,
// whose Latin glyphs come out oversized — most noticeably on headers/titles.
// Scale font metrics down a touch, larger sizes more than small body text, so
// the whole UI reads balanced in English. Arabic and iOS are left untouched.
const IS_ANDROID = Platform.OS === "android";
function englishAndroidFontScale(size: number) {
  if (size >= 26) return 0.84;
  if (size >= 20) return 0.88;
  if (size >= 16) return 0.92;
  return 0.95;
}

function applyRtlBaseStyle(Component: any) {
  if (!Component || Component.__rtlBasePatched) return;
  const baseRender = Component.render;
  if (typeof baseRender !== "function") return;
  Component.render = function rtlPatchedRender(props: any, ref: any) {
    const style = props && props.style;
    if (getAppIsRTL()) {
      const nextStyle = style != null ? [RTL_BASE_TEXT_STYLE, style] : RTL_BASE_TEXT_STYLE;
      return baseRender.call(this, { ...props, style: nextStyle }, ref);
    }
    if (IS_ANDROID) {
      const flat = StyleSheet.flatten(style) as { fontSize?: number; lineHeight?: number } | undefined;
      if (flat && typeof flat.fontSize === "number") {
        const factor = englishAndroidFontScale(flat.fontSize);
        const scaled: { fontSize: number; lineHeight?: number } = {
          fontSize: Math.round(flat.fontSize * factor * 2) / 2,
        };
        if (typeof flat.lineHeight === "number") {
          scaled.lineHeight = Math.round(flat.lineHeight * factor);
        }
        const nextStyle = style != null ? [style, scaled] : scaled;
        return baseRender.call(this, { ...props, style: nextStyle }, ref);
      }
    }
    return baseRender.call(this, props, ref);
  };
  Component.__rtlBasePatched = true;
}

applyRtlBaseStyle(Text);
applyRtlBaseStyle(TextInput);

function RootLayoutNav() {
  const { colors, resolvedScheme } = usePreferences();

  // Override the navigation theme so the native stack host (the layer revealed
  // beneath screens during a slide transition) is painted with our theme color.
  // Without this, expo-router falls back to the light DefaultTheme and a white
  // backdrop flashes behind the sliding screen in dark mode (Android).
  const base = resolvedScheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          // Paint every screen's scene with the theme background so there is no
          // white flash under screens during navigation transitions (Android).
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="register" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}

function AppStatusBar() {
  const { resolvedScheme } = usePreferences();

  return (
    <StatusBar
      backgroundColor="transparent"
      style={resolvedScheme === "dark" ? "light" : "dark"}
      translucent
    />
  );
}

// Keep the native window/root background in sync with the theme so navigation
// transitions never reveal a white backdrop (notably Android dark mode).
function SystemBackground() {
  const { colors } = usePreferences();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  return null;
}

function PushNotificationsBootstrap() {
  const { token, user } = useAuth();
  usePushNotifications(token, user?.id ?? null);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansArabic_400Regular: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-Regular.ttf"),
    NotoSansArabic_500Medium: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-Medium.ttf"),
    NotoSansArabic_600SemiBold: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-SemiBold.ttf"),
    NotoSansArabic_700Bold: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-Bold.ttf"),
    NotoSansArabic_800ExtraBold: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-ExtraBold.ttf"),
    NotoSansArabic_900Black: require("../assets/fonts/Noto_Sans_Arabic/NotoSansArabic-Black.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <PreferencesProvider>
            <AppStatusBar />
            <SystemBackground />
            <AuthProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <PushNotificationsBootstrap />
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </AuthProvider>
          </PreferencesProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
