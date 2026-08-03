import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, { useEffect } from "react";
import { AppState, type AppStateStatus, I18nManager, Text, TextInput } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import InAppNotificationBanner from "@/components/InAppNotificationBanner";
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

// review F-12: give react-query sane defaults (matching the web client in
// artifacts/ofouq-eltafouk/src/App.tsx) — without these every query retries 3x
// on failure, causing retry storms (e.g. a flaky network hammering the API).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});
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

// ── Foundational RTL (root fix) ───────────────────────────────────────────────
// EVERY Arabic <Text>/<TextInput> must default to right alignment + RTL writing
// direction. This used to be done by monkey-patching `Text.render`, but on React
// Native 0.81 / React 19 `Text` (and `TextInput`) is a plain FUNCTION component with
// no `.render`, so that patch silently did nothing — Arabic text rendered LEFT unless
// a component ALSO set `writingDirection` itself. That's the recurring "Arabic labels
// stuck on the left" bug (e.g. checkout field headings): the ones that looked right
// only worked because they happened to set writingDirection; the rest fell back to
// left.
//
// Root fix: intercept element creation and prepend an OVERRIDABLE RTL base style to
// every <Text>/<TextInput> while the language is Arabic. The base is FIRST in the style
// array, so any explicit textAlign/writingDirection a component sets still wins — we
// only supply the default that was missing. We patch the automatic JSX runtime
// (jsx/jsxs, used in production), the dev runtime (jsxDEV), and React.createElement
// (classic), covering every render path. getAppIsRTL() is read at call time, so it
// follows the resolved language even before a native reload. English (LTR) is untouched.
const RTL_BASE_TEXT_STYLE = { textAlign: "right", writingDirection: "rtl" } as const;

function injectRtlBaseProps(type: unknown, props: any) {
  if (!props || (type !== Text && type !== TextInput) || !getAppIsRTL()) return props;
  const style = props.style;
  return { ...props, style: style != null ? [RTL_BASE_TEXT_STYLE, style] : RTL_BASE_TEXT_STYLE };
}

function patchJsxFactory(mod: any, key: string) {
  const orig = mod?.[key];
  if (typeof orig !== "function" || orig.__ofqRtlPatched) return;
  const patched = function patchedJsx(this: unknown, type: unknown, props: any, ...rest: unknown[]) {
    return orig.call(this, type, injectRtlBaseProps(type, props), ...rest);
  };
  patched.__ofqRtlPatched = true;
  try {
    mod[key] = patched;
  } catch {
    // Some runtimes freeze module exports; the other patched entry points still apply.
  }
}

patchJsxFactory(require("react/jsx-runtime"), "jsx");
patchJsxFactory(require("react/jsx-runtime"), "jsxs");
try {
  patchJsxFactory(require("react/jsx-dev-runtime"), "jsxDEV");
} catch {
  // jsx-dev-runtime is development-only; ignore when it is absent.
}
patchJsxFactory(React, "createElement");

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
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="setup-phone" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
        <Stack.Screen name="quiz" options={{ headerShown: false }} />
        {/* The book sample reader lives at the ROOT, not inside (tabs): a page has
            to fill the whole screen, and the bottom tab bar renders above every
            tab screen so it would otherwise sit on top of the page scrubber.
            Slides in horizontally like a normal push (and reverses on back). */}
        <Stack.Screen name="book-preview" options={{ headerShown: false, animation: "slide_from_right" }} />
      </Stack>
      {/* Sits OUTSIDE the Stack so a foreground push banner floats above whatever
          screen is open, instead of being clipped by the current one. */}
      <InAppNotificationBanner />
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
    // Android renders Arabic in Teshrin (the owner's brand typeface — same one used on
    // the printed books; switched from IBM Plex Sans Arabic 2026-08-03 on the owner's
    // request). Each weight is its own family so real bold works reliably. iOS keeps
    // its system font and ignores these. The names bake in each file's TRUE OS/2
    // weight — Teshrin's style names run heavy ("Bold" is 600, "Heavy" is 800) — so
    // typography.ts maps slots by number, not by the misleading style name.
    Teshrin_350Light: require("../assets/fonts/Teshrin/Teshrin-Light.otf"),
    Teshrin_500Medium: require("../assets/fonts/Teshrin/Teshrin-Medium.otf"),
    Teshrin_600Bold: require("../assets/fonts/Teshrin/Teshrin-Bold.otf"),
    Teshrin_800Heavy: require("../assets/fonts/Teshrin/Teshrin-Heavy.otf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);

  // review F-13: wire react-query's focusManager to AppState so its
  // refetchOnWindowFocus behaviour actually fires on React Native (RN has no
  // window-focus event, so without this the manager always thinks the app is
  // focused). NOTE: onlineManager is intentionally NOT wired — that needs
  // @react-native-community/netinfo, which is not a dependency; adding the
  // import would break the bundle. Reconnect-refetch is therefore left as the
  // react-query default (assume always online).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
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
