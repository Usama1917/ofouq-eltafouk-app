import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

/** Inline banner for backend / submit-level errors (e.g. invalid credentials). */
export function AuthErrorBanner({ message }: { message?: string | null }) {
  const { isRTL, direction } = usePreferences();
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { flexDirection: isRTL ? "row-reverse" : "row" }]}
    >
      <Feather name="alert-triangle" size={16} color={COLORS.error} />
      <Text style={[styles.text, { textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    direction: "ltr",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  text: { flex: 1, ...FONT.medium, fontSize: 13, color: COLORS.error },
});
