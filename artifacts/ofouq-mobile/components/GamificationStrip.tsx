import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { iconFire } from "@/assets/lottie";
import LottieBox, { type LottieBoxHandle } from "@/components/LottieBox";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import type { GamificationSummary } from "@/lib/gamification";
import { useStreakCelebration } from "@/lib/streakCelebration";

function GoalRing({ ratio, color, track }: { ratio: number; color: string; track: string }) {
  const size = 56;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = c * (1 - clamped);
  const pct = Math.round(clamped * 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          // start the arc at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={[styles.ringPct, { color }]}>{toEnglishDigits(String(pct))}%</Text>
        </View>
      </View>
    </View>
  );
}

export function GamificationStrip({
  summary,
  onPress,
}: {
  summary: GamificationSummary;
  onPress: () => void;
}) {
  const { colors, resolvedScheme, language, rowDirection, direction, textAlign } = usePreferences();
  const isEn = language === "en";
  const ringTrack = resolvedScheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";
  const goalColor = summary.goalMet ? "#059669" : COLORS.primary;

  // Same streak-up celebration as the Points & Streak screen, fired at most once a
  // day across BOTH cards (whichever is shown first wins; the other won't repeat it).
  const iconLottie = useRef<LottieBoxHandle>(null);
  const { celebrating, displayStreak, fireAnim } = useStreakCelebration(summary.streak, {
    onRevealDone: () => {
      iconLottie.current?.play();
      setTimeout(() => iconLottie.current?.stop(), 2000);
    },
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          direction,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={isEn ? "Open leaderboard" : "افتح المتصدّرين"}
    >
      <View style={[styles.row, { flexDirection: rowDirection }]}>
        <GoalRing ratio={summary.todayProgressRatio} color={goalColor} track={ringTrack} />

        <View style={[styles.stats, { flexDirection: rowDirection }]}>
          <View style={styles.stat}>
            {/* Owner rule: ALWAYS number first, then the icon, reading left→right.
                `direction: "ltr"` pins the physical order — a bare flexDirection
                "row" gets mirrored by RN under RTL and rendered the flame first. */}
            <View style={styles.valueRow}>
              <Text style={[styles.statValue, { color: colors.text }]}>{toEnglishDigits(String(summary.streak))}</Text>
              <LottieBox ref={iconLottie} data={iconFire} restFrame={60} loop autoplay={false} style={styles.flame} />
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, textAlign }]}>
              {isEn ? "day streak" : "يوم متتالي"}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            {/* Same structure as the streak — the number and the emoji are separate
                nodes rather than one string, so the order is laid out, not left to
                bidi reordering (which flips with the surrounding text direction). */}
            <View style={styles.valueRow}>
              <Text style={[styles.statValue, { color: colors.text }]}>{toEnglishDigits(String(summary.balance))}</Text>
              <Text style={styles.statValue}>🎟️</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textSecondary, textAlign }]}>
              {isEn ? "points" : "نقطة"}
            </Text>
          </View>
        </View>

        <View style={[styles.cta, { flexDirection: rowDirection }]}>
          <Text style={[styles.ctaText, { color: COLORS.primary }]}>{isEn ? "Ranking" : "المتصدّرون"}</Text>
          <Feather name={language === "en" ? "chevron-right" : "chevron-left"} size={18} color={COLORS.primary} />
        </View>
      </View>

      {/* streak takeover — black→orange backdrop + big counting number */}
      {celebrating ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fireAnim, alignItems: "center", justifyContent: "center" }]}>
          <LinearGradient colors={["#0c0603", "#6b2410", "#ef7d1f"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
          <Animated.Text style={[styles.fireNumber, { transform: [{ scale: fireAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
            {toEnglishDigits(String(displayStreak))}
          </Animated.Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    gap: 12,
  },
  stats: {
    flex: 1,
    alignItems: "center",
    gap: 12,
  },
  stat: {
    alignItems: "center",
    minWidth: 56,
  },
  // Shared by the streak and the points so both read number-then-icon identically.
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    direction: "ltr",
  },
  statValue: {
    ...FONT.bold,
    fontSize: 17,
    color: "#0F172A",
  },
  statLabel: {
    ...FONT.medium,
    fontSize: 11,
    marginTop: 2,
  },
  flame: { width: 22, height: 26 },
  divider: {
    width: 1,
    height: 28,
  },
  cta: {
    alignItems: "center",
    gap: 2,
  },
  ctaText: {
    ...FONT.bold,
    fontSize: 12,
  },
  ringPct: {
    ...FONT.bold,
    fontSize: 13,
  },
  fireNumber: {
    ...FONT.bold,
    fontSize: 34,
    color: "#FFFFFF",
    textShadowColor: "rgba(120,30,4,0.85)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
});
