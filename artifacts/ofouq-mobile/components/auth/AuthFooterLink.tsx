import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

type AuthFooterLinkProps = {
  prompt: string;
  action: string;
  onPress: () => void;
};

/** "Don't have an account? Create account" style footer with a tappable action. */
export function AuthFooterLink({ prompt, action, onPress }: AuthFooterLinkProps) {
  const { colors, direction } = usePreferences();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      hitSlop={8}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.prompt, { color: colors.textSecondary, writingDirection: direction }]}>
        {prompt}{" "}
        <Text style={styles.action}>{action}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", paddingVertical: 6 },
  prompt: { ...FONT.regular, fontSize: 14, textAlign: "center" },
  action: { ...FONT.bold, color: COLORS.primary },
});
