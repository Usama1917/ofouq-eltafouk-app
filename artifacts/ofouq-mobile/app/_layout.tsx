import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { I18nManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PreferencesProvider, usePreferences } from "@/contexts/PreferencesContext";
import { usePushNotifications } from "@/lib/pushNotifications";

I18nManager.allowRTL(true);
I18nManager.forceRTL(false);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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

function PushNotificationsBootstrap() {
  const { token, user } = useAuth();
  usePushNotifications(token, user?.id ?? null);
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <PreferencesProvider>
            <AppStatusBar />
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
