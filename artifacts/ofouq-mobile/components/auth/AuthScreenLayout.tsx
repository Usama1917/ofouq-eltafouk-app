import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ReactNode } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

type AuthScreenLayoutProps = {
  title: string;
  subtitle: string;
  onClose?: () => void;
  closeAccessibilityLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Shared shell for the Login and Register screens: ambient brand background, safe-area
 * aware keyboard-friendly scroll, the brand logo, and a centered title/subtitle. The
 * actual form card is passed in as `children`. Direction is driven globally by
 * I18nManager (Arabic forces RTL), so this layout stays direction-neutral apart from
 * explicit text alignment.
 */
export function AuthScreenLayout({
  title,
  subtitle,
  onClose,
  closeAccessibilityLabel,
  children,
  footer,
}: AuthScreenLayoutProps) {
  const { colors, resolvedScheme, direction } = usePreferences();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === "dark";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Ambient brand glow — subtle, premium, non-interactive */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={
            isDark
              ? ["rgba(37,99,235,0.22)", "rgba(0,0,0,0)"]
              : ["rgba(59,130,246,0.20)", "rgba(240,244,255,0)"]
          }
          style={styles.glowTop}
        />
        <LinearGradient
          colors={
            isDark
              ? ["rgba(245,158,11,0.10)", "rgba(0,0,0,0)"]
              : ["rgba(245,158,11,0.12)", "rgba(240,244,255,0)"]
          }
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.glowBottom}
        />
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {onClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeBtn,
              { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View style={styles.closeSpacer} />
        )}

        <View style={styles.logoSection}>
          <Image
            source={require("../../assets/images/login-educational-logo.png")}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={[styles.title, { color: colors.text, writingDirection: direction }]}>
            {title}
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textSecondary, writingDirection: direction }]}
          >
            {subtitle}
          </Text>
        </View>

        {children}

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 18 },
  glowTop: { position: "absolute", top: -120, left: -60, right: -60, height: 360, borderRadius: 360 },
  glowBottom: { position: "absolute", bottom: -140, left: -80, right: -80, height: 320, borderRadius: 320 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  closeSpacer: { height: 8 },
  logoSection: { alignItems: "center", gap: 6, paddingTop: 4 },
  brandLogo: { width: 240, height: 96, marginBottom: 2 },
  title: { ...FONT.bold, fontSize: 26, textAlign: "center" },
  subtitle: { ...FONT.regular, fontSize: 14, textAlign: "center", maxWidth: 300 },
  footer: { alignItems: "center", marginTop: 2 },
});
