import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation, usePathname } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { getAcademicUnitLabelCopy } from "@/lib/academicUnitLabels";
import { resolveMediaUrl } from "@/lib/media";

interface Lesson {
  id: number;
  title: string;
  titleEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  videoId?: number | null;
  video?: {
    id: number;
    title: string;
    titleEn?: string | null;
    videoUrl: string;
    thumbnailUrl?: string | null;
    posterUrl?: string | null;
    duration: number;
    instructor: string;
    instructorEn?: string | null;
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

export default function LessonsScreen() {
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { unitId, unitName, unitNameEn, yearId, yearName, yearNameEn, subjectId, subjectName, subjectNameEn, unitLabel } = useLocalSearchParams<{
    unitId: string;
    unitName: string;
    unitNameEn?: string;
    yearId: string;
    yearName: string;
    yearNameEn?: string;
    subjectId: string;
    subjectName: string;
    subjectNameEn?: string;
    unitLabel?: string;
  }>();

  const title = String(unitName ?? strings.academic.lessons);
  const displayTitle = localizeAcademicText(title, language, unitNameEn ? String(unitNameEn) : undefined);
  const unitCopy = getAcademicUnitLabelCopy(unitLabel, strings.locale);
  const headerOverlayHeight = insets.top + 134;

  useEffect(() => {
    navigation.setOptions({ title: displayTitle });
  }, [displayTitle, navigation]);

  const {
    data: lessons = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId, token],
    queryFn: () => apiFetch(`/api/academic/units/${unitId}/lessons`, { token }),
    enabled: !!unitId,
  });

  const subscribePath =
    `${academicRoute(routeBase, "subscribe")}?yearId=${yearId}&yearName=${encode(String(yearName))}&yearNameEn=${encode(String(yearNameEn ?? ""))}` +
    `&subjectId=${subjectId}&subjectName=${encode(String(subjectName))}&subjectNameEn=${encode(String(subjectNameEn ?? ""))}`;

  function backToUnits() {
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

    router.replace(
      (`${academicRoute(routeBase, "units")}?yearId=${yearId}&yearName=${encode(String(yearName))}&yearNameEn=${encode(String(yearNameEn ?? ""))}` +
        `&subjectId=${subjectId}&subjectName=${encode(String(subjectName))}&subjectNameEn=${encode(String(subjectNameEn ?? ""))}&unitLabel=${encode(unitCopy.value)}`) as any,
    );
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
        <View style={[styles.topBarContent, { paddingHorizontal: 18 }]}>
          <View style={styles.backCornerRow}>
            <Pressable
              onPress={backToUnits}
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
                {unitCopy.plural}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              <Ionicons name="play-circle-outline" size={26} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
            </View>
            <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>{displayTitle}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {strings.academic.chooseLesson}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        data={lessons}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 13,
          flexGrow: 1,
        }}
        renderItem={({ item }) => {
          const thumbnailUrl = resolveMediaUrl(item.video?.thumbnailUrl ?? item.video?.posterUrl);

          return (
            <Pressable
              onPress={() =>
                router.push(
                  (`${academicRoute(routeBase, "lesson")}?lessonId=${item.id}&lessonTitle=${encode(item.title)}&lessonTitleEn=${encode(item.titleEn ?? "")}` +
                    `&yearId=${yearId}&yearName=${encode(String(yearName))}&yearNameEn=${encode(String(yearNameEn ?? ""))}` +
                    `&subjectId=${subjectId}&subjectName=${encode(String(subjectName))}&subjectNameEn=${encode(String(subjectNameEn ?? ""))}` +
                    `&unitId=${unitId}&unitName=${encode(title)}&unitNameEn=${encode(String(unitNameEn ?? ""))}&unitLabel=${encode(unitCopy.value)}`) as any,
                )
              }
              style={({ pressed }) => [
                styles.lessonCard,
                {
                  backgroundColor: colors.card,
                  borderColor: pressed ? COLORS.primary + "55" : colors.border,
                  flexDirection: rowDirection,
                  direction,
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
              ) : (
                <View style={styles.thumbnailFallback}>
                  <Ionicons name="play-circle-outline" size={28} color={COLORS.primary} />
                </View>
              )}
              <View style={[styles.lessonBody, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={[styles.lessonTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
                  {localizeAcademicText(item.title, language, item.titleEn)}
                </Text>
                {item.video ? (
                  <View style={[styles.lessonMeta, { flexDirection: rowDirection, direction }]}>
                    <Feather name="user" size={13} color={colors.textSecondary} />
                    <Text style={[styles.lessonMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {localizeAcademicText(item.video.instructor, language, item.video.instructorEn)}
                    </Text>
                    <Feather name="clock" size={13} color={colors.textSecondary} />
                    <Text style={[styles.lessonMetaText, { color: colors.textSecondary }]}>
                      {formatVideoDuration(item.video.duration)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.watchButton, { flexDirection: rowDirection, direction }]}>
                <Text style={[styles.watchText, { writingDirection: direction }]}>{strings.academic.watch}</Text>
                <Feather name="play" size={15} color="#fff" />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isLoading ? (
              <>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.common.loading}</Text>
              </>
            ) : isError ? (
              <>
                <Feather name="lock" size={32} color="#B45309" />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.loadLessonsError}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {error instanceof Error ? error.message : strings.academic.needsLessonsSubscription}
                </Text>
                <Pressable
                  onPress={() => {
                    if (token) router.push(subscribePath as any);
                    else router.push("/login");
                  }}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>
                    {token ? strings.academic.requestSubjectSubscription : strings.common.signIn}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={42} color={colors.textTertiary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.noLessons}</Text>
              </>
            )}
          </View>
        }
      />
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
  header: { gap: 12, paddingBottom: 4 },
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
    ...FONT.bold,
    fontSize: 28,
    lineHeight: 40,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "right",
  },
  lessonCard: {
    minHeight: 110,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  thumbnail: {
    width: 82,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
  },
  thumbnailFallback: {
    width: 82,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  lessonBody: { flex: 1, alignItems: "flex-end" },
  lessonTitle: {
    ...FONT.bold,
    fontSize: 19,
    lineHeight: 28,
    textAlign: "right",
  },
  lessonMeta: {
    marginTop: 6,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  lessonMetaText: {
    ...FONT.regular,
    fontSize: 11,
    maxWidth: 110,
  },
  watchButton: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  watchText: {
    ...FONT.bold,
    fontSize: 11,
    color: "#fff",
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
