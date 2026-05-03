import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef } from "react";
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
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

type AcademicYear = {
  id: number;
  name: string;
  description?: string | null;
};

const YEAR_ACCENTS = [
  { bg: "#EAF3FF", border: "#BFDBFE", icon: "#2563EB", arrow: "#2563EB" },
  { bg: "#ECFDF5", border: "#A7F3D0", icon: "#059669", arrow: "#059669" },
  { bg: "#FFF7ED", border: "#FED7AA", icon: "#EA580C", arrow: "#EA580C" },
  { bg: "#F5F3FF", border: "#DDD6FE", icon: "#7C3AED", arrow: "#7C3AED" },
];

function YearCard({ item, index }: { item: AcademicYear; index: number }) {
  const { colors, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const accent = YEAR_ACCENTS[index % YEAR_ACCENTS.length];
  const scale = useRef(new Animated.Value(1)).current;

  function animatePress(toValue: number) {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 3,
    }).start();
  }

  function handleOpen(source: "card" | "arrow") {
    const params = { yearId: String(item.id), yearName: String(item.name ?? "") };
    console.info("[mobile][videos] year card pressed", {
      source,
      yearId: params.yearId,
      yearName: params.yearName,
      route: "/(tabs)/videos/subjects",
      disabled: false,
    });

    router.push({
      pathname: "/(tabs)/videos/subjects",
      params,
    });

    console.info("[mobile][videos] stack push after", {
      screen: "subjects",
      params,
    });
  }

  return (
    <Pressable
      onPress={() => handleOpen("card")}
      onPressIn={() => animatePress(0.985)}
      onPressOut={() => animatePress(1)}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.yearCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            flexDirection: rowDirection,
            direction,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.yearIcon, { backgroundColor: accent.bg, borderColor: accent.border }]}>
          <Ionicons name="school-outline" size={26} color={accent.icon} />
        </View>
        <View style={[styles.yearBody, { alignItems: alignStart }]}>
          <Text
            style={[styles.yearTitle, { color: colors.text, textAlign, writingDirection: direction }]}
            numberOfLines={2}
          >
            {toEnglishDigits(item.name)}
          </Text>
          {item.description ? (
            <Text
              style={[styles.yearDesc, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
              numberOfLines={2}
            >
              {toEnglishDigits(item.description)}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => handleOpen("arrow")}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}
        >
          <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={21} color={accent.arrow} />
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

export default function VideosScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const insets = useSafeAreaInsets();
  const {
    data: years = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/api/academic/years"),
  });

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
        data={years}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + 22,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 14,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
              <View style={styles.titleIcon}>
                <Ionicons name="school-outline" size={26} color={COLORS.primary} />
              </View>
              <View style={[styles.titleTextBlock, { alignItems: alignStart }]}>
                <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
                  {strings.videos.title}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.videos.subtitle}
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => <YearCard item={item} index={index} />}
        ListEmptyComponent={
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isLoading ? (
              <>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.common.loading}</Text>
              </>
            ) : isError ? (
              <>
                <View style={styles.stateIcon}>
                  <Feather name="wifi-off" size={28} color={COLORS.error} />
                </View>
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.videos.loadErrorTitle}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {error instanceof Error ? error.message : strings.common.unexpectedError}
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
              </>
            ) : (
              <>
                <View style={styles.stateIcon}>
                  <Ionicons name="play-circle-outline" size={34} color={COLORS.primary} />
                </View>
                <Text style={[styles.stateTitle, { color: colors.text }]}>{strings.videos.emptyTitle}</Text>
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {strings.videos.emptyText}
                </Text>
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
  header: { paddingBottom: 8 },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 13,
  },
  titleIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  titleTextBlock: { flex: 1, alignItems: "flex-end" },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 27,
    lineHeight: 38,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 23,
    textAlign: "right",
  },
  yearCard: {
    minHeight: 124,
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
  },
  yearIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  yearBody: {
    flex: 1,
    alignItems: "flex-end",
  },
  yearTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    lineHeight: 26,
    textAlign: "right",
  },
  yearDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    marginTop: 4,
  },
  stateCard: {
    marginTop: 44,
    borderRadius: 26,
    borderWidth: 1,
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  stateIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "10",
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
