import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AcademicVideoPlayer, AcademicVideoSegment } from "@/components/AcademicVideoPlayer";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { toEnglishDigits } from "@/lib/format";

const HORIZONTAL_PADDING = 18;

interface Lesson {
  id: number;
  title: string;
  description?: string | null;
  video?: {
    id: number;
    title: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    posterUrl?: string | null;
    duration: number;
    instructor: string;
    videoType: "youtube" | "upload";
    segments?: AcademicVideoSegment[] | null;
  } | null;
}

function encode(value: string | undefined) {
  return encodeURIComponent(value ?? "");
}

function formatVideoDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default function LessonDetailScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const {
    lessonId,
    lessonTitle,
    yearId,
    yearName,
    subjectId,
    subjectName,
    unitId,
    unitName,
  } = useLocalSearchParams<{
    lessonId: string;
    lessonTitle: string;
    yearId?: string;
    yearName?: string;
    subjectId?: string;
    subjectName?: string;
    unitId?: string;
    unitName?: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: toEnglishDigits(String(lessonTitle ?? strings.academic.lesson)) });
  }, [lessonTitle, navigation, strings.academic.lesson]);

  const {
    data: lesson,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Lesson>({
    queryKey: ["academic", "lesson", lessonId, token],
    queryFn: () => apiFetch(`/api/academic/lessons/${lessonId}`, { token }),
    enabled: !!lessonId,
  });

  const backToLessons =
    `${academicRoute(routeBase, "lessons")}?yearId=${yearId ?? ""}&yearName=${encode(String(yearName ?? ""))}` +
    `&subjectId=${subjectId ?? ""}&subjectName=${encode(String(subjectName ?? ""))}` +
    `&unitId=${unitId ?? ""}&unitName=${encode(String(unitName ?? ""))}`;

  const subscribePath =
    `${academicRoute(routeBase, "subscribe")}?yearId=${yearId ?? ""}&yearName=${encode(String(yearName ?? ""))}` +
    `&subjectId=${subjectId ?? ""}&subjectName=${encode(String(subjectName ?? ""))}`;

  function backToLessonsList() {
    const stackNavigation = navigation as {
      dispatch?: (action: { type: string; payload?: { count: number }; target?: string }) => void;
      getState?: () => { index?: number; key?: string };
    };
    const stackState = stackNavigation.getState?.();

    if ((stackState?.index ?? 0) > 0) {
      stackNavigation.dispatch?.({
        type: "POP",
        payload: { count: 1 },
        target: stackState?.key,
      });
      return;
    }

    router.replace(backToLessons as any);
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 118,
          gap: 16,
        }}
      >
        <View style={styles.backCornerRow}>
          <Pressable
            onPress={backToLessonsList}
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
              {strings.academic.lessons}
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.loadingLesson}</Text>
          </View>
        ) : null}

        {isError ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={32} color="#B45309" />
            <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.loadLessonError}</Text>
            <Text style={[styles.stateText, { color: colors.textSecondary }]}>
              {error instanceof Error ? error.message : strings.academic.needsLessonSubscription}
            </Text>
            <Pressable
              onPress={() => {
                if (token) router.push(subscribePath as any);
                else router.push("/login");
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {token ? strings.academic.requestSubjectSubscription : strings.common.signIn}
              </Text>
            </Pressable>
            <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {lesson ? (
          <>
            <View style={[styles.titleBlock, { alignItems: alignStart }]}>
              <Text style={[styles.lessonTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                {toEnglishDigits(lesson.title)}
              </Text>
              {lesson.description ? (
                <Text style={[styles.lessonDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {toEnglishDigits(lesson.description)}
                </Text>
              ) : null}
            </View>

            {lesson.video ? (
              <>
                <View
                  style={[
                    styles.videoSummary,
                    { backgroundColor: colors.card, borderColor: colors.border, flexDirection: rowDirection, direction },
                  ]}
                >
                  {lesson.video.thumbnailUrl ? (
                    <Image source={{ uri: lesson.video.thumbnailUrl }} style={styles.summaryThumb} contentFit="cover" />
                  ) : (
                    <View style={styles.summaryThumbFallback}>
                      <Feather name="play" size={22} color={COLORS.primary} />
                    </View>
                  )}
                  <View style={[styles.summaryText, { alignItems: alignStart }]}>
                    <Text style={[styles.summaryTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                      {toEnglishDigits(lesson.video.title)}
                    </Text>
                    <Text style={[styles.summaryMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {toEnglishDigits(lesson.video.instructor)} · {formatVideoDuration(lesson.video.duration)}
                    </Text>
                    {user ? (
                      <Text style={[styles.watermarkHint, { color: colors.textTertiary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                        {toEnglishDigits(user.name)} - {toEnglishDigits(user.email)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.summaryPlay}>
                    <Feather name="play" size={18} color="#fff" />
                  </View>
                </View>

                <AcademicVideoPlayer
                  videoUrl={lesson.video.videoUrl}
                  videoType={lesson.video.videoType}
                  title={toEnglishDigits(lesson.video.title)}
                  subtitle={toEnglishDigits(lesson.video.instructor || "")}
                  posterUrl={lesson.video.posterUrl ?? null}
                  thumbnailUrl={lesson.video.thumbnailUrl ?? null}
                  segments={lesson.video.segments ?? []}
                  watermarkText={user ? `${toEnglishDigits(user.name)} - ${toEnglishDigits(user.email)}` : undefined}
                />
              </>
            ) : (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="play-circle-outline" size={44} color={colors.textTertiary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.noVideo}</Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  titleBlock: { alignItems: "flex-end", gap: 6 },
  lessonTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 25,
    lineHeight: 36,
    textAlign: "right",
  },
  lessonDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "right",
  },
  videoSummary: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  summaryThumb: {
    width: 82,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
  },
  summaryThumbFallback: {
    width: 82,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
  summaryText: { flex: 1, alignItems: "flex-end" },
  summaryTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  summaryMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  watermarkHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    textAlign: "right",
    marginTop: 3,
  },
  summaryPlay: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  stateCard: {
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
  primaryButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: COLORS.primary,
  },
});
