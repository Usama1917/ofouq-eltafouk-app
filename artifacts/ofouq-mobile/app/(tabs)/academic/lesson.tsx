import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AcademicVideoPlayer, AcademicVideoSegment } from "@/components/AcademicVideoPlayer";
import { LessonNotes } from "@/components/LessonNotes";
import { BookmarkStar } from "@/components/BookmarkStar";
import { AutoFitTitle } from "@/components/AutoFitTitle";
import { LessonSummaryCard } from "@/components/LessonSummaryCard";
import { LessonSegmentsCard } from "@/components/LessonSegmentsCard";
import { QuizLessonCard } from "@/components/QuizLessonCard";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { gamificationQueryKey } from "@/lib/gamification";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { normalizeAcademicUnitLabel } from "@/lib/academicUnitLabels";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import { addNote, notesQueryKey, type LessonNote } from "@/lib/engagement";

const HORIZONTAL_PADDING = 18;

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface Lesson {
  id: number;
  title: string;
  titleEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  video?: {
    id: number;
    title: string;
    titleEn?: string | null;
    description?: string | null;
    descriptionEn?: string | null;
    videoUrl: string;
    thumbnailUrl?: string | null;
    posterUrl?: string | null;
    duration: number;
    instructor: string;
    instructorEn?: string | null;
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
    lessonTitleEn,
    yearId,
    yearName,
    yearNameEn,
    subjectId,
    subjectName,
    subjectNameEn,
    unitId,
    unitName,
    unitNameEn,
    unitLabel,
    seekSeconds,
    resumeFromNotification,
    notificationId,
  } = useLocalSearchParams<{
    lessonId: string;
    lessonTitle: string;
    lessonTitleEn?: string;
    yearId?: string;
    yearName?: string;
    yearNameEn?: string;
    subjectId?: string;
    subjectName?: string;
    subjectNameEn?: string;
    unitId?: string;
    unitName?: string;
    unitNameEn?: string;
    unitLabel?: string;
    seekSeconds?: string;
    resumeFromNotification?: string;
    notificationId?: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: localizeAcademicText(String(lessonTitle ?? strings.academic.lesson), language, lessonTitleEn ? String(lessonTitleEn) : undefined) });
  }, [language, lessonTitle, lessonTitleEn, navigation, strings.academic.lesson]);

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
    // review F-16: token is part of the queryKey, so also gate on it to avoid an
    // initial paywalled fetch firing with a null token on cold start.
    enabled: !!lessonId && !!token,
  });

  const backToLessons =
    `${academicRoute(routeBase, "lessons")}?yearId=${yearId ?? ""}&yearName=${encode(String(yearName ?? ""))}&yearNameEn=${encode(String(yearNameEn ?? ""))}` +
    `&subjectId=${subjectId ?? ""}&subjectName=${encode(String(subjectName ?? ""))}&subjectNameEn=${encode(String(subjectNameEn ?? ""))}` +
    `&unitId=${unitId ?? ""}&unitName=${encode(String(unitName ?? ""))}&unitNameEn=${encode(String(unitNameEn ?? ""))}` +
    `&unitLabel=${encode(normalizeAcademicUnitLabel(unitLabel))}`;

  const subscribePath =
    `${academicRoute(routeBase, "subscribe")}?yearId=${yearId ?? ""}&yearName=${encode(String(yearName ?? ""))}&yearNameEn=${encode(String(yearNameEn ?? ""))}` +
    `&subjectId=${subjectId ?? ""}&subjectName=${encode(String(subjectName ?? ""))}&subjectNameEn=${encode(String(subjectNameEn ?? ""))}`;
  // The summary card below the player shows the SECONDARY image (posterUrl);
  // the big video thumbnail above shows the PRIMARY one (thumbnailUrl).
  const summaryThumbnailUrl = resolveMediaUrl(lesson?.video?.posterUrl ?? lesson?.video?.thumbnailUrl);
  const initialSeekSeconds = Math.max(0, Math.floor(Number(seekSeconds) || 0));
  const shouldAutoResume = resumeFromNotification === "1" && initialSeekSeconds > 0;
  // Measured so the header grows for a 2-line title instead of clipping it.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 92);

  // "+points" celebration shown once, when this lesson first crosses to completed.
  const queryClient = useQueryClient();
  const celebratedRef = useRef(false);
  const burstAnim = useRef(new Animated.Value(0)).current;
  const [showBurst, setShowBurst] = useState(false);
  // v2 Phase 4 — notes/segments: track the latest watched second (for "add note
  // here"), and a stable seek handle the player registers so tapping a note or a
  // segment jumps the SAME player instance to that second (no remount, no bug).
  const lastPositionRef = useRef(0);
  // Auto-name counter for quick "add note" taps. Seeded from the notes cache on each
  // add + kept monotonic via the ref so rapid taps become "ملاحظة 1" then "ملاحظة 2".
  const autoNoteSeqRef = useRef(0);
  const playerSeekRef = useRef<((seconds: number, autoPlay?: boolean) => void) | null>(null);
  const registerPlayerSeek = useCallback((seek: (seconds: number, autoPlay?: boolean) => void) => {
    playerSeekRef.current = seek;
  }, []);
  const seekPlayerTo = useCallback((seconds: number) => {
    playerSeekRef.current?.(seconds, true);
  }, []);

  const triggerPointsBurst = useCallback(() => {
    setShowBurst(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    burstAnim.setValue(0);
    Animated.sequence([
      Animated.spring(burstAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.delay(1100),
      Animated.timing(burstAnim, { toValue: 2, duration: 380, useNativeDriver: true }),
    ]).start(() => setShowBurst(false));
  }, [burstAnim]);

  const reportLessonProgress = useCallback(
    (progress: { currentTime: number; duration: number; watchedSeconds?: number }) => {
      lastPositionRef.current = Math.max(0, Math.floor(progress.currentTime));
      if (!token || !lesson?.id) return;
      void apiFetch<{ completed?: boolean }>(`/api/academic/lessons/${lesson.id}/progress`, {
        method: "POST",
        token,
        body: JSON.stringify({
          currentSeconds: progress.currentTime,
          durationSeconds: progress.duration,
          // Real watched coverage (seeks excluded) — powers the quiz watch-gate.
          watchedSeconds: progress.watchedSeconds ?? 0,
        }),
      })
        .then((res) => {
          // First time this lesson crosses to completed → celebrate + refresh the
          // home gamification strip so the new points/streak show on return.
          if (res?.completed && !celebratedRef.current) {
            celebratedRef.current = true;
            triggerPointsBurst();
            void queryClient.invalidateQueries({ queryKey: gamificationQueryKey });
          }
        })
        .catch(() => undefined);
    },
    [lesson?.id, token, queryClient, triggerPointsBurst],
  );

  // Reset the auto-note counter when the lesson changes (the router reuses this screen).
  useEffect(() => {
    autoNoteSeqRef.current = 0;
  }, [lesson?.id]);

  // Create a note from the in-player button. Empty title → auto "ملاحظة N" (sequential).
  const handleAddNote = useCallback(
    async (atSeconds: number, title: string) => {
      if (!token || !lesson?.id) return;
      let finalTitle = title.trim();
      if (!finalTitle) {
        const existing =
          queryClient.getQueryData<{ notes: LessonNote[] }>(notesQueryKey(lesson.id))?.notes?.length ?? 0;
        const n = Math.max(existing, autoNoteSeqRef.current) + 1;
        autoNoteSeqRef.current = n;
        finalTitle = language === "en" ? `Note ${n}` : `ملاحظة ${toEnglishDigits(String(n))}`;
      }
      // engagement's addNote stores the text in `body` (a note has no separate title field).
      await addNote(token, lesson.id, Math.max(0, Math.floor(atSeconds)), finalTitle);
      await queryClient.invalidateQueries({ queryKey: notesQueryKey(lesson.id) });
    },
    [token, lesson?.id, language, queryClient],
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

      {showBurst ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pointsBurst,
            {
              top: insets.top + 80,
              opacity: burstAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
              transform: [
                { translateY: burstAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [12, 0, -44] }) },
                { scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1], extrapolate: "clamp" }) },
              ],
            },
          ]}
        >
          <View style={styles.pointsBurstPill}>
            <Text style={styles.pointsBurstText}>
              {language === "en" ? "+10 points 🎉" : "+10 نقطة 🎉"}
            </Text>
          </View>
        </Animated.View>
      ) : null}

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
        <View style={[styles.topBarContent, { paddingHorizontal: HORIZONTAL_PADDING }]}>
          {/* One compact row: back button (LEFT) · title · bookmark star (RIGHT). */}
          <View style={{ direction: "ltr", flexDirection: "row", alignItems: "center", gap: 12 }}>
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
            </Pressable>

            <View style={[styles.titleBlock, { flex: 1, direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
              <AutoFitTitle
                style={[styles.lessonTitle, { color: colors.text, textAlign, writingDirection: direction }]}
                maxFontSize={24}
                minFontSize={17}
                maxLines={2}
              >
                {localizeAcademicText(lesson?.title ?? String(lessonTitle ?? strings.academic.lesson), language, lesson?.titleEn)}
              </AutoFitTitle>
              <Text style={[styles.lessonDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {lesson?.description ? localizeAcademicText(lesson.description, language, lesson.descriptionEn) : strings.academic.chooseLesson}
              </Text>
            </View>

            {lesson?.id && user?.role === "student" ? (
              <View style={[styles.starButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <BookmarkStar lessonId={lesson.id} size={22} />
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerHeight + 18,
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
          (() => {
            // 401 (expired/invalid session) → route to login, not the subscribe flow.
            const sessionExpired = (error as { status?: number } | undefined)?.status === 401;
            const goToLogin = sessionExpired || !token;
            return (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="lock" size={32} color="#B45309" />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.loadLessonError}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {sessionExpired
                    ? strings.academic.signInToContinue
                    : error instanceof Error
                      ? error.message
                      : strings.academic.needsLessonSubscription}
                </Text>
                <Pressable
                  onPress={() => {
                    if (goToLogin) router.push("/login");
                    else router.push(subscribePath as any);
                  }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {goToLogin ? strings.common.signIn : strings.academic.requestSubjectSubscription}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
                </Pressable>
              </View>
            );
          })()
        ) : null}

        {lesson ? (
          <>
            {lesson.video ? (
              <>
                <AcademicVideoPlayer
                  key={`${lesson.id}:${initialSeekSeconds}:${resumeFromNotification ?? ""}:${notificationId ?? ""}`}
                  videoUrl={lesson.video.videoUrl}
                  videoType={lesson.video.videoType}
                  title={localizeAcademicText(lesson.video.title, language, lesson.video.titleEn)}
                  subtitle={localizeAcademicText(lesson.video.instructor || "", language, lesson.video.instructorEn)}
                  posterUrl={lesson.video.posterUrl ?? null}
                  thumbnailUrl={lesson.video.thumbnailUrl ?? null}
                  segments={lesson.video.segments ?? []}
                  belowPlayerContent={
                    <>
                      {/* Card order (owner-specified): description → segments → notes → quiz.
                          Each of the first three collapses with the same animation; the
                          lesson quiz is always the last card. */}
                      <LessonSummaryCard
                        thumbnailUrl={summaryThumbnailUrl}
                        title={lesson.video.title}
                        titleEn={lesson.video.titleEn}
                        instructor={lesson.video.instructor}
                        instructorEn={lesson.video.instructorEn}
                        duration={lesson.video.duration}
                        description={lesson.video.description}
                        descriptionEn={lesson.video.descriptionEn}
                        segmentsCount={lesson.video.segments?.length ?? 0}
                        userName={user?.name ?? null}
                        userEmail={user?.email ?? null}
                      />
                      {/* v2 — collapsible lesson segments; tap a segment to seek. */}
                      <View style={{ marginTop: 12 }}>
                        <LessonSegmentsCard segments={lesson.video.segments} onSeek={seekPlayerTo} />
                      </View>
                      {/* v2 Phase 4 — collapsible timestamped notes; tap a note to seek. */}
                      <View style={{ marginTop: 12 }}>
                        <LessonNotes
                          lessonId={lesson.id}
                          getCurrentSeconds={() => lastPositionRef.current}
                          onSeek={seekPlayerTo}
                        />
                      </View>
                      {/* v2 Phase 2 — quiz entry card: always the LAST card.
                          Shown only in the "الدروس المرئية" (videos) tab per the owner's choice. */}
                      {routeBase === "/(tabs)/videos" ? (
                        <View style={{ marginTop: 12 }}>
                          <QuizLessonCard
                            videoId={lesson.video.id}
                            videoTitle={localizeAcademicText(lesson.video.title, language, lesson.video.titleEn)}
                          />
                        </View>
                      ) : null}
                    </>
                  }
                  watermarkText={user
                    ? `${localizeAcademicText(user.name, language).trim().split(/\s+/)[0]} · ${toEnglishDigits(user.phone || user.email)}`
                    : undefined}
                  initialSeekSeconds={initialSeekSeconds}
                  autoPlayOnLoad={shouldAutoResume}
                  registerSeek={registerPlayerSeek}
                  onAddNote={handleAddNote}
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
  pointsBurst: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  pointsBurstPill: {
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 9999,
    shadowColor: "#059669",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pointsBurstText: {
    ...FONT.bold,
    fontSize: 16,
    color: "#FFFFFF",
  },
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
  backCornerRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    direction: "ltr",
  },
  starButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    // Clip the expanding content so the open animation reads as the bottom
    // edge sliding down to reveal what's inside (a curtain unfold).
    overflow: "hidden",
  },
  summaryRow: {
    alignItems: "center",
    gap: 12,
  },
  summaryToggle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  summaryExpanded: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  summaryExpandedImage: {
    width: "100%",
    height: 168,
    borderRadius: 18,
    backgroundColor: "#E2E8F0",
  },
  summaryChips: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  summaryChipText: {
    ...FONT.semiBold,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  },
  summaryDescription: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 23,
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
