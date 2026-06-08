import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
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
import { FONT } from "@/constants/typography";
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
  const { colors, strings, isRTL, textAlign, direction, rowDirection } = usePreferences();
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
        <View style={[styles.pathBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
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
  const { colors, strings, direction, textAlign } = usePreferences();

  return (
    <Text
      style={[
        styles.heroSubtitle,
        {
          color: colors.textSecondary,
          marginTop: 10,
          textAlign,
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
  const headerOverlayHeight = insets.top + 86;
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
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F7FAFF", "#F3F0FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topBar, { height: headerOverlayHeight, paddingTop: insets.top + 18 }]}>
        <BlurView
          intensity={resolvedScheme === "dark" ? 62 : 92}
          tint={resolvedScheme === "dark" ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: resolvedScheme === "dark"
                ? "rgba(0,0,0,0.92)"
                : "rgba(248,251,255,0.92)",
            },
          ]}
        />
        <View style={[styles.topBarContent, { flexDirection: topBarDirection, direction }]}>
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
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingBottom: insets.bottom + 118,
        }}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border, direction }]}>
            <LinearGradient
              colors={["rgba(29,78,216,0.12)", "rgba(14,165,233,0.05)", "rgba(255,255,255,0)"]}
              start={{ x: isRTL ? 1 : 0, y: 0 }}
              end={{ x: isRTL ? 0 : 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={[styles.heroBadge, { alignSelf: alignStart, flexDirection: rowDirection, direction }]}>
              <Ionicons name="sparkles-outline" size={18} color={COLORS.primary} />
              <Text style={[styles.heroBadgeText, { writingDirection: direction }]}>{strings.home.badge}</Text>
            </View>

            {/* direction:"ltr" wrapper so physical textAlign isn't swapped inside the RTL hero */}
            <View style={styles.heroTextBlock}>
              <Text style={[styles.heroTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                {strings.home.welcomePrefix} <Text style={styles.heroTitleAccent}>{strings.common.appName}</Text>
              </Text>
              <HomeSubtitle />
            </View>

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
                <View style={[styles.statIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
                  <Feather name="video" size={21} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
                </View>
                <View style={[styles.statTextBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
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
            {/* direction:"ltr" + physical align so multi-line Arabic text isn't swapped to the left */}
            <View style={[styles.sectionTitleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
              <Text style={[styles.sectionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                {strings.home.continueLearning}
              </Text>
              <Text
                style={[styles.sectionSubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
                numberOfLines={2}
              >
                {strings.home.sectionSubtitle}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/(tabs)/videos")}
              style={({ pressed }) => [
                styles.softButton,
                {
                  borderColor: COLORS.primary + "35",
                  backgroundColor: resolvedScheme === "dark"
                    ? pressed ? "#EEF4FF" : "#FFFFFF"
                    : pressed ? COLORS.primary + "14" : "rgba(255,255,255,0.58)",
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  topBarContent: {
    zIndex: 1,
    width: "100%",
    flex: 1,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
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
    top: 0,
    ...FONT.bold,
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
    ...FONT.bold,
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
    ...FONT.bold,
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
    paddingHorizontal: 17,
    paddingVertical: 10,
    marginBottom: 14,
  },
  heroBadgeText: {
    ...FONT.bold,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.primary,
  },
  heroTextBlock: { direction: "ltr", width: "100%", alignSelf: "stretch" },
  heroTitle: {
    ...FONT.bold,
    fontSize: 34,
    lineHeight: 58,
    paddingTop: 5,
    paddingBottom: 2,
    alignSelf: "stretch",
    width: "100%",
    includeFontPadding: true,
  },
  heroTitleAccent: { color: COLORS.primary },
  heroSubtitle: {
    ...FONT.semiBold,
    fontSize: 15,
    lineHeight: 30,
    alignSelf: "stretch",
    width: "100%",
    includeFontPadding: false,
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
    ...FONT.bold,
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
  statTextBlock: { flexShrink: 1, minWidth: 0 },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  statLabel: {
    ...FONT.semiBold,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
  },
  statValue: {
    ...FONT.bold,
    fontSize: 34,
    lineHeight: 48,
    marginBottom: -8,
    textAlign: "right",
    transform: [{ translateY: 4 }],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  sectionTitleBlock: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  sectionTitle: {
    ...FONT.bold,
    fontSize: 24,
    lineHeight: 34,
    textAlign: "right",
  },
  sectionSubtitle: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 25,
    textAlign: "right",
    includeFontPadding: false,
  },
  softButton: {
    minHeight: 40,
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  softButtonText: {
    ...FONT.bold,
    fontSize: 12,
    color: COLORS.primary,
  },
  loadingCard: { paddingVertical: 26, alignItems: "center", gap: 10 },
  loadingText: {
    ...FONT.regular,
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
    ...FONT.bold,
    fontSize: 19,
    lineHeight: 28,
    textAlign: "right",
  },
  pathDesc: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
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
    ...FONT.bold,
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
    ...FONT.bold,
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    ...FONT.regular,
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
    ...FONT.bold,
    fontSize: 13,
    color: "#fff",
  },
});
