import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AcademicVideoPlayer, AcademicVideoSegment } from "@/components/AcademicVideoPlayer";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { normalizeAcademicUnitLabel } from "@/lib/academicUnitLabels";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";

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
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
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
    unitLabel,
    seekSeconds,
    resumeFromNotification,
    notificationId,
  } = useLocalSearchParams<{
    lessonId: string;
    lessonTitle: string;
    yearId?: string;
    yearName?: string;
    subjectId?: string;
    subjectName?: string;
    unitId?: string;
    unitName?: string;
    unitLabel?: string;
    seekSeconds?: string;
    resumeFromNotification?: string;
    notificationId?: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: localizeAcademicText(String(lessonTitle ?? strings.academic.lesson), language) });
  }, [language, lessonTitle, navigation, strings.academic.lesson]);

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
    `&unitId=${unitId ?? ""}&unitName=${encode(String(unitName ?? ""))}` +
    `&unitLabel=${encode(normalizeAcademicUnitLabel(unitLabel))}`;

  const subscribePath =
    `${academicRoute(routeBase, "subscribe")}?yearId=${yearId ?? ""}&yearName=${encode(String(yearName ?? ""))}` +
    `&subjectId=${subjectId ?? ""}&subjectName=${encode(String(subjectName ?? ""))}`;
  const summaryThumbnailUrl = resolveMediaUrl(lesson?.video?.thumbnailUrl ?? lesson?.video?.posterUrl);
  const initialSeekSeconds = Math.max(0, Math.floor(Number(seekSeconds) || 0));
  const shouldAutoResume = resumeFromNotification === "1" && initialSeekSeconds > 0;
  const headerOverlayHeight = insets.top + 126;

  const reportLessonProgress = useCallback(
    (progress: { currentTime: number; duration: number }) => {
      if (!token || !lesson?.id) return;
      void apiFetch(`/api/academic/lessons/${lesson.id}/progress`, {
        method: "POST",
        token,
        body: JSON.stringify({
          currentSeconds: progress.currentTime,
          durationSeconds: progress.duration,
        }),
      }).catch(() => undefined);
    },
    [lesson?.id, token],
  );

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
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topBar, { height: headerOverlayHeight, paddingTop: insets.top + 12 }]}>
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
        <View style={[styles.topBarContent, { paddingHorizontal: HORIZONTAL_PADDING }]}>
          <View style={styles.backCornerRow}>
            <Pressable
              onPress={backToLessonsList}
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
              <Text style={[styles.backText, { color: colors.text, writingDirection: direction }]}>
                {strings.academic.lessons}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.titleBlock, { alignItems: alignStart }]}>
            <Text style={[styles.lessonTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
              {localizeAcademicText(lesson?.title ?? String(lessonTitle ?? strings.academic.lesson), language)}
            </Text>
            <Text style={[styles.lessonDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
              {lesson?.description ? localizeAcademicText(lesson.description, language) : strings.academic.chooseLesson}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 118,
          gap: 16,
        }}
      >
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
            {lesson.video ? (
              <>
                <View
                  style={[
                    styles.videoSummary,
                    { backgroundColor: colors.card, borderColor: colors.border, flexDirection: rowDirection, direction },
                  ]}
                >
                  {summaryThumbnailUrl ? (
                    <Image source={{ uri: summaryThumbnailUrl }} style={styles.summaryThumb} contentFit="cover" />
                  ) : (
                    <View style={styles.summaryThumbFallback}>
                      <Feather name="play" size={22} color={COLORS.primary} />
                    </View>
                  )}
                  <View style={[styles.summaryText, { alignItems: alignStart }]}>
                    <Text style={[styles.summaryTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                      {localizeAcademicText(lesson.video.title, language)}
                    </Text>
                    <Text style={[styles.summaryMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {localizeAcademicText(lesson.video.instructor, language)} · {formatVideoDuration(lesson.video.duration)}
                    </Text>
                    {user ? (
                      <Text style={[styles.watermarkHint, { color: colors.textTertiary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                        {localizeAcademicText(user.name, language)} - {toEnglishDigits(user.email)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.summaryPlay}>
                    <Feather name="play" size={18} color="#fff" />
                  </View>
                </View>

                <AcademicVideoPlayer
                  key={`${lesson.id}:${initialSeekSeconds}:${resumeFromNotification ?? ""}:${notificationId ?? ""}`}
                  videoUrl={lesson.video.videoUrl}
                  videoType={lesson.video.videoType}
                  title={localizeAcademicText(lesson.video.title, language)}
                  subtitle={localizeAcademicText(lesson.video.instructor || "", language)}
                  posterUrl={lesson.video.posterUrl ?? null}
                  thumbnailUrl={lesson.video.thumbnailUrl ?? null}
                  segments={lesson.video.segments ?? []}
                  watermarkText={user ? `${localizeAcademicText(user.name, language)} - ${toEnglishDigits(user.email)}` : undefined}
                  initialSeekSeconds={initialSeekSeconds}
                  autoPlayOnLoad={shouldAutoResume}
                  onProgressUpdate={reportLessonProgress}
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
    gap: 6,
    paddingBottom: 10,
  },
  backCornerRow: {
    width: "100%",
    alignItems: "flex-start",
    direction: "ltr",
  },
  backButton: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
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
  titleBlock: { flex: 1, alignItems: "flex-end", gap: 2 },
  lessonTitle: {
    ...FONT.bold,
    fontSize: 28,
    lineHeight: 40,
    textAlign: "right",
  },
  lessonDesc: {
    ...FONT.regular,
    fontSize: 16,
    lineHeight: 26,
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
    ...FONT.bold,
    fontSize: 14,
    textAlign: "right",
  },
  summaryMeta: {
    ...FONT.regular,
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  watermarkHint: {
    ...FONT.regular,
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
  primaryButton: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    ...FONT.bold,
    fontSize: 13,
    color: "#fff",
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  secondaryText: {
    ...FONT.bold,
    fontSize: 12,
    color: COLORS.primary,
  },
});
