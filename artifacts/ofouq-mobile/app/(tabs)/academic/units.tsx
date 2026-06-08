import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
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
import { toEnglishDigits } from "@/lib/format";

interface Unit {
  id: number;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
}

function encode(value: string | undefined) {
  return encodeURIComponent(value ?? "");
}

export default function UnitsScreen() {
  const { colors, resolvedScheme, strings, language, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { yearId, yearName, subjectId, subjectName, subjectIcon, unitLabel } = useLocalSearchParams<{
    yearId: string;
    yearName: string;
    subjectId: string;
    subjectName: string;
    subjectIcon?: string;
    unitLabel?: string;
  }>();

  const title = String(subjectName ?? strings.academic.units);
  const displayTitle = localizeAcademicText(title, language);
  const displaySubjectIcon = String(subjectIcon ?? "").trim();
  const unitCopy = getAcademicUnitLabelCopy(unitLabel, strings.locale);
  const headerOverlayHeight = insets.top + 134;

  useEffect(() => {
    navigation.setOptions({ title: displayTitle });
  }, [displayTitle, navigation]);

  const {
    data: units = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Unit[]>({
    queryKey: ["academic", "units", subjectId, token],
    queryFn: () => apiFetch(`/api/academic/subjects/${subjectId}/units`, { token }),
    enabled: !!subjectId,
  });

  const subscribePath =
    `${academicRoute(routeBase, "subscribe")}?yearId=${yearId}&yearName=${encode(String(yearName))}` +
    `&subjectId=${subjectId}&subjectName=${encode(title)}`;

  function backToSubjects() {
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
      (`${academicRoute(routeBase, "subjects")}?yearId=${yearId}&yearName=${encode(String(yearName))}`) as any,
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
              onPress={backToSubjects}
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
                {strings.academic.subjects}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              {displaySubjectIcon ? (
                <Text style={styles.titleEmoji}>{displaySubjectIcon}</Text>
              ) : (
                <Ionicons name="layers-outline" size={24} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
              )}
            </View>
            <View style={[styles.titleBlock, { alignItems: alignStart }]}>
              <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>{displayTitle}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                {unitCopy.choose}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        data={units}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 13,
          flexGrow: 1,
        }}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              router.push(
                (`${academicRoute(routeBase, "lessons")}?yearId=${yearId}&yearName=${encode(String(yearName))}` +
                  `&subjectId=${subjectId}&subjectName=${encode(title)}` +
                  `&unitId=${item.id}&unitName=${encode(item.name)}&unitLabel=${encode(unitCopy.value)}`) as any,
              )
            }
            style={({ pressed }) => [
              styles.unitCard,
              {
                backgroundColor: colors.card,
                borderColor: pressed ? COLORS.primary + "55" : colors.border,
                flexDirection: rowDirection,
                direction,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={[styles.unitIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
              <Text style={[styles.unitIndex, { color: resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary }]}>
                {toEnglishDigits(index + 1)}
              </Text>
            </View>
            <View style={[styles.unitBody, { alignItems: alignStart }]}>
              <Text style={[styles.unitTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
                {localizeAcademicText(item.name, language, item.nameEn)}
              </Text>
              {item.description ? (
                <Text style={[styles.unitDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={2}>
                  {localizeAcademicText(item.description, language, item.descriptionEn)}
                </Text>
              ) : null}
            </View>
            <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.textTertiary} />
          </Pressable>
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
                <Feather name="lock" size={32} color="#B45309" />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.subjectUnavailable}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {error instanceof Error ? error.message : unitCopy.needsSubscription}
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
                <Ionicons name="layers-outline" size={42} color={colors.textTertiary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{unitCopy.noPublished}</Text>
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
  titleEmoji: {
    fontSize: 28,
    lineHeight: 34,
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
  unitCard: {
    minHeight: 110,
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  unitIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  unitIndex: {
    ...FONT.bold,
    fontSize: 17,
  },
  unitBody: { flex: 1, alignItems: "flex-end" },
  unitTitle: {
    ...FONT.bold,
    fontSize: 19,
    lineHeight: 28,
    textAlign: "right",
  },
  unitDesc: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "right",
    marginTop: 4,
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
