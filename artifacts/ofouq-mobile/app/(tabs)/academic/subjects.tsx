import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { toEnglishDigits } from "@/lib/format";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AutoFitTitle } from "@/components/AutoFitTitle";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { normalizeAcademicUnitLabel } from "@/lib/academicUnitLabels";

type AccessStatus = "none" | "pending" | "approved" | "rejected";

interface Subject {
  id: number;
  name: string;
  nameEn?: string | null;
  icon?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  unitLabel?: string | null;
  accessStatus?: AccessStatus;
  isLocked?: boolean;
  canRequestSubscription?: boolean;
  latestRequest?: {
    id: number;
    status: AccessStatus;
    reviewNotes?: string | null;
  } | null;
}

function accessColors(status: AccessStatus) {
  if (status === "approved") return { bg: "#DCFCE7", text: "#047857" };
  if (status === "pending") return { bg: "#FEF3C7", text: "#B45309" };
  if (status === "rejected") return { bg: "#FFE4E6", text: "#BE123C" };
  return { bg: "#E2E8F0", text: "#475569" };
}

function encode(value: string | undefined) {
  return encodeURIComponent(value ?? "");
}

// v2 Phase 2 — the student's auto-computed level in a subject (from first-attempt,
// difficulty-weighted correctness). "unrated" → no badge yet.
function levelBadge(level: string, en: boolean): { label: string; bg: string } | null {
  if (level === "advanced") return { label: en ? "Advanced" : "متقدّم", bg: "#059669" };
  if (level === "intermediate") return { label: en ? "Intermediate" : "متوسط", bg: "#2563EB" };
  if (level === "beginner") return { label: en ? "Beginner" : "مبتدئ", bg: "#D97706" };
  return null;
}

function SubjectCard({
  item,
  yearId,
  yearName,
  yearNameEn,
  routeBase,
  openSubscribe,
}: {
  item: Subject;
  yearId: string;
  yearName: string;
  yearNameEn: string;
  routeBase: ReturnType<typeof getAcademicRouteBase>;
  openSubscribe: (subject?: Subject) => void;
}) {
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, rowDirection } = usePreferences();
  const { token } = useAuth();
  // Shared across all subject cards (same queryKey → one request via React Query dedup).
  const { data: levelData } = useQuery<{ levels: Array<{ subjectId: number; level: string; percent: number }> }>({
    queryKey: ["subject-levels"],
    queryFn: () => apiFetch(`/api/me/subject-levels`, { token }),
    enabled: !!token,
    staleTime: 60_000,
  });
  const myLevel = levelData?.levels?.find((l) => l.subjectId === item.id) ?? null;
  const lvlBadge = myLevel ? levelBadge(myLevel.level, language === "en") : null;
  const scale = useRef(new Animated.Value(1)).current;
  const subjectIcon = item.icon || "📚";
  const status: AccessStatus = !token
    ? "none"
    : item.accessStatus ?? (item.isLocked ? "none" : "approved");
  const isLocked = !token || item.isLocked || status === "pending" || status === "rejected" || status === "none";
  const badge = accessColors(status);
  const isDark = resolvedScheme === "dark";
  const subjectCardBackground = isLocked && !isDark ? "rgba(255,251,235,0.82)" : colors.card;
  const subjectCardBorder = isLocked ? (isDark ? "rgba(252,211,77,0.34)" : "#FCD34D66") : colors.border;
  const subjectIconBackground = isDark
    ? isLocked ? colors.surfaceSecondary : COLORS.darkIconFrame.background
    : isLocked ? "#F1F5F9" : COLORS.primary + "10";
  const subjectIconBorder = isDark
    ? isLocked ? colors.border : COLORS.darkIconFrame.border
    : isLocked ? "#E2E8F0" : COLORS.primary + "18";

  function accessLabel() {
    if (status === "approved") return strings.academic.subscribed;
    if (status === "pending") return strings.academic.pending;
    if (status === "rejected") return strings.academic.rejected;
    return strings.academic.notSubscribed;
  }

  function animatePress(toValue: number) {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 3,
    }).start();
  }

  function handleOpen() {
    if (isLocked) {
      openSubscribe(item);
      return;
    }

    router.push(
      (`${academicRoute(routeBase, "units")}?yearId=${yearId}&yearName=${encode(yearName)}&yearNameEn=${encode(yearNameEn)}` +
        `&subjectId=${item.id}&subjectName=${encode(item.name)}&subjectNameEn=${encode(item.nameEn ?? "")}&subjectIcon=${encode(subjectIcon)}` +
        `&unitLabel=${encode(normalizeAcademicUnitLabel(item.unitLabel))}`) as any,
    );
  }

  return (
    <Pressable
      onPress={handleOpen}
      onPressIn={() => animatePress(0.985)}
      onPressOut={() => animatePress(1)}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.subjectCard,
          {
            backgroundColor: subjectCardBackground,
            borderColor: subjectCardBorder,
            flexDirection: rowDirection,
            direction,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.subjectLeading, { flexDirection: rowDirection, direction }]}>
          <View
            style={[
              styles.subjectIconBox,
              {
                backgroundColor: subjectIconBackground,
                borderColor: subjectIconBorder,
              },
            ]}
          >
            <Text style={styles.subjectEmoji}>{subjectIcon}</Text>
          </View>

          <View style={styles.subjectBody}>
            <Text
              style={[styles.subjectTitle, { color: colors.text, textAlign, writingDirection: direction }]}
              numberOfLines={1}
            >
              {localizeAcademicText(item.name, language, item.nameEn)}
            </Text>
            {item.description ? (
              <Text
                style={[styles.subjectDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
                numberOfLines={1}
              >
                {localizeAcademicText(item.description, language, item.descriptionEn)}
              </Text>
            ) : null}
            {!isLocked && lvlBadge && myLevel ? (
              <View style={{ flexDirection: rowDirection, marginTop: 5 }}>
                <View style={{ backgroundColor: lvlBadge.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ ...FONT.bold, fontSize: 10.5, color: "#fff" }}>
                    {language === "en" ? "Level: " : "مستواك: "}
                    {lvlBadge.label} · {toEnglishDigits(String(myLevel.percent))}٪
                  </Text>
                </View>
              </View>
            ) : null}
            {status === "rejected" && item.latestRequest?.reviewNotes ? (
              <Text style={[styles.reviewNote, { textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.academic.reviewNote} {localizeAcademicText(item.latestRequest.reviewNotes, language)}
              </Text>
            ) : null}
            {isLocked ? (
              <Text style={[styles.lockAction, { textAlign, writingDirection: direction }]} numberOfLines={1}>
                {!token
                  ? strings.academic.signInToContinue
                  : status === "pending"
                  ? strings.academic.followRequest
                  : strings.academic.requestSubscription}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.subjectTrailing, { flexDirection: rowDirection, direction }]}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.text }]}>{accessLabel()}</Text>
          </View>
          {isLocked ? (
            <Feather name="lock" size={18} color="#B45309" />
          ) : (
            <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.textTertiary} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function SubjectsScreen() {
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { yearId, yearName, yearNameEn } = useLocalSearchParams<{ yearId: string; yearName: string; yearNameEn?: string }>();
  const title = String(yearName ?? strings.academic.subjects);
  const displayTitle = localizeAcademicText(title, language, yearNameEn ? String(yearNameEn) : undefined);
  // Measured so the header grows for a 2-line title instead of clipping it.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 96);

  useEffect(() => {
    navigation.setOptions({ title: displayTitle });
  }, [displayTitle, navigation]);

  const {
    data: subjects = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId, token],
    queryFn: () => apiFetch(`/api/academic/years/${yearId}/subjects`, { token }),
    // review F-16: token is part of the queryKey, so also gate on it to avoid an
    // initial paywalled fetch firing with a null token on cold start.
    enabled: !!yearId && !!token,
  });

  // Refresh on return so newly added subjects (or access changes) appear live.
  useRefetchOnFocus(refetch);

  function openSubscribe(subject?: Subject) {
    if (!token) {
      router.push("/login");
      return;
    }

    const subjectQuery = subject
      ? `&subjectId=${subject.id}&subjectName=${encode(subject.name)}&subjectNameEn=${encode(subject.nameEn ?? "")}`
      : "";
    router.push(
      (`${academicRoute(routeBase, "subscribe")}?yearId=${yearId}&yearName=${encode(title)}&yearNameEn=${encode(String(yearNameEn ?? ""))}${subjectQuery}`) as any,
    );
  }

  function backToYears() {
    const stackNavigation = navigation as {
      dispatch?: (action: { type: string; target?: string }) => void;
      getState?: () => { index?: number; key?: string };
    };
    const stackState = stackNavigation.getState?.();

    if ((stackState?.index ?? 0) > 0) {
      stackNavigation.dispatch?.({ type: "POP_TO_TOP", target: stackState?.key });
      return;
    }

    router.replace(routeBase as any);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[styles.topBar, { paddingTop: insets.top + 12 }]}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setHeaderHeight((current) => (Math.abs(current - next) < 0.5 ? current : next));
        }}
      >
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
        <View style={[styles.topBarContent, { paddingHorizontal: 18 }]}>
          {/* One compact row: back button on the physical LEFT, title + its icon on the RIGHT. */}
          <View style={{ direction: "ltr", flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              onPress={backToYears}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="arrow-left" size={20} color={colors.textSecondary} />
            </Pressable>
            <View style={[styles.titleRow, { flex: 1, flexDirection: rowDirection, direction }]}>
              <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
                <Feather name="book-open" size={23} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
              </View>
              <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <AutoFitTitle
                  style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}
                  maxFontSize={21}
                  minFontSize={16}
                  maxLines={2}
                >
                  {displayTitle}
                </AutoFitTitle>
                <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.academic.chooseSubject}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: headerHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 13,
          flexGrow: 1,
        }}
        renderItem={({ item }) => (
          <SubjectCard
            item={item}
            yearId={String(yearId ?? "")}
            yearName={title}
            yearNameEn={String(yearNameEn ?? "")}
            routeBase={routeBase}
            openSubscribe={openSubscribe}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isLoading ? (
              <>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.common.loading}</Text>
              </>
            ) : isError ? (
              <>
                <Feather name="alert-circle" size={32} color={COLORS.error} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.loadSubjectsError}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {error instanceof Error ? error.message : strings.common.unexpectedError}
                </Text>
                <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.retryButton}>
                  <Text style={styles.retryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="book-outline" size={42} color={colors.textTertiary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.noSubjects}</Text>
              </>
            )}
          </View>
        }
      />

      <Pressable
        onPress={() => openSubscribe()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.subscribeFloatingButton,
          {
            bottom: insets.bottom + 104,
            backgroundColor: resolvedScheme === "dark"
              ? pressed ? "rgba(37,99,235,0.22)" : colors.card
              : "rgba(248,251,255,0.96)",
            borderColor: resolvedScheme === "dark" ? COLORS.darkIconFrame.border : COLORS.primary + "45",
            flexDirection: isRTL ? "row-reverse" : "row",
            direction,
            opacity: pressed ? 0.86 : 1,
            shadowColor: resolvedScheme === "dark" ? COLORS.primary : "#1D4ED8",
            shadowOpacity: resolvedScheme === "dark" ? 0.32 : 0.18,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View
          style={[
            styles.subscribePlusCircle,
            resolvedScheme === "dark" && {
              backgroundColor: COLORS.darkIconFrame.foreground,
            },
          ]}
        >
          <Feather name="plus" size={30} color="#fff" strokeWidth={3.4} />
        </View>
        <Text
          style={[
            styles.subscribeTopText,
            {
              color: resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary,
              writingDirection: direction,
            },
          ]}
        >
          {strings.academic.subscribeNewSubject}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    gap: 6,
    paddingBottom: 10,
  },
  header: { gap: 12, paddingBottom: 4 },
  backCornerRow: {
    width: "100%",
    alignItems: "flex-start",
    direction: "ltr",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    direction: "ltr",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  backText: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 24,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
  },
  titleIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: { flex: 1, alignItems: "flex-end" },
  title: {
    flexShrink: 1,
    ...FONT.bold,
    fontSize: 21,
    lineHeight: 30,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "right",
  },
  subscribeFloatingButton: {
    position: "absolute",
    left: 18,
    zIndex: 30,
    minHeight: 62,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  subscribePlusCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  subscribeTopText: {
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.primary,
  },
  subjectCard: {
    minHeight: 116,
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 13,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  subjectLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 13,
  },
  subjectIconBox: {
    width: 56,
    height: 56,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subjectEmoji: { fontSize: 28 },
  subjectBody: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "72%",
    alignItems: "flex-start",
  },
  subjectTrailing: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    flexShrink: 0,
  },
  subjectTitle: {
    ...FONT.bold,
    fontSize: 19,
    lineHeight: 28,
    textAlign: "right",
    maxWidth: "100%",
  },
  subjectDesc: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    ...FONT.bold,
    fontSize: 10,
  },
  reviewNote: {
    ...FONT.regular,
    fontSize: 11,
    color: "#BE123C",
    marginTop: 4,
    textAlign: "right",
  },
  lockAction: {
    ...FONT.bold,
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 6,
    textAlign: "right",
  },
  stateCard: {
    marginTop: 44,
    borderRadius: 24,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  stateTitle: {
    ...FONT.bold,
    fontSize: 16,
    textAlign: "center",
  },
  stateText: {
    ...FONT.regular,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
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
