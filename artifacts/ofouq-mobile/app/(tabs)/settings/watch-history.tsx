import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import {
  clampProgress,
  formatClockDuration,
  formatHistoryDate,
  formatProgressPercent,
  formatStudyDuration,
  type WatchHistoryLesson,
  type WatchHistoryResponse,
  type WatchHistorySubject,
} from "@/lib/watchHistory";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function encode(value: string | number | null | undefined) {
  return encodeURIComponent(String(value ?? ""));
}

function getWatchedLessons(subject: WatchHistorySubject) {
  return subject.units
    .flatMap((unit) => unit.lessons)
    .filter((lesson) => lesson.currentSeconds > 0 || Boolean(lesson.lastWatchedAt))
    .sort((first, second) => {
      const firstTime = new Date(first.lastWatchedAt ?? 0).getTime();
      const secondTime = new Date(second.lastWatchedAt ?? 0).getTime();
      return secondTime - firstTime;
    });
}

function openLesson(subject: WatchHistorySubject, lesson: WatchHistoryLesson) {
  router.push({
    pathname: "/(tabs)/videos/lesson",
    params: {
      lessonId: String(lesson.id),
      lessonTitle: String(lesson.title),
      yearId: String(subject.year.id),
      yearName: String(subject.year.name),
      subjectId: String(subject.subject.id),
      subjectName: String(subject.subject.name),
      unitId: String(lesson.unitId),
      unitName: String(lesson.unitName),
      unitLabel: String(subject.subject.unitLabel),
    },
  });
}

function animateSubjectAccordion() {
  if (Platform.OS === "web") return;

  // easeInEaseOut (no spring overshoot) — a spring update keeps re-laying-out the
  // shadowed card, which Android re-rasterizes every frame and looks "pixelated"
  // for a moment. A plain ease curve stays crisp and smooth.
  LayoutAnimation.configureNext({
    duration: 280,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

type SubjectHistoryCardProps = Pick<
  ReturnType<typeof usePreferences>,
  "colors" | "strings" | "language" | "isRTL" | "textAlign" | "direction" | "rowDirection" | "alignStart"
> & {
  subject: WatchHistorySubject;
  isDark: boolean;
  isExpanded: boolean;
  onToggle: () => void;
};

const SubjectHistoryCard = React.memo(function SubjectHistoryCard({
  subject,
  colors,
  strings,
  language,
  isRTL,
  textAlign,
  direction,
  rowDirection,
  alignStart,
  isDark,
  isExpanded,
  onToggle,
}: SubjectHistoryCardProps) {
  const motion = React.useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const pressMotion = React.useRef(new Animated.Value(0)).current;
  const subjectProgress = clampProgress(subject.progressRatio);
  // review F-21: getWatchedLessons re-sorts on every render — memoize per card.
  const watchedLessons = React.useMemo(() => getWatchedLessons(subject), [subject]);

  React.useEffect(() => {
    const animation = isExpanded
      ? Animated.spring(motion, {
        toValue: isExpanded ? 1 : 0,
        useNativeDriver: true,
        tension: 64,
        friction: 10,
      })
      : Animated.timing(motion, {
        toValue: isExpanded ? 1 : 0,
        duration: isExpanded ? 360 : 220,
        easing: isExpanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      });

    animation.start();
  }, [isExpanded, motion]);

  const iconScale = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const iconTranslateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isRTL ? -5 : 5],
  });
  const titleTranslateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isRTL ? -4 : 4],
  });
  const percentScale = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const percentTranslateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, isRTL ? 6 : -6],
  });
  const detailsOpacity = motion.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.35, 1],
    extrapolate: "clamp",
  });
  const detailsTranslateY = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const pressScale = pressMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.985],
  });

  return (
    <Animated.View
      style={[
        styles.subjectCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressScale }],
        },
        isExpanded
          ? {
              shadowOpacity: isDark ? 0 : 0.08,
            }
          : styles.subjectCardCollapsed,
      ]}
    >
      <Pressable
        onPress={onToggle}
        onPressIn={() => {
          Animated.timing(pressMotion, {
            toValue: 1,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressMotion, {
            toValue: 0,
            useNativeDriver: true,
            tension: 90,
            friction: 8,
          }).start();
        }}
        accessibilityRole="button"
        accessibilityLabel={toEnglishDigits(subject.subject.name)}
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => [
          styles.subjectProgressSlide,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.035)",
            borderColor: pressed
              ? COLORS.primary + "55"
              : isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(30,58,138,0.08)",
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <View style={styles.subjectProgressMotion}>
          <View
            pointerEvents="none"
            style={[
              styles.subjectProgressLayer,
              {
                width: `${subjectProgress * 100}%`,
                backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.075)",
                ...(isRTL ? { right: 0 } : { left: 0 }),
              },
            ]}
          />
          <View style={[styles.subjectHeader, { flexDirection: rowDirection, direction }]}>
            <Animated.View
              style={[
                styles.subjectIcon,
                {
                  transform: [{ translateX: iconTranslateX }, { scale: iconScale }],
                },
              ]}
            >
              <Text style={styles.subjectEmoji}>{subject.subject.icon || "📚"}</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.subjectHeaderText,
                {
                  direction: "ltr",
                  alignItems: isRTL ? "flex-end" : "flex-start",
                  transform: [{ translateX: titleTranslateX }],
                },
              ]}
            >
              <Text style={[styles.subjectTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {localizeAcademicText(subject.subject.name, language, subject.subject.nameEn)}
              </Text>
              <Text style={[styles.subjectMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {localizeAcademicText(subject.year.name, language, subject.year.nameEn)} • {formatStudyDuration(subject.watchedSeconds, language)} / {formatStudyDuration(subject.totalSeconds, language)}
              </Text>
            </Animated.View>
            <Animated.Text
              style={[
                styles.subjectPercent,
                {
                  transform: [{ translateX: percentTranslateX }, { scale: percentScale }],
                },
              ]}
            >
              {formatProgressPercent(subjectProgress)}
            </Animated.Text>
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <Animated.View
          style={[
            styles.subjectExpandedContent,
            {
              opacity: detailsOpacity,
              // Slide + fade only — NO scale. Scaling this subtree rasterizes the
              // text and lesson thumbnails to a texture and stretches it for the
              // duration, which is what made the whole card look pixelated on open.
              transform: [{ translateY: detailsTranslateY }],
            },
          ]}
        >
          <View style={[styles.subjectMetrics, { flexDirection: rowDirection, direction }]}>
            <View style={styles.subjectMetricPill}>
              <Text style={[styles.subjectMetricText, { color: colors.textSecondary }]}>
                {toEnglishDigits(`${subject.watchedLessons}/${subject.lessonCount}`)} {strings.settings.watchHistoryLessonsStarted}
              </Text>
            </View>
            <View style={styles.subjectMetricPill}>
              <Text style={[styles.subjectMetricText, { color: colors.textSecondary }]}>
                {toEnglishDigits(String(subject.completedLessons))} {strings.settings.watchHistoryCompletedCount}
              </Text>
            </View>
            {subject.lastWatchedAt ? (
              <View style={styles.subjectMetricPill}>
                <Text style={[styles.subjectMetricText, { color: colors.textSecondary }]}>
                  {strings.settings.watchHistoryLastTime} {formatHistoryDate(subject.lastWatchedAt, strings.locale)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.lessonTimeline}>
            {watchedLessons.length === 0 ? (
              <Text style={[styles.noLessonsText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.settings.watchHistoryNoLessons}
              </Text>
            ) : null}

            {watchedLessons.map((lesson, index) => {
              const lessonProgress = clampProgress(lesson.progressRatio);
              // Show the PRIMARY image (thumbnailUrl) here, same as the lessons list.
              const thumbnailUri = resolveMediaUrl(lesson.thumbnailUrl ?? lesson.posterUrl);
              const statusLabel = lesson.completed
                ? strings.settings.watchHistoryCompleted
                : lessonProgress > 0
                  ? strings.settings.watchHistoryStarted
                  : strings.settings.watchHistoryNotStarted;
              const lessonOpacity = motion.interpolate({
                inputRange: [0, Math.min(0.8, 0.28 + index * 0.06), 1],
                outputRange: [0, 0.25, 1],
                extrapolate: "clamp",
              });
              const lessonTranslateY = motion.interpolate({
                inputRange: [0, 1],
                outputRange: [Math.min(22, 10 + index * 3), 0],
              });

              return (
                <Animated.View
                  key={lesson.id}
                  style={{
                    opacity: lessonOpacity,
                    transform: [{ translateY: lessonTranslateY }],
                  }}
                >
                  <Pressable
                    onPress={() => openLesson(subject, lesson)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={toEnglishDigits(lesson.title)}
                    style={({ pressed }) => [
                      styles.lessonRow,
                      {
                        opacity: pressed ? 0.78 : 1,
                        flexDirection: rowDirection,
                        direction,
                      },
                    ]}
                  >
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineConnector, styles.timelineConnectorTop, index === 0 ? styles.timelineConnectorHidden : null]} />
                      <View style={[styles.timelineDot, lesson.completed ? styles.timelineDotDone : null]} />
                      <View style={[styles.timelineConnector, styles.timelineConnectorBottom, index === watchedLessons.length - 1 ? styles.timelineConnectorHidden : null]} />
                    </View>

                    {thumbnailUri ? (
                      <Image source={{ uri: thumbnailUri }} style={styles.lessonThumb} contentFit="cover" />
                    ) : (
                      <View style={styles.lessonThumbFallback}>
                        <Feather name="play" size={18} color={COLORS.primary} />
                      </View>
                    )}

                    <View style={[styles.lessonBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                      {/* direction:"ltr" neutralizes forceRTL; explicit physical
                          flexDirection + textAlign forces title to the right in
                          Arabic and to the left in English, deterministically. */}
                      <View style={[styles.lessonTitleLine, { flexDirection: isRTL ? "row-reverse" : "row", direction: "ltr" }]}>
                        <Text style={[styles.lessonTitle, { color: colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]} numberOfLines={1}>
                          {localizeAcademicText(lesson.title, language, lesson.titleEn)}
                        </Text>
                        <Text style={[styles.lessonStatus, lesson.completed ? styles.lessonStatusDone : null]}>
                          {statusLabel}
                        </Text>
                      </View>
                      <Text style={[styles.lessonMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                        {localizeAcademicText(lesson.unitName, language, lesson.unitNameEn)} • {formatClockDuration(lesson.currentSeconds)} / {formatClockDuration(lesson.durationSeconds)}
                      </Text>
                      <View style={[styles.lessonTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)" }]}>
                        <View
                          style={[
                            styles.lessonTrackFill,
                            {
                              width: `${lessonProgress * 100}%`,
                              ...(isRTL ? { right: 0 } : { left: 0 }),
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

export default function WatchHistoryScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    language,
    isRTL,
    textAlign,
    direction,
    rowDirection,
    alignStart,
  } = usePreferences();
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === "dark";
  // Extra top room so the floating back button never overlaps the page title
  // (in LTR the title is left-aligned and would otherwise sit under the button).
  const headerOverlayHeight = insets.top + 92;
  const [expandedSubjectId, setExpandedSubjectId] = React.useState<number | null>(null);
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<WatchHistoryResponse>({
    queryKey: ["academic", "watch-history", "me", token],
    queryFn: () => apiFetch("/api/academic/watch-history/me", { token }),
    enabled: Boolean(user && token),
  });
  const subjects = data?.subjects ?? [];
  const totals = data?.totals;
  const totalProgress = clampProgress(totals?.progressRatio ?? 0);

  React.useEffect(() => {
    setExpandedSubjectId((current) => {
      if (!current) return null;
      return subjects.some((subject) => subject.subscriptionId === current) ? current : null;
    });
  }, [subjects]);

  const toggleSubject = React.useCallback((subjectId: number) => {
    animateSubjectAccordion();
    setExpandedSubjectId((current) => (current === subjectId ? null : subjectId));
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (user && token) {
        void refetch();
      }
    }, [refetch, token, user]),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          isDark
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.topBar,
          {
            height: headerOverlayHeight,
            paddingTop: insets.top + 14,
            direction,
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 62 : 92}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDark ? "rgba(0,0,0,0.92)" : "rgba(248,251,255,0.92)" },
          ]}
        />
        {/* Compact one-row header: arrow-only back on the LEFT, title+icon+subtitle on the
            RIGHT — all on the same level, so the header is short. */}
        <View style={[styles.topBarContent, { paddingHorizontal: 18, direction: "ltr", flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [styles.pageBackButton, { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={strings.common.back}
          >
            <Feather name="arrow-left" size={20} color={colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: rowDirection, direction, alignItems: "center", gap: 12 }}>
            <View style={[styles.titleIcon, isDark && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              <MaterialCommunityIcons
                name="timeline-clock-outline"
                size={24}
                color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary}
              />
            </View>
            <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start", flex: 1 }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.settings.watchHistoryTitle}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
                {strings.settings.watchHistorySubtitle}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {!user || !token ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="lock" size={28} color={COLORS.primary} />
          <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
            {strings.settings.accountLoginSubtitle}
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/login")}>
            <Text style={styles.primaryButtonText}>{strings.common.signIn}</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="alert-circle" size={28} color={COLORS.error} />
          <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
            {strings.common.unexpectedError}
          </Text>
          <Text style={[styles.stateText, { color: colors.textSecondary, writingDirection: direction }]}>
            {error instanceof Error ? error.message : strings.common.unexpectedError}
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => void refetch()} disabled={isFetching}>
            <Text style={styles.primaryButtonText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
          </Pressable>
        </View>
      ) : (
        // review F-21: render the subjects with a FlatList (virtualized) instead of
        // mapping inside a ScrollView; the summary + empty state live in the header.
        <FlatList
          data={subjects}
          keyExtractor={(subject) => String(subject.subscriptionId)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: headerOverlayHeight + 18,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 118,
            gap: 14,
          }}
          ListHeaderComponent={
            <View style={{ gap: 14 }}>
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.summaryFill,
                    {
                      width: `${totalProgress * 100}%`,
                      backgroundColor: isDark ? "rgba(37,99,235,0.28)" : "rgba(29,78,216,0.12)",
                      ...(isRTL ? { right: 0 } : { left: 0 }),
                    },
                  ]}
                />
                <View style={[styles.summaryTop, { flexDirection: rowDirection, direction }]}>
                  <View style={[styles.summaryIcon, isDark && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
                    <Feather name="bar-chart-2" size={22} color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary} />
                  </View>
                  <View style={[styles.summaryTextBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                    <Text style={[styles.summaryTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                      {strings.settings.subscriptions}
                    </Text>
                    <Text style={[styles.summarySubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {subjects.length === 0
                        ? strings.settings.watchHistoryEmptyTitle
                        : `${toEnglishDigits(String(totals?.subscriptionCount ?? subjects.length))} ${strings.settings.watchHistoryActiveSubjects}`}
                    </Text>
                  </View>
                  <Text style={styles.summaryPercent}>{formatProgressPercent(totalProgress)}</Text>
                </View>
                <View style={[styles.summaryNumbers, { flexDirection: rowDirection, direction }]}>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryMetricValue, { color: colors.text }]}>
                      {formatStudyDuration(totals?.watchedSeconds ?? 0, language)}
                    </Text>
                    <Text style={[styles.summaryMetricLabel, { color: colors.textSecondary }]}>{strings.settings.watchHistoryStatWatched}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryMetricValue, { color: colors.text }]}>
                      {formatStudyDuration(totals?.totalSeconds ?? 0, language)}
                    </Text>
                    <Text style={[styles.summaryMetricLabel, { color: colors.textSecondary }]}>{strings.settings.watchHistoryStatContent}</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryMetricValue, { color: colors.text }]}>
                      {toEnglishDigits(String(totals?.completedLessons ?? 0))}
                    </Text>
                    <Text style={[styles.summaryMetricLabel, { color: colors.textSecondary }]}>{strings.settings.watchHistoryCompleted}</Text>
                  </View>
                </View>
              </View>

              {subjects.length === 0 ? (
                <View style={[styles.stateCardInline, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="book-open" size={28} color={COLORS.primary} />
                  <Text style={[styles.stateTitle, { color: colors.text, writingDirection: direction }]}>
                    {strings.settings.watchHistoryEmptyTitle}
                  </Text>
                  <Text style={[styles.stateText, { color: colors.textSecondary, writingDirection: direction }]}>
                    {strings.settings.watchHistoryEmptyText}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item: subject }) => (
            <SubjectHistoryCard
              subject={subject}
              colors={colors}
              strings={strings}
              language={language}
              isRTL={isRTL}
              textAlign={textAlign}
              direction={direction}
              rowDirection={rowDirection}
              alignStart={alignStart}
              isDark={isDark}
              isExpanded={expandedSubjectId === subject.subscriptionId}
              onToggle={() => toggleSubject(subject.subscriptionId)}
            />
          )}
        />
      )}
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
    alignItems: "center",
    gap: 13,
    paddingBottom: 14,
  },
  pageBackWrap: {
    position: "absolute",
    left: 18,
    zIndex: 20,
  },
  pageBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    ...FONT.bold,
    fontSize: 20,
    lineHeight: 28,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "right",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCard: {
    margin: 18,
    marginTop: 168,
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  stateCardInline: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
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
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    ...FONT.bold,
    fontSize: 14,
    color: "#FFFFFF",
  },
  summaryCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 16,
    gap: 15,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  summaryFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  summaryTop: {
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  summaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    ...FONT.bold,
    fontSize: 18,
    lineHeight: 29,
  },
  summarySubtitle: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
  },
  summaryPercent: {
    minWidth: 58,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.primary,
    color: "#FFFFFF",
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    writingDirection: "ltr",
  },
  summaryNumbers: {
    gap: 8,
  },
  summaryMetric: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(96,165,250,0.10)",
  },
  summaryMetricValue: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 25,
    textAlign: "center",
  },
  summaryMetricLabel: {
    ...FONT.regular,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  subjectCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 10,
    gap: 12,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
  },
  subjectCardCollapsed: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  subjectExpandedContent: {
    gap: 12,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  subjectProgressSlide: {
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  subjectProgressMotion: {
    flex: 1,
    position: "relative",
  },
  subjectProgressLayer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 24,
  },
  subjectHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  subjectIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
  },
  subjectEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  subjectHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  subjectTitle: {
    ...FONT.bold,
    fontSize: 18,
    lineHeight: 31,
  },
  subjectMeta: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
  },
  subjectPercent: {
    color: COLORS.primaryLight,
    ...FONT.bold,
    fontSize: 17,
    lineHeight: 27,
    textAlign: "left",
    writingDirection: "ltr",
  },
  subjectMetrics: {
    flexWrap: "wrap",
    gap: 8,
  },
  subjectMetricPill: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(148,163,184,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  subjectMetricText: {
    ...FONT.semiBold,
    fontSize: 11,
    lineHeight: 15,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  lessonTimeline: {
    gap: 10,
  },
  noLessonsText: {
    ...FONT.regular,
    fontSize: 13,
    lineHeight: 22,
    paddingVertical: 8,
  },
  lessonRow: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  timelineRail: {
    width: 18,
    alignSelf: "stretch",
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: "#FFFFFF",
    zIndex: 1,
  },
  timelineDotDone: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  // Two segments (above + below the dot). Only the BOTTOM segment overshoots the
  // row gap (marginBottom) so it meets the next row's top segment exactly at the
  // row boundary — one continuous line with no doubling/overlap.
  timelineConnector: {
    width: 3,
    borderRadius: 999,
    backgroundColor: "rgba(96,165,250,0.55)",
  },
  timelineConnectorTop: {
    height: 21,
  },
  timelineConnectorBottom: {
    flex: 1,
    minHeight: 16,
    marginBottom: -10,
  },
  timelineConnectorHidden: {
    backgroundColor: "transparent",
  },
  lessonThumb: {
    width: 96,
    height: 54, // 16:9 to match the lesson cover/thumbnail aspect ratio
    borderRadius: 12,
    backgroundColor: COLORS.primary + "10",
  },
  lessonThumbFallback: {
    width: 96,
    height: 54, // 16:9
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
  },
  lessonBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  lessonTitleLine: {
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  lessonTitle: {
    flex: 1,
    ...FONT.bold,
    fontSize: 13,
    lineHeight: 23,
  },
  lessonStatus: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(245,158,11,0.14)",
    color: COLORS.warning,
    ...FONT.bold,
    fontSize: 10,
    lineHeight: 15,
  },
  lessonStatusDone: {
    backgroundColor: "rgba(16,185,129,0.14)",
    color: COLORS.success,
  },
  lessonMeta: {
    ...FONT.regular,
    fontSize: 11,
    lineHeight: 18,
  },
  lessonTrack: {
    height: 7,
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
  },
  lessonTrackFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
});
