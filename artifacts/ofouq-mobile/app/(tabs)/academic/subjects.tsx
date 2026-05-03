import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { toEnglishDigits } from "@/lib/format";

type AccessStatus = "none" | "pending" | "approved" | "rejected";

interface Subject {
  id: number;
  name: string;
  icon?: string | null;
  description?: string | null;
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

function SubjectCard({
  item,
  yearId,
  yearName,
  routeBase,
  openSubscribe,
}: {
  item: Subject;
  yearId: string;
  yearName: string;
  routeBase: ReturnType<typeof getAcademicRouteBase>;
  openSubscribe: (subject?: Subject) => void;
}) {
  const { colors, strings, isRTL, textAlign, direction, rowDirection } = usePreferences();
  const { token } = useAuth();
  const scale = useRef(new Animated.Value(1)).current;
  const subjectIcon = item.icon || "📚";
  const status: AccessStatus = !token
    ? "none"
    : item.accessStatus ?? (item.isLocked ? "none" : "approved");
  const isLocked = !token || item.isLocked || status === "pending" || status === "rejected" || status === "none";
  const badge = accessColors(status);

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
      (`${academicRoute(routeBase, "units")}?yearId=${yearId}&yearName=${encode(yearName)}` +
        `&subjectId=${item.id}&subjectName=${encode(item.name)}&subjectIcon=${encode(subjectIcon)}`) as any,
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
            backgroundColor: isLocked ? "rgba(255,251,235,0.82)" : colors.card,
            borderColor: isLocked ? "#FCD34D66" : colors.border,
            flexDirection: rowDirection,
            direction,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.subjectLeading, { flexDirection: rowDirection, direction }]}>
          <View style={[styles.subjectIconBox, { backgroundColor: isLocked ? "#F1F5F9" : COLORS.primary + "10" }]}>
            <Text style={styles.subjectEmoji}>{subjectIcon}</Text>
          </View>

          <View style={styles.subjectBody}>
            <Text
              style={[styles.subjectTitle, { color: colors.text, textAlign, writingDirection: direction }]}
              numberOfLines={1}
            >
              {toEnglishDigits(item.name)}
            </Text>
            {item.description ? (
              <Text
                style={[styles.subjectDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
                numberOfLines={1}
              >
                {toEnglishDigits(item.description)}
              </Text>
            ) : null}
            {status === "rejected" && item.latestRequest?.reviewNotes ? (
              <Text style={[styles.reviewNote, { textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.academic.reviewNote} {toEnglishDigits(item.latestRequest.reviewNotes)}
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
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { yearId, yearName } = useLocalSearchParams<{ yearId: string; yearName: string }>();
  const title = String(yearName ?? strings.academic.subjects);
  const displayTitle = toEnglishDigits(title);

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
    enabled: !!yearId,
  });

  function openSubscribe(subject?: Subject) {
    if (!token) {
      router.push("/login");
      return;
    }

    const subjectQuery = subject
      ? `&subjectId=${subject.id}&subjectName=${encode(subject.name)}`
      : "";
    router.push(
      (`${academicRoute(routeBase, "subscribe")}?yearId=${yearId}&yearName=${encode(title)}${subjectQuery}`) as any,
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
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <FlatList
        data={subjects}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 13,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.backCornerRow}>
              <Pressable
                onPress={backToYears}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.backButton,
                  {
                    opacity: pressed ? 0.62 : 1,
                  },
                ]}
              >
                <Feather name="arrow-left" size={15} color={colors.textSecondary} />
                <Text style={[styles.backText, { color: colors.textSecondary, writingDirection: direction }]}>
                  {strings.academic.years}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
              <View style={styles.titleIcon}>
                <Feather name="book-open" size={23} color={COLORS.primary} />
              </View>
              <View style={[styles.titleBlock, { alignItems: alignStart }]}>
                <Text
                  style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}
                  numberOfLines={1}
                >
                  {displayTitle}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.academic.chooseSubject}
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <SubjectCard
            item={item}
            yearId={String(yearId ?? "")}
            yearName={title}
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
            flexDirection: isRTL ? "row-reverse" : "row",
            direction,
            opacity: pressed ? 0.86 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View style={styles.subscribePlusCircle}>
          <Feather name="plus" size={30} color="#fff" strokeWidth={3.4} />
        </View>
        <Text style={[styles.subscribeTopText, { writingDirection: direction }]}>
          {strings.academic.subscribeNewSubject}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 12, paddingBottom: 4 },
  backCornerRow: {
    width: "100%",
    alignItems: "flex-start",
    direction: "ltr",
  },
  backButton: {
    minHeight: 32,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    direction: "ltr",
  },
  backText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
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
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: { flex: 1, alignItems: "flex-end" },
  title: {
    flexShrink: 1,
    fontFamily: "Cairo_700Bold",
    fontSize: 25,
    lineHeight: 36,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
  },
  subscribeFloatingButton: {
    position: "absolute",
    left: 18,
    zIndex: 30,
    minHeight: 62,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.primary + "45",
    backgroundColor: "rgba(248,251,255,0.96)",
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "right",
    maxWidth: "100%",
  },
  subjectDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },
  reviewNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#BE123C",
    marginTop: 4,
    textAlign: "right",
  },
  lockAction: {
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    textAlign: "center",
  },
  stateText: {
    fontFamily: "Cairo_400Regular",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
});
