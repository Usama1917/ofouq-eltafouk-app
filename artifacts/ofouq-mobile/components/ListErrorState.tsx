import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

// Shown when a list FAILED to load — never when it merely came back empty.
// Before this existed every store list defaulted its data to [] and rendered its
// "nothing here" empty state on error too, so a dead connection looked exactly
// like an empty wishlist and the student had no way to retry.
export default function ListErrorState({
  onRetry,
  message,
  retrying = false,
}: {
  onRetry: () => void;
  /** Optional override; defaults to the generic connection message. */
  message?: string;
  retrying?: boolean;
}) {
  const { colors, language, reduceMotion } = usePreferences();
  const en = language === "en";
  const anim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [anim, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: COLORS.error + "18" }]}>
        <Feather name="wifi-off" size={26} color={COLORS.error} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>
        {message ?? (en ? "Couldn't load" : "تعذّر التحميل")}
      </Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {en ? "Check your connection and try again." : "اطمن على النت وجرّب تاني."}
      </Text>
      <Pressable
        onPress={onRetry}
        disabled={retrying}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: COLORS.primary, opacity: retrying ? 0.6 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Feather name="refresh-cw" size={15} color="#fff" />
        <Text style={styles.retryText}>{en ? "Try again" : "حاول تاني"}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 40, minHeight: 240 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  title: { ...FONT.bold, fontSize: 16, textAlign: "center" },
  hint: { ...FONT.regular, fontSize: 13, textAlign: "center" },
  retryBtn: { marginTop: 6, flexDirection: "row", direction: "ltr", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 11 },
  retryText: { ...FONT.bold, fontSize: 14, color: "#fff" },
});
