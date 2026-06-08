import React, { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { usePreferences } from "@/contexts/PreferencesContext";

/**
 * Rounded surface that holds the auth form fields. Uses an OPAQUE `surface` background
 * (not the translucent `card` token): on a translucent card the ambient background glow
 * bled through as an uneven lighter patch inside the card — very visible on Android.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  const { colors } = usePreferences();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
    gap: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
});
