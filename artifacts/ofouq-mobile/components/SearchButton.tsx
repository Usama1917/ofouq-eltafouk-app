import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";

import { COLORS } from "@/constants/colors";
import { usePreferences } from "@/contexts/PreferencesContext";

// v2 Phase 4 — a compact search button (magnifier only) for the videos-section headers.
// Lives in the header at the far inline-end of the language (left in Arabic, right in
// English); tapping it opens the lesson search screen.
export function SearchButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, resolvedScheme } = usePreferences();
  return (
    <Pressable
      onPress={() => router.push("/(tabs)/videos/search")}
      accessibilityRole="button"
      accessibilityLabel="search"
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
          borderColor: colors.border,
        },
        resolvedScheme === "dark" && { backgroundColor: pressed ? "#1c1c1e" : "#151517" },
        style,
      ]}
    >
      <Feather name="search" size={20} color={COLORS.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
