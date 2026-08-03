import { BlurView } from "expo-blur";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { openNotificationTarget, type AppNotification, type NotificationActionData } from "@/lib/notifications";

// An in-app banner for pushes that arrive WHILE the app is open, styled after the
// iOS notification banner: frosted glass, app icon, app name + "now", then the
// title and body — sliding down from the top and settling with a spring.
//
// Why we draw it ourselves: the OS only shows its own banner over a foregrounded
// app at its discretion (notification permission level, per-app settings, Focus
// modes, and — while developing — the Expo Go client's entitlements). So a push
// arriving with the app open routinely landed invisibly: the notifications list
// refreshed in the background and the student saw nothing at all.

const APP_ICON = require("../assets/images/icon.png");

export type InAppNotificationPayload = {
  title: string;
  body: string;
  data?: NotificationActionData;
};

type Listener = (payload: InAppNotificationPayload) => void;

const listeners = new Set<Listener>();

/** Show an in-app banner. Callable from anywhere — no React context required. */
export function showInAppNotification(payload: InAppNotificationPayload) {
  for (const listener of listeners) listener(payload);
}

const VISIBLE_MS = 4500;
const HIDDEN_OFFSET = -180; // far enough up to clear the banner + its shadow

export default function InAppNotificationBanner() {
  const { colors, resolvedScheme, language, isRTL, direction, reduceMotion } = usePreferences();
  const en = language === "en";
  const isDark = resolvedScheme === "dark";
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<InAppNotificationPayload | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (reduceMotion) {
      anim.setValue(0);
      setPayload(null);
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: 230, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setPayload(null);
      },
    );
  }, [anim, reduceMotion]);

  // The pan responder is created once, so point it at the latest hide().
  const hideRef = useRef(hide);
  hideRef.current = hide;

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => hideRef.current(), VISIBLE_MS);
  }, []);

  useEffect(() => {
    const listener: Listener = (next) => {
      setPayload(next);
      if (reduceMotion) {
        anim.setValue(1);
      } else {
        anim.setValue(0);
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 10, tension: 70 }).start();
      }
      scheduleHide();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [anim, reduceMotion, scheduleHide]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  // Swipe up to dismiss early — same gesture as a real iOS banner.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -20) hideRef.current();
      },
    }),
  ).current;

  function onPress() {
    const current = payload;
    hide();
    if (!current?.data?.route) return;
    const notification: AppNotification = {
      id: Number(current.data.notificationId ?? 0) || 0,
      type: String(current.data.type ?? ""),
      title: current.title,
      body: current.body,
      tone: "primary",
      data: current.data,
      availableAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    openNotificationTarget(notification);
  }

  if (!payload) return null;

  const align = isRTL ? ("right" as const) : ("left" as const);
  // Physical row order: icon on the reading side, like the OS banner.
  const rowDir = en ? ("row" as const) : ("row-reverse" as const);

  return (
    <Animated.View
      {...pan.panHandlers}
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 6,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [HIDDEN_OFFSET, 0] }) }],
        },
      ]}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.press, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
        <BlurView intensity={Platform.OS === "ios" ? 70 : 100} tint={isDark ? "dark" : "light"} style={styles.card}>
          {/* Android's blur is weaker, and a translucent scrim keeps the text
              readable over a busy screen on both platforms. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(28,28,30,0.72)" : "rgba(255,255,255,0.72)" }]} />
          <View style={[styles.inner, { flexDirection: rowDir }]}>
            <Image source={APP_ICON} style={styles.appIcon} resizeMode="cover" />
            <View style={{ flex: 1, gap: 1 }}>
              <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                <Text style={[styles.appName, { color: colors.textSecondary, textAlign: align }]}>
                  {en ? "ELTAFOUK" : "التفوق"}
                </Text>
                <Text style={[styles.time, { color: colors.textTertiary }]}>{en ? "now" : "الآن"}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.title, { color: colors.text, textAlign: align, writingDirection: direction }]}
              >
                {payload.title}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.body, { color: colors.text, textAlign: align, writingDirection: direction }]}
              >
                {payload.body}
              </Text>
            </View>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 10, right: 10, zIndex: 9999, elevation: 24 },
  press: {
    borderRadius: 22,
    // iOS banners float clearly above the content behind them.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  card: { borderRadius: 22, overflow: "hidden" },
  inner: { paddingVertical: 11, paddingHorizontal: 12, gap: 10, alignItems: "center", direction: "ltr" },
  appIcon: { width: 38, height: 38, borderRadius: 9 },
  metaRow: { alignItems: "center", justifyContent: "space-between", gap: 8, direction: "ltr" },
  // Small, wide-tracked, muted — the OS banner's app-name treatment.
  appName: { ...FONT.semiBold, fontSize: 11, letterSpacing: 0.4 },
  time: { ...FONT.regular, fontSize: 11 },
  title: { ...FONT.bold, fontSize: 14 },
  body: { ...FONT.regular, fontSize: 13, lineHeight: 18 },
});
