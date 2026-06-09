import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { router, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";

const onboardingDoneKey = (userId: number | string) => `ofouq_onboarding_done_${userId}`;

function NativeTabLayout() {
  const { strings, language } = usePreferences();

  return (
    <NativeTabs key={language}>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{strings.tabs.home}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="videos">
        <Icon sf={{ default: "video", selected: "video.fill" }} />
        <Label>{strings.tabs.videos}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>{strings.tabs.notifications}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile" hidden />
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>{strings.tabs.settings}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { resolvedScheme, colors, strings, direction } = usePreferences();
  const isDark = resolvedScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAndroid = Platform.OS === "android";
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          // Android: lift the bar above the system nav/gesture area and give it
          // enough height so the labels aren't clipped at the bottom.
          paddingBottom: isAndroid ? safeAreaInsets.bottom + 12 : safeAreaInsets.bottom,
          ...(isWeb
            ? { height: 84 }
            : isAndroid
              ? { height: 64 + safeAreaInsets.bottom, paddingTop: 8 }
              : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          ) : null,
        tabBarLabelStyle: {
          ...FONT.regular,
          fontSize: 11,
          writingDirection: direction,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: strings.tabs.home,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="academic"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="books"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: strings.tabs.videos,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="video" tintColor={color} size={24} />
            ) : (
              <Feather name="video" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: strings.tabs.notifications,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bell" tintColor={color} size={24} />
            ) : (
              <Feather name="bell" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: strings.tabs.settings,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={24} />
            ) : (
              <Ionicons name="settings-outline" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user, token } = useAuth();
  const { colors } = usePreferences();
  // Gate the main app behind first-time onboarding for students only. Backend is
  // the source of truth; a local flag avoids re-fetching/flicker after completion.
  const [gateReady, setGateReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Guests, admins, teachers, owners, etc. are never gated.
      if (!user || !token || user.role !== "student" || user.onboardingCompleted) {
        if (!cancelled) setGateReady(true);
        return;
      }
      try {
        const flag = await AsyncStorage.getItem(onboardingDoneKey(user.id));
        if (cancelled) return;
        if (flag === "1") {
          setGateReady(true);
          return;
        }
      } catch {
        // ignore cache errors
      }
      try {
        const data = await apiFetch<{ completed: boolean }>("/api/student/onboarding", { token });
        if (cancelled) return;
        if (data?.completed) {
          await AsyncStorage.setItem(onboardingDoneKey(user.id), "1").catch(() => undefined);
          setGateReady(true);
        } else {
          router.replace("/onboarding");
        }
      } catch {
        // Network/server issue — don't hard-block the app.
        if (!cancelled) setGateReady(true);
      }
    }

    setGateReady(false);
    void check();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user?.onboardingCompleted, token]);

  if (!gateReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
