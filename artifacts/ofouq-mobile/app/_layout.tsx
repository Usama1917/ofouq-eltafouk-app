import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { I18nManager, Text, TextInput } from "react-native";
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

function applyRtlBaseStyle(Component: any) {
  if (!Component || Component.__rtlBasePatched) return;
  const baseRender = Component.render;
  if (typeof baseRender !== "function") return;
  Component.render = function rtlPatchedRender(props: any, ref: any) {
    if (!getAppIsRTL()) {
      return baseRender.call(this, props, ref);
    }
    const nextStyle = props && props.style != null ? [RTL_BASE_TEXT_STYLE, props.style] : RTL_BASE_TEXT_STYLE;
    return baseRender.call(this, { ...props, style: nextStyle }, ref);
  };
  Component.__rtlBasePatched = true;
}

applyRtlBaseStyle(Text);
applyRtlBaseStyle(TextInput);

function RootLayoutNav() {
  const { colors } = usePreferences();

  return (
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
