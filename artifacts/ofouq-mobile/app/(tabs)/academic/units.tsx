import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { academicRoute, getAcademicRouteBase } from "@/lib/academicRoutes";
import { toEnglishDigits } from "@/lib/format";

interface Unit {
  id: number;
  name: string;
  description?: string | null;
}

function encode(value: string | undefined) {
  return encodeURIComponent(value ?? "");
}

export default function UnitsScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const routeBase = getAcademicRouteBase(usePathname());
  const { yearId, yearName, subjectId, subjectName, subjectIcon } = useLocalSearchParams<{
    yearId: string;
    yearName: string;
    subjectId: string;
    subjectName: string;
    subjectIcon?: string;
  }>();

  const title = String(subjectName ?? strings.academic.units);
  const displayTitle = toEnglishDigits(title);
  const displaySubjectIcon = String(subjectIcon ?? "").trim();

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
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <FlatList
        data={units}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
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
                onPress={backToSubjects}
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
                  {strings.academic.subjects}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
              <View style={styles.titleIcon}>
                {displaySubjectIcon ? (
                  <Text style={styles.titleEmoji}>{displaySubjectIcon}</Text>
                ) : (
                  <Ionicons name="layers-outline" size={24} color={COLORS.primary} />
                )}
              </View>
              <View style={[styles.titleBlock, { alignItems: alignStart }]}>
                <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>{displayTitle}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.academic.chooseUnit}
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              router.push(
                (`${academicRoute(routeBase, "lessons")}?yearId=${yearId}&yearName=${encode(String(yearName))}` +
                  `&subjectId=${subjectId}&subjectName=${encode(title)}` +
                  `&unitId=${item.id}&unitName=${encode(item.name)}`) as any,
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
            <View style={styles.unitIcon}>
              <Text style={styles.unitIndex}>{toEnglishDigits(index + 1)}</Text>
            </View>
            <View style={[styles.unitBody, { alignItems: alignStart }]}>
              <Text style={[styles.unitTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
                {toEnglishDigits(item.name)}
              </Text>
              {item.description ? (
                <Text style={[styles.unitDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={2}>
                  {toEnglishDigits(item.description)}
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
                  {error instanceof Error ? error.message : strings.academic.needsUnitsSubscription}
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
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.academic.noUnits}</Text>
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
  titleEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  titleBlock: { flex: 1, alignItems: "flex-end" },
  title: {
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
    backgroundColor: COLORS.primary + "12",
  },
  unitIndex: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: COLORS.primary,
  },
  unitBody: { flex: 1, alignItems: "flex-end" },
  unitTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    lineHeight: 25,
    textAlign: "right",
  },
  unitDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 20,
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
