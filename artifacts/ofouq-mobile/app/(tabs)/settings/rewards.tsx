import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { iconFire } from "@/assets/lottie";
import LottieBox, { type LottieBoxHandle } from "@/components/LottieBox";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import { useStreakCelebration } from "@/lib/streakCelebration";
import {
  fetchGamification,
  fetchLeaderboard,
  fetchPointsHistory,
  gamificationQueryKey,
  leaderboardQueryKey,
  pointsHistoryQueryKey,
  type PointsTransaction,
} from "@/lib/gamification";

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string, isEn: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = isEn ? EN_MONTHS : AR_MONTHS;
  return toEnglishDigits(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`);
}

// A small emoji per earn source so the log reads at a glance.
function txIcon(t: PointsTransaction): string {
  const key = t.sourceKey ?? "";
  if (key.startsWith("lesson_complete")) return "📚";
  if (key.startsWith("daily_goal")) return "🎯";
  if (key.startsWith("streak_milestone")) return "🔥";
  if (key.startsWith("daily_active")) return "☀️";
  if (t.type === "spend") return "🛒";
  return "🎟️";
}

// Localized label per earn source. The stored `description` is Arabic-only, so we
// key off the language-independent `sourceKey` to show English in the English UI.
// Dynamic rows (reward spends, admin adjustments) have no known key → keep their
// own description as-is.
function txLabel(t: PointsTransaction, isEn: boolean): string {
  const key = t.sourceKey ?? "";
  if (key.startsWith("lesson_complete")) return isEn ? "Watch a lesson" : "مشاهدة درس";
  if (key.startsWith("daily_goal")) return isEn ? "Daily goal reached" : "تحقيق الهدف اليومي";
  if (key.startsWith("streak_milestone")) {
    const n = t.description.match(/\d+/)?.[0];
    return isEn ? (n ? `${n}-day streak bonus` : "Streak bonus") : t.description;
  }
  if (key.startsWith("daily_active")) return isEn ? "Daily activity" : "نشاط يومي";
  return t.description;
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolvedScheme, language, isRTL, rowDirection, direction, textAlign } = usePreferences();
  const { user, token } = useAuth();
  const isEn = language === "en";

  const { data: summary } = useQuery({
    queryKey: [...gamificationQueryKey, token],
    queryFn: () => fetchGamification(token),
    enabled: Boolean(user && token),
  });
  const { data: history, isLoading } = useQuery({
    queryKey: [...pointsHistoryQueryKey, token],
    queryFn: () => fetchPointsHistory(token),
    enabled: Boolean(user && token),
  });
  const transactions = history?.transactions ?? [];

  // Opened from a points-gain notification → pulse the newest entry once (~1s).
  const params = useLocalSearchParams<{ highlight?: string }>();
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [pulsed, setPulsed] = useState(false);
  useEffect(() => {
    if (params.highlight === "1" && !pulsed && transactions.length > 0) {
      setPulsed(true);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start();
    }
  }, [params.highlight, pulsed, transactions.length, pulseAnim]);

  // Current rank in the (grade) leaderboard — shown in the summary.
  const { data: leaderboard } = useQuery({
    queryKey: [...leaderboardQueryKey, "grade", token],
    queryFn: () => fetchLeaderboard(token, "grade", "all"),
    enabled: Boolean(user && token),
  });
  const rank = leaderboard?.me?.rank ?? null;

  // ── Streak-up celebration ─────────────────────────────────────────────────
  // Fires once/day (shared with the home strip) when the streak gains a day: the
  // side stats vanish, a black→orange backdrop + BIG centred number tick +1, then
  // the flame icon plays for 2s and settles. Logic lives in useStreakCelebration.
  const iconLottie = useRef<LottieBoxHandle>(null); // the streak flame (plays 2s then freezes)
  const { celebrating, displayStreak, fireAnim, revealAnim, playCelebration } = useStreakCelebration(summary?.streak, {
    onRevealDone: () => {
      iconLottie.current?.play();
      setTimeout(() => iconLottie.current?.stop(), 2000);
    },
  });

  // The "i" square literally grows INTO the card: its left edge slides left (width
  // grows) and its bottom edge slides down (height grows), top-right corner fixed.
  const { width: winW } = useWindowDimensions();
  const fullWidth = winW - 32; // screen minus the 16px side margins
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesContentH, setRulesContentH] = useState(0);
  const rulesAnim = useRef(new Animated.Value(0)).current;
  const openRules = () => {
    rulesAnim.setValue(0);
    setRulesOpen(true);
  };
  const closeRules = () => {
    Animated.timing(rulesAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start(() => setRulesOpen(false));
  };
  // Start the grow once the content's full height is measured (so we know the target).
  useEffect(() => {
    if (rulesOpen && rulesContentH > 0) {
      Animated.spring(rulesAnim, { toValue: 1, useNativeDriver: false, tension: 55, friction: 11 }).start();
    }
  }, [rulesOpen, rulesContentH, rulesAnim]);

  const RULES: { icon: string; label: string; amount: string }[] = [
    { icon: "📚", label: isEn ? "Watch a lesson" : "مشاهدة درس", amount: "+10" },
    { icon: "☀️", label: isEn ? "Daily activity" : "نشاط يومي", amount: "+5" },
    { icon: "🎯", label: isEn ? "Daily goal (30 min)" : "تحقيق الهدف اليومي (٣٠ دقيقة)", amount: "+20" },
    { icon: "🔥", label: isEn ? "10-day streak" : "سلسلة ١٠ أيام", amount: "+20" },
    { icon: "🔥", label: isEn ? "20-day streak" : "سلسلة ٢٠ يوم", amount: "+50" },
    { icon: "🔥", label: isEn ? "30-day streak" : "سلسلة ٣٠ يوم", amount: "+100" },
    { icon: "🔥", label: isEn ? "Each day after 30" : "كل يوم بعد الـ٣٠", amount: "+5" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={resolvedScheme === "dark" ? ["#000000", "#000000"] : ["#EEF5FF", "#F7FAFF"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, paddingHorizontal: 16 }}>
        <View style={styles.headerRow}>
          {/* Physical LTR row so the medal always sits on the LEFT of the title. */}
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>🏅</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{isEn ? "Points & Streak" : "النقاط والستريك"}</Text>
          </View>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/settings"))}
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={isEn ? "Back" : "رجوع"}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={openRules}
            style={[styles.infoBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={isEn ? "Points rules" : "قواعد النقاط"}
            hitSlop={8}
          >
            <Feather name="info" size={18} color={COLORS.primary} />
          </Pressable>
        </View>
      </View>

      {/* Fixed: summary + section title (don't scroll) */}
      <View style={{ paddingHorizontal: 16, gap: 14 }}>
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: rowDirection, overflow: "hidden" }]}>
          {/* points */}
          <Animated.View style={[styles.summaryStat, { opacity: revealAnim, transform: [{ translateX: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }] }]}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>🎟️ {toEnglishDigits(String(summary?.balance ?? 0))}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isEn ? "points" : "نقطة"}</Text>
          </Animated.View>
          <Animated.View style={[styles.summaryDivider, { backgroundColor: colors.border, opacity: revealAnim }]} />
          {/* streak (with a live, flickering flame) */}
          <Animated.View style={[styles.summaryStat, { opacity: revealAnim, transform: [{ translateX: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }] }]}>
            <Pressable
              onLongPress={() => {
                if (celebrating) return;
                const s = summary?.streak ?? 0;
                // preview the celebration even at streak 0 (shows 0 → 1)
                playCelebration(s > 0 ? s - 1 : 0, s > 0 ? s : 1);
              }}
              delayLongPress={450}
              style={{ alignItems: "center" }}
            >
              {/* flame on the LEFT of the number (RTL: number is the first/right child) */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{toEnglishDigits(String(summary?.streak ?? 0))}</Text>
                <LottieBox ref={iconLottie} data={iconFire} restFrame={60} loop autoplay={false} style={styles.iconFlame} />
              </View>
              <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isEn ? "day streak" : "يوم متتالي"}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={[styles.summaryDivider, { backgroundColor: colors.border, opacity: revealAnim }]} />
          {/* rank */}
          <Animated.View style={[styles.summaryStat, { opacity: revealAnim, transform: [{ translateX: revealAnim.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }] }]}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>🏆 {rank ? toEnglishDigits(String(rank)) : "—"}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{isEn ? "current rank" : "التصنيف الحالي"}</Text>
          </Animated.View>

          {/* streak takeover — a black→orange backdrop with the big counting number */}
          {celebrating ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fireAnim, alignItems: "center", justifyContent: "center" }]}>
              <LinearGradient colors={["#0c0603", "#6b2410", "#ef7d1f"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
              <Animated.Text
                style={[
                  styles.fireNumber,
                  { transform: [{ scale: fireAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] },
                ]}
              >
                {toEnglishDigits(String(displayStreak))}
              </Animated.Text>
            </Animated.View>
          ) : null}
        </View>
        <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
          <Text style={[styles.sectionTitle, { color: colors.text, textAlign }]}>{isEn ? "Points history" : "سجل النقاط"}</Text>
        </View>
      </View>

      {/* Only the history list scrolls */}
      <ScrollView
        style={{ flex: 1, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 118, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
        ) : transactions.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 36 }}>🎟️</Text>
            <Text style={[styles.muted, { color: colors.textSecondary }]}>
              {isEn ? "No points yet — start studying to earn some!" : "لسه مكسبتش نقاط — ابدأ تذاكر وهتكسب!"}
            </Text>
          </View>
        ) : (
          transactions.map((t, idx) => (
            <View key={t.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: rowDirection }]}>
              {idx === 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: 16, backgroundColor: COLORS.primary, opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }) },
                  ]}
                />
              ) : null}
              <View style={[styles.txIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={{ fontSize: 18 }}>{txIcon(t)}</Text>
              </View>
              <View style={[styles.txBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={[styles.txDesc, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>{txLabel(t, isEn)}</Text>
                <Text style={[styles.txDate, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>{fmtDate(t.createdAt, isEn)}</Text>
              </View>
              {/* spacer pushes the points to the far edge; the text hugs the icon */}
              <View style={styles.txSpacer} />
              <Text style={[styles.txAmount, { color: t.amount >= 0 ? "#059669" : "#dc2626" }]}>
                {t.amount >= 0 ? "+" : ""}{toEnglishDigits(String(t.amount))}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Points-rules card — the "i" square itself grows into the card (width slides
          left, height slides down, top-right corner pinned to the button). */}
      {rulesOpen ? (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.rulesBackdrop, { opacity: rulesAnim }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeRules} />
          <Animated.View
            style={[
              styles.rulesBox,
              {
                top: insets.top + 12,
                backgroundColor: colors.surface,
                borderColor: colors.border,
                width: rulesAnim.interpolate({ inputRange: [0, 1], outputRange: [40, fullWidth] }),
                height: rulesAnim.interpolate({ inputRange: [0, 1], outputRange: [40, Math.max(rulesContentH, 40)] }),
                // Starts as the circular "i" button (r=20) and grows into the card,
                // keeping the morph seamless now that the button is a full circle.
                borderRadius: 20,
              },
            ]}
          >
            {/* the "i" sits in the original 40×40 spot and fades out as it opens */}
            <Animated.View
              pointerEvents="none"
              style={[styles.rulesIIcon, { opacity: rulesAnim.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: "clamp" }) }]}
            >
              <Feather name="info" size={18} color={COLORS.primary} />
            </Animated.View>

            {/* full-size content, pinned to the box's right edge, revealed as it grows */}
            <Animated.View
              onLayout={(e) => setRulesContentH(e.nativeEvent.layout.height)}
              style={[styles.rulesContent, { width: fullWidth, opacity: rulesAnim.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.1, 1] }) }]}
            >
              <View style={[styles.rulesHeader, { flexDirection: rowDirection }]}>
                <Text style={[styles.rulesTitle, { color: colors.text }]}>{isEn ? "How to earn points" : "إزاي تكسب نقاط؟"}</Text>
              </View>
              {RULES.map((r, i) => (
                <View key={i} style={[styles.ruleRow, { flexDirection: rowDirection, borderTopColor: colors.border }]}>
                  <View style={[styles.ruleIcon, { backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={{ fontSize: 16 }}>{r.icon}</Text>
                  </View>
                  <Text style={[styles.ruleLabel, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>{r.label}</Text>
                  <View style={styles.ruleSpacer} />
                  <Text style={styles.ruleAmount}>{r.amount}</Text>
                </View>
              ))}
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { height: 40, alignItems: "center", justifyContent: "center" },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, direction: "ltr" },
  headerTitle: { ...FONT.bold, fontSize: 18 },
  infoBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 40,
    height: 40,
    // Full circle, same diameter as the back button on the left.
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rulesBackdrop: { backgroundColor: "rgba(15,23,42,0.28)" },
  rulesBox: {
    position: "absolute",
    right: 16,
    overflow: "hidden",
    borderWidth: 1,
    zIndex: 50,
  },
  rulesIIcon: { position: "absolute", top: 0, right: 0, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  rulesContent: { position: "absolute", top: 0, right: 0, padding: 18 },
  rulesHeader: { alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  rulesTitle: { ...FONT.bold, fontSize: 17 },
  rulesClose: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  ruleRow: { alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: 1 },
  ruleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  ruleLabel: { ...FONT.semiBold, fontSize: 14, flexShrink: 1 },
  ruleSpacer: { flex: 1 },
  ruleAmount: { ...FONT.bold, fontSize: 15, color: "#059669" },
  backBtn: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  summaryStat: { alignItems: "center", flex: 1 },
  iconFlame: { width: 26, height: 30 },
  summaryValue: { ...FONT.bold, fontSize: 18, color: "#0F172A" },
  fireNumber: {
    ...FONT.bold,
    fontSize: 44,
    color: "#FFFFFF",
    textShadowColor: "rgba(120,30,4,0.85)",
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
  },
  summaryLabel: { ...FONT.medium, fontSize: 11, marginTop: 3 },
  summaryDivider: { width: 1, height: 34 },
  sectionTitle: { ...FONT.bold, fontSize: 15 },
  txRow: {
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txBody: { flexShrink: 1 },
  txSpacer: { flex: 1 },
  txDesc: { ...FONT.semiBold, fontSize: 14 },
  txDate: { ...FONT.regular, fontSize: 12, marginTop: 2 },
  txAmount: { ...FONT.bold, fontSize: 16 },
  center: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  muted: { ...FONT.medium, fontSize: 14, textAlign: "center" },
});
