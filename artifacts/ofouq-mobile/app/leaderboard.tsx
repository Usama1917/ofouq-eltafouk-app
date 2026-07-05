import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View, type FlexStyle, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import { fetchLeaderboard, leaderboardQueryKey, type LeaderboardEntry } from "@/lib/gamification";
import { resolveMediaUrl } from "@/lib/media";

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return toEnglishDigits(String(rank));
}

function Row({
  entry,
  colors,
  rowDirection,
  textAlign,
}: {
  entry: LeaderboardEntry;
  colors: { card: string; border: string; text: string; textSecondary: string; surfaceSecondary: string };
  rowDirection: FlexStyle["flexDirection"];
  textAlign: TextStyle["textAlign"];
}) {
  const avatar = resolveMediaUrl(entry.avatarUrl);
  const highlight = entry.isCurrentUser;
  return (
    <View
      style={[
        styles.row,
        {
          flexDirection: rowDirection,
          backgroundColor: highlight ? "rgba(29,78,216,0.10)" : colors.card,
          borderColor: highlight ? COLORS.primary : colors.border,
        },
      ]}
    >
      <View style={[styles.rankBox, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.rankText, { color: colors.text }]}>{rankBadge(entry.rank)}</Text>
      </View>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={[styles.avatarInitial, { color: COLORS.primary }]}>{(entry.name || "?").charAt(0)}</Text>
        )}
      </View>
      <Text style={[styles.name, { color: colors.text, textAlign }]} numberOfLines={1}>
        {entry.name || "—"}
        {highlight ? " (أنت)" : ""}
      </Text>
      {/* spacer pushes the points to the opposite edge so the name hugs the avatar */}
      <View style={styles.nameSpacer} />
      <View style={styles.pointsBox}>
        <Text style={[styles.points, { color: COLORS.primary }]}>🎟️ {toEnglishDigits(String(entry.points))}</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolvedScheme, language, isRTL, rowDirection, direction, textAlign } = usePreferences();
  const { user, token } = useAuth();
  const isEn = language === "en";
  const [scope, setScope] = useState<"grade" | "all">("grade");

  // Sliding highlight pill under the active scope tab (RTL-aware).
  const [toggleW, setToggleW] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (toggleW <= 0) return;
    const halfW = (toggleW - 8) / 2;
    // Map the active tab to its VISUAL half: in RTL "صفّي" sits on the right.
    const factor = scope === "grade" ? (isRTL ? 1 : 0) : isRTL ? 0 : 1;
    Animated.spring(slideX, { toValue: factor * halfW, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [scope, toggleW, isRTL, slideX]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...leaderboardQueryKey, scope, token],
    // Cumulative all-time ranking (total points), not weekly.
    queryFn: () => fetchLeaderboard(token, scope, "all"),
    enabled: Boolean(user && token),
  });

  const entries = data?.entries ?? [];
  const me = data?.me ?? null;
  const meInList = me ? entries.some((e) => e.userId === me.userId) : false;

  const scopeTabs: { id: "grade" | "all"; label: string }[] = [
    { id: "grade", label: isEn ? "My grade" : "صفّي" },
    { id: "all", label: isEn ? "Everyone" : "الكل" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={resolvedScheme === "dark" ? ["#000000", "#000000"] : ["#EEF5FF", "#F7FAFF"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header — title centered; back button absolutely pinned to the physical left */}
      <View style={{ paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>🏆 {isEn ? "Leaderboard" : "المتصدّرون"}</Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
            style={[styles.backBtn, styles.backBtnLeft, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={isEn ? "Back" : "رجوع"}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Scope toggle with a sliding highlight pill */}
      <View
        onLayout={(e) => setToggleW(e.nativeEvent.layout.width)}
        style={[styles.toggle, { flexDirection: rowDirection, backgroundColor: colors.surfaceSecondary }]}
      >
        {toggleW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.togglePill,
              { width: (toggleW - 8) / 2, backgroundColor: colors.card, transform: [{ translateX: slideX }] },
            ]}
          />
        ) : null}
        {scopeTabs.map((t) => {
          const active = scope === t.id;
          return (
            <Pressable key={t.id} onPress={() => setScope(t.id)} style={styles.toggleBtn}>
              <Text style={[styles.toggleText, { color: active ? COLORS.primary : colors.textSecondary }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>{isEn ? "Failed to load." : "تعذّر التحميل."}</Text>
          <Pressable onPress={() => refetch()} style={[styles.retry, { borderColor: colors.border }]}>
            <Text style={{ color: COLORS.primary, ...FONT.bold }}>{isEn ? "Retry" : "إعادة المحاولة"}</Text>
          </Pressable>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>🏅</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {isEn ? "No ranking yet — start studying to appear here!" : "لسه مفيش ترتيب — ابدأ تذاكر عشان تظهر هنا!"}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 90, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((e) => (
            <Row key={e.userId} entry={e} colors={colors} rowDirection={rowDirection} textAlign={textAlign} />
          ))}

          {/* Pin the current user's row if they're below the visible top list */}
          {me && !meInList ? (
            <>
              <Text style={[styles.divider, { color: colors.textTertiary }]}>• • •</Text>
              <Row entry={me} colors={colors} rowDirection={rowDirection} textAlign={textAlign} />
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnLeft: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  headerTitle: { ...FONT.bold, fontSize: 18 },
  subtitle: { ...FONT.medium, fontSize: 12, paddingHorizontal: 18, marginBottom: 12 },
  toggle: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    padding: 4,
    position: "relative",
  },
  togglePill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: "center",
    zIndex: 1,
  },
  toggleText: { ...FONT.bold, fontSize: 13 },
  row: {
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rankBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { ...FONT.bold, fontSize: 15 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { ...FONT.bold, fontSize: 16 },
  name: { ...FONT.semiBold, fontSize: 15, flexShrink: 1 },
  nameSpacer: { flex: 1 },
  pointsBox: { minWidth: 64, alignItems: "flex-end" },
  points: { ...FONT.bold, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { ...FONT.medium, fontSize: 14, textAlign: "center" },
  retry: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 18 },
  divider: { textAlign: "center", ...FONT.bold, fontSize: 16, marginVertical: 2 },
});
