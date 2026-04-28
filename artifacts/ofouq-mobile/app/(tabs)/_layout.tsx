import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { isFeatureVisible } from "@/config/soft-launch";

function NativeTabLayout() {
  const { t } = useLanguage();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t.tabs.home}</Label>
      </NativeTabs.Trigger>
      {isFeatureVisible("books") && (
        <NativeTabs.Trigger name="books">
          <Icon sf={{ default: "book", selected: "book.fill" }} />
          <Label>{t.tabs.books}</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="videos">
        <Icon sf={{ default: "play.circle", selected: "play.circle.fill" }} />
        <Label>{t.tabs.videos}</Label>
      </NativeTabs.Trigger>
      {isFeatureVisible("aiAssistant") && (
        <NativeTabs.Trigger name="chat">
          <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
          <Label>{t.tabs.assistant}</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>{t.tabs.account}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { colors, isDark } = useAppTheme();
  const { t } = useLanguage();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
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
          paddingBottom: safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
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
          fontFamily: "Cairo_400Regular",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
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
        options={
          isFeatureVisible("books")
            ? {
                title: t.tabs.books,
                tabBarIcon: ({ color }) =>
                  isIOS ? (
                    <SymbolView name="book" tintColor={color} size={24} />
                  ) : (
                    <Feather name="book" size={22} color={color} />
                  ),
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: t.tabs.videos,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="play.circle" tintColor={color} size={24} />
            ) : (
              <Feather name="play-circle" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={
          isFeatureVisible("aiAssistant")
            ? {
                title: t.tabs.assistant,
                tabBarIcon: ({ color }) =>
                  isIOS ? (
                    <SymbolView name="sparkles" tintColor={color} size={24} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={22} color={color} />
                  ),
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t.tabs.account,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
