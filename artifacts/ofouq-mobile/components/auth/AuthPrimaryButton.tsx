import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

type AuthPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
};

/** Brand gradient CTA with press-scale feedback plus loading and disabled states. */
export function AuthPrimaryButton({ label, onPress, loading, disabled, icon }: AuthPrimaryButtonProps) {
  const { direction } = usePreferences();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = Boolean(disabled || loading);

  const animateTo = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: isDisabled ? 0.65 : 1 }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !isDisabled && animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
        style={styles.pressable}
      >
        <LinearGradient
          colors={[COLORS.primaryLight, COLORS.primary, COLORS.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={[styles.label, { writingDirection: direction }]}>{label}</Text>
              {icon ? <Feather name={icon} size={18} color="#fff" /> : null}
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: { borderRadius: 16, overflow: "hidden" },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    minHeight: 54,
  },
  label: { ...FONT.bold, fontSize: 17, color: "#fff" },
});
