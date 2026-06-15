import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { FONT } from "@/constants/typography";

// Glassmorphism Light/Dark toggle (replaces the old segmented control). A glass
// "orb" carries the active icon (sun/moon) on top and slides left<->right on a
// spring while the pill background and label cross-fade. Layout is physical
// (orb left in Light, orb right in Dark) regardless of language — only the label
// text is localized.
const PILL_HEIGHT = 46;
const ORB_SIZE = 60; // intentionally taller than the pill so the orb overflows it
const WRAP_HEIGHT = 74;
const PILL_TOP = (WRAP_HEIGHT - PILL_HEIGHT) / 2;
const ORB_TOP = (WRAP_HEIGHT - ORB_SIZE) / 2;
const COLOR_MS = 600;

const LIGHT_PILL = "#E9E6E7";
const DARK_PILL = "#0C0C0D";
const LIGHT_TEXT = "#16181D";
const DARK_TEXT = "#D2D2D6";
const SUN_COLOR = "#1B1C1F";
const MOON_COLOR = "#EDEDF0";

type ThemeGlassToggleProps = {
  isDark: boolean;
  onToggle: () => void;
  disabled?: boolean;
  lightLabel: string;
  darkLabel: string;
  direction: "rtl" | "ltr";
  accessibilityLabel?: string;
};

export function ThemeGlassToggle({
  isDark,
  onToggle,
  disabled = false,
  lightLabel,
  darkLabel,
  direction,
  accessibilityLabel,
}: ThemeGlassToggleProps) {
  const [width, setWidth] = React.useState(0);
  // t = color / cross-fade progress (smooth easeInOut); s = orb slide (springy).
  const t = useSharedValue(isDark ? 1 : 0);
  const s = useSharedValue(isDark ? 1 : 0);

  React.useEffect(() => {
    t.value = withTiming(isDark ? 1 : 0, { duration: COLOR_MS, easing: Easing.inOut(Easing.cubic) });
    s.value = withSpring(isDark ? 1 : 0, { damping: 15, stiffness: 130, mass: 0.9 });
  }, [isDark, s, t]);

  const leftRest = 0;
  const rightRest = Math.max(0, width - ORB_SIZE);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [LIGHT_PILL, DARK_PILL]),
    borderColor: interpolateColor(t.value, [0, 1], ["rgba(0,0,0,0.06)", "rgba(255,255,255,0.10)"]),
  }));

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(s.value, [0, 1], [leftRest, rightRest]) }],
    borderColor: interpolateColor(t.value, [0, 1], ["rgba(255,255,255,0.75)", "rgba(255,255,255,0.22)"]),
  }));

  const orbTintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ["rgba(255,255,255,0.34)", "rgba(26,26,30,0.38)"]),
  }));

  const sunStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.55, 1], [1, 0, 0]),
    transform: [
      { scale: interpolate(t.value, [0, 1], [1, 0.6]) },
      { rotate: `${interpolate(t.value, [0, 1], [0, -50])}deg` },
    ],
  }));

  const moonStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.45, 1], [0, 0, 1]),
    transform: [
      { scale: interpolate(t.value, [0, 1], [0.6, 1]) },
      { rotate: `${interpolate(t.value, [0, 1], [40, 0])}deg` },
    ],
  }));

  const lightLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.5], [1, 0], "clamp"),
    transform: [{ translateX: interpolate(t.value, [0, 1], [0, 12]) }],
  }));

  const darkLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.5, 1], [0, 1], "clamp"),
    transform: [{ translateX: interpolate(t.value, [0, 1], [-12, 0]) }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: isDark, disabled }}
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.wrap, { opacity: disabled ? 0.56 : 1 }]}
    >
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={[styles.labelZone, styles.labelZoneRight, lightLabelStyle]} pointerEvents="none">
          <Animated.Text style={[styles.label, { color: LIGHT_TEXT, writingDirection: direction }]} numberOfLines={1}>
            {lightLabel}
          </Animated.Text>
        </Animated.View>
        <Animated.View style={[styles.labelZone, styles.labelZoneLeft, darkLabelStyle]} pointerEvents="none">
          <Animated.Text style={[styles.label, { color: DARK_TEXT, writingDirection: direction }]} numberOfLines={1}>
            {darkLabel}
          </Animated.Text>
        </Animated.View>
      </Animated.View>

      {width > 0 ? (
        <Animated.View style={[styles.orb, orbStyle]} pointerEvents="none">
          <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={styles.orbLayer} />
          <Animated.View style={[styles.orbLayer, orbTintStyle]} />
          <LinearGradient
            colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0.08)", "rgba(120,120,130,0.04)"]}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={styles.orbLayer}
          />
          {/* Active mode icon rides ON TOP of the orb so it stays clearly visible. */}
          <Animated.View style={[styles.orbIcon, sunStyle]}>
            <Feather name="sun" size={20} color={SUN_COLOR} />
          </Animated.View>
          <Animated.View style={[styles.orbIcon, moonStyle]}>
            <Feather name="moon" size={18} color={MOON_COLOR} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: WRAP_HEIGHT,
    width: "50%",
    alignSelf: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    top: PILL_TOP,
    left: 0,
    right: 0,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  labelZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  labelZoneRight: { left: ORB_SIZE, right: 0 },
  labelZoneLeft: { left: 0, right: ORB_SIZE },
  label: {
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  orb: {
    position: "absolute",
    top: ORB_TOP,
    left: 0,
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  orbLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB_SIZE / 2,
  },
  orbIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
