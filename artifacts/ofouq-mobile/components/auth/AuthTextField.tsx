import { Feather } from "@expo/vector-icons";
import React, { forwardRef, type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";

export type AuthTextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Feather icon name shown at the leading (start) edge of the input. */
  icon: keyof typeof Feather.glyphMap;
  error?: string | null;
  /** Rendered at the trailing (end) edge — used for the password visibility toggle. */
  trailingAccessory?: ReactNode;
};

/**
 * Polished, fully direction-aware labelled text input.
 *
 * IMPORTANT — these screens render inside an iOS modal (`presentation: "modal"`),
 * where the global RTL context is NOT reliable: physical `textAlign: "right"` gets
 * swapped to the left even though `flexDirection` still flips. So instead of leaning on
 * the ambient RTL state we pin a PHYSICAL LTR layout context (`direction: "ltr"`) on the
 * field and position everything physically from `isRTL`:
 *   - label/input/error use `textAlign: isRTL ? "right" : "left"` (no swap, because the
 *     container is forced LTR) → Arabic on the right, English on the left;
 *   - the row uses `row-reverse` in Arabic so the leading icon sits at the right edge and
 *     the trailing accessory (password eye) at the left.
 * This mirrors the governorate picker modal already proven to work in this app. Login and
 * Register share this component, so both stay consistent on iOS and Android.
 */
export const AuthTextField = forwardRef<TextInput, AuthTextFieldProps>(function AuthTextField(
  { label, icon, error, trailingAccessory, onFocus, onBlur, ...inputProps },
  ref,
) {
  const { colors, isRTL, direction } = usePreferences();
  const [focused, setFocused] = useState(false);
  const focusAnim = useRef(new Animated.Value(0)).current;

  const fieldTextAlign = isRTL ? "right" : "left";
  const rowFlex = isRTL ? "row-reverse" : "row";

  useEffect(() => {
    Animated.timing(focusAnim, {
      toValue: focused ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [focused, focusAnim]);

  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };
  const handleBlur: NonNullable<TextInputProps["onBlur"]> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  const animatedBorder = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, COLORS.primary],
  });
  const borderColor = error ? COLORS.error : animatedBorder;
  const iconColor = error ? COLORS.error : focused ? COLORS.primary : colors.textTertiary;

  return (
    <View style={styles.field}>
      <Text
        style={[styles.label, { color: colors.textSecondary, textAlign: fieldTextAlign, writingDirection: direction }]}
        accessibilityRole="text"
      >
        {label}
      </Text>

      <Animated.View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor,
            flexDirection: rowFlex,
            shadowOpacity: focused ? 0.12 : 0,
          },
        ]}
      >
        <Feather name={icon} size={18} color={iconColor} />
        <TextInput
          ref={ref}
          style={[styles.input, { color: colors.text, textAlign: fieldTextAlign, writingDirection: direction }]}
          placeholderTextColor={colors.textTertiary}
          textAlign={fieldTextAlign}
          accessibilityLabel={label}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...inputProps}
        />
        {trailingAccessory}
      </Animated.View>

      {error ? (
        <View style={[styles.errorRow, { flexDirection: rowFlex }]}>
          <Feather name="alert-circle" size={13} color={COLORS.error} />
          <Text style={[styles.errorText, { textAlign: fieldTextAlign, writingDirection: direction }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // `direction: "ltr"` pins a physical layout context so textAlign right/left is NOT
  // swapped inside the modal; we then place everything physically from isRTL.
  field: { direction: "ltr", gap: 7, alignSelf: "stretch", width: "100%" },
  label: { ...FONT.semiBold, fontSize: 13, alignSelf: "stretch", width: "100%" },
  inputWrapper: {
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 52,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  input: { flex: 1, ...FONT.regular, fontSize: 15, paddingVertical: 14 },
  errorRow: { alignItems: "center", alignSelf: "stretch", width: "100%", gap: 5 },
  errorText: { flex: 1, ...FONT.medium, fontSize: 12, color: COLORS.error },
});
