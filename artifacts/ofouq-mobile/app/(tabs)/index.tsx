import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { formatNumber, toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import { fetchNotificationSummary, notificationsQueryKey } from "@/lib/notifications";

type AcademicYear = {
  id: number;
  name: string;
  description?: string | null;
};

const YEAR_ACCENTS = [
  { bg: "#EAF3FF", border: "#BFDBFE", icon: "#2563EB" },
  { bg: "#ECFDF5", border: "#A7F3D0", icon: "#059669" },
  { bg: "#FFF7ED", border: "#FED7AA", icon: "#EA580C" },
  { bg: "#F5F3FF", border: "#DDD6FE", icon: "#7C3AED" },
];

function openYear(year: AcademicYear) {
  router.push({
    pathname: "/(tabs)/videos/subjects",
    params: { yearId: String(year.id), yearName: year.name },
  });
}

function compactDisplayName(name: string | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function LearningPathCard({ year, index }: { year: AcademicYear; index: number }) {
  const { colors, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const accent = YEAR_ACCENTS[index % YEAR_ACCENTS.length];

  return (
    <Pressable
      onPress={() => openYear(year)}
      style={({ pressed }) => [
        styles.pathCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          direction,
          opacity: pressed ? 0.78 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[styles.pathMain, { flexDirection: rowDirection, direction }]}>
        <View style={[styles.pathIcon, { backgroundColor: accent.bg, borderColor: accent.border }]}>
          <Ionicons name="school-outline" size={24} color={accent.icon} />
        </View>
        <View style={[styles.pathBody, { alignItems: alignStart }]}>
          <Text
            style={[styles.pathTitle, { color: colors.text, textAlign, writingDirection: direction }]}
            numberOfLines={2}
          >
            {toEnglishDigits(year.name)}
          </Text>
          {year.description ? (
            <Text
              style={[styles.pathDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
              numberOfLines={2}
            >
              {toEnglishDigits(year.description)}
            </Text>
          ) : null}
        </View>
      </View>
      <View
        style={[
          styles.pathAction,
          {
            flexDirection: rowDirection,
            direction,
            left: 16,
          },
        ]}
      >
        <Text style={[styles.pathActionText, { writingDirection: direction }]}>
          {strings.home.startLearning}
        </Text>
        <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={16} color={COLORS.primary} />
      </View>
    </Pressable>
  );
}

function EmptyLessonsState() {
  const { colors, strings } = usePreferences();
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.emptyIcon}>
        <Ionicons name="play-circle-outline" size={34} color={COLORS.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{strings.home.emptyTitle}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{strings.home.emptyText}</Text>
    </View>
  );
}

function HomeSubtitle() {
  const { colors, strings, isRTL, direction } = usePreferences();

  if (isRTL) {
    const lines = strings.home.subtitle.replace(" المتاحة الآن.", " المتاحة|الآن.").split("|");

    return (
      <View style={[styles.heroSubtitleBlock, { direction }]}>
        {lines.map((line) => (
          <Text
            key={line}
            style={[styles.heroSubtitle, { color: colors.textSecondary, writingDirection: direction }]}
          >
            {line}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <Text
      style={[
        styles.heroSubtitle,
        {
          color: colors.textSecondary,
          marginTop: 10,
          textAlign: "left",
          writingDirection: direction,
        },
      ]}
    >
      {strings.home.subtitle}
    </Text>
  );
}

export default function HomeScreen() {
  const { user, token } = useAuth();
  const {
    colors,
    resolvedScheme,
    strings,
    isRTL,
    textAlign,
    direction,
    rowDirection,
    reverseRowDirection,
    alignStart,
  } = usePreferences();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const topBarDirection = isRTL ? reverseRowDirection : rowDirection;
  const avatarUri = resolveMediaUrl(user?.avatarUrl);
  const { data: notificationSummary } = useQuery({
    queryKey: [...notificationsQueryKey, "summary", token],
    queryFn: () => fetchNotificationSummary(token),
    enabled: Boolean(user && token),
    refetchInterval: 30000,
  });
  const unreadNotificationsCount = user ? notificationSummary?.unreadCount ?? 0 : 0;
  const unreadNotificationsLabel =
    unreadNotificationsCount > 99 ? "99+" : toEnglishDigits(String(unreadNotificationsCount));

  const {
    data: years = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<AcademicYear[]>({
    queryKey: ["soft-launch", "academic-years"],
    queryFn: () => apiFetch("/api/academic/years"),
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65 }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F7FAFF", "#F3F0FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 118,
        }}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.topBar, { flexDirection: topBarDirection, direction }]}>
            <Pressable
              onPress={() => router.push("/(tabs)/notifications")}
              style={({ pressed }) => [
                styles.notificationButton,
                {
                  backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                  borderColor: colors.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={strings.tabs.notifications}
            >
              <Feather name="bell" size={21} color={COLORS.primary} />
              {unreadNotificationsCount > 0 ? (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{unreadNotificationsLabel}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push(user ? "/(tabs)/settings/account" : "/login")}
              style={({ pressed }) => [
                styles.accountPill,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  flexDirection: rowDirection,
                  direction,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <View style={styles.accountAvatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.accountAvatarImage} contentFit="cover" />
                ) : (
                  <Text style={styles.accountInitial}>{user?.name?.charAt(0) ?? strings.settings.accountInitial}</Text>
                )}
              </View>
              <Text
                style={[styles.accountText, { color: colors.text, textAlign, writingDirection: direction }]}
                numberOfLines={2}
              >
                {user ? toEnglishDigits(compactDisplayName(user.name)) : strings.home.loginShort}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border, direction }]}>
            <LinearGradient
              colors={["rgba(29,78,216,0.12)", "rgba(14,165,233,0.05)", "rgba(255,255,255,0)"]}
              start={{ x: isRTL ? 1 : 0, y: 0 }}
              end={{ x: isRTL ? 0 : 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={[styles.heroBadge, { alignSelf: alignStart, flexDirection: rowDirection, direction }]}>
              <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
              <Text style={[styles.heroBadgeText, { writingDirection: direction }]}>{strings.home.badge}</Text>
            </View>

            <Text style={[styles.heroTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.home.welcomePrefix} <Text style={styles.heroTitleAccent}>{strings.common.appName}</Text>
            </Text>
            <HomeSubtitle />

            <View style={styles.heroActions}>
              <Pressable
                onPress={() => router.push("/(tabs)/videos")}
                style={({ pressed }) => [
                  styles.primaryCta,
                  {
                    alignSelf: alignStart,
                    flexDirection: rowDirection,
                    direction,
                    opacity: pressed ? 0.86 : 1,
                  },
                ]}
              >
                <Text style={[styles.primaryCtaText, { writingDirection: direction }]}>
                  {strings.home.browseLessons}
                </Text>
                <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={17} color="#fff" />
              </Pressable>

              <View
                style={[
                  styles.statCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: rowDirection, direction },
                ]}
              >
                <View style={styles.statIcon}>
                  <Feather name="video" size={21} color={COLORS.primary} />
                </View>
                <View style={[styles.statTextBlock, { alignItems: alignStart, direction }]}>
                  <Text style={[styles.statValue, { color: colors.text, textAlign, writingDirection: direction }]}>
                    {isLoading ? "..." : formatNumber(years.length)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                    {strings.home.availableLessons}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.sectionHeader, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.sectionTitleBlock, { alignItems: alignStart }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                {strings.home.continueLearning}
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.home.sectionSubtitle}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/(tabs)/videos")}
              style={({ pressed }) => [
                styles.softButton,
                {
                  borderColor: COLORS.primary + "35",
                  backgroundColor: pressed ? COLORS.primary + "14" : "rgba(255,255,255,0.58)",
                  flexDirection: rowDirection,
                  direction,
                },
              ]}
            >
              <Text style={[styles.softButtonText, { writingDirection: direction }]}>
                {strings.home.available}
              </Text>
              <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={15} color={COLORS.primary} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{strings.home.loadingPaths}</Text>
            </View>
          ) : null}

          {!isLoading && isError ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{strings.home.loadErrorTitle}</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {strings.home.loadErrorText}
              </Text>
              <Pressable
                onPress={() => void refetch()}
                disabled={isFetching}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>
                  {isFetching ? strings.common.retrying : strings.common.retry}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading && !isError && years.length === 0 ? <EmptyLessonsState /> : null}

          {!isLoading && !isError && years.length > 0 ? (
            <View style={styles.pathsList}>
              {years.map((year, index) => (
                <LearningPathCard key={year.id} year={year} index={index} />
              ))}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 18 },
  topBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  notificationBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: "#fff",
  },
  notificationBadgeText: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 2,
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    textAlign: "center",
    color: "#fff",
  },
  accountPill: {
    minHeight: 46,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  accountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    maxWidth: 122,
    textAlign: "right",
  },
  accountAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    overflow: "hidden",
  },
  accountAvatarImage: {
    width: "100%",
    height: "100%",
  },
  accountInitial: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  hero: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    overflow: "hidden",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
  },
  heroBadge: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.primary + "10",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 6,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: COLORS.primary,
  },
  heroTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 31,
    lineHeight: 54,
    paddingTop: 5,
    paddingBottom: 2,
    textAlign: "right",
    writingDirection: "rtl",
    includeFontPadding: true,
  },
  heroTitleAccent: { color: COLORS.primary },
  heroSubtitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    lineHeight: 26,
    textAlign: "right",
    writingDirection: "rtl",
  },
  heroSubtitleBlock: {
    alignSelf: "stretch",
    alignItems: "flex-start",
    marginTop: 10,
    width: "100%",
  },
  heroActions: { gap: 14, marginTop: 20 },
  primaryCta: {
    minHeight: 52,
    alignSelf: "flex-end",
    borderRadius: 18,
    paddingHorizontal: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  primaryCtaText: {
    fontFamily: "Cairo_700Bold",
    color: "#fff",
    fontSize: 15,
  },
  statCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    minHeight: 112,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 14,
  },
  statTextBlock: { flexShrink: 1, minWidth: 0, transform: [{ translateY: 7 }] },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  statLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
  },
  statValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 34,
    lineHeight: 48,
    marginBottom: -8,
    textAlign: "right",
    transform: [{ translateY: 4 }],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  sectionTitleBlock: { flex: 1, alignItems: "flex-end" },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    textAlign: "right",
  },
  sectionSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 21,
    textAlign: "right",
  },
  softButton: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  softButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: COLORS.primary,
  },
  loadingCard: { paddingVertical: 26, alignItems: "center", gap: 10 },
  loadingText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
  },
  pathsList: { gap: 14 },
  pathCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    minHeight: 132,
    justifyContent: "center",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
  },
  pathMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 14,
    minHeight: 78,
    paddingBottom: 12,
  },
  pathIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pathBody: { flexShrink: 1, maxWidth: "72%", alignItems: "flex-end" },
  pathTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    lineHeight: 25,
    textAlign: "right",
  },
  pathDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 3,
  },
  pathAction: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    position: "absolute",
    bottom: 16,
  },
  pathActionText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: COLORS.primary,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
});
