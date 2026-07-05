import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";

// Same premium ease + timings as LessonSummaryCard so every lesson card
// (description / segments / notes) expands & collapses with the identical feel.
const OPEN_MS = 620;
const CLOSE_MS = 460;
const EASE = Easing.bezier(0.33, 0, 0.1, 1);

// A generic tap-to-expand card. The header (chevron + icon + title + count) is
// always visible; the body morphs open on a single UI-thread timeline. When
// `maxBodyHeight` is set the body caps at that height and scrolls inside.
export function CollapsibleCard({
  icon,
  title,
  count,
  maxBodyHeight,
  defaultExpanded = false,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  count?: number | null;
  maxBodyHeight?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const { colors, language, direction, textAlign } = usePreferences();
  const en = language === "en";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const progress = useSharedValue(defaultExpanded ? 1 : 0);
  // Natural content height (measured); capped when a scroll limit is set.
  const [contentH, setContentH] = useState(0);
  const cappedH = maxBodyHeight ? Math.min(contentH, maxBodyHeight) : contentH;

  const toggle = useCallback(() => {
    setExpanded((value) => {
      const next = !value;
      progress.value = withTiming(next ? 1 : 0, { duration: next ? OPEN_MS : CLOSE_MS, easing: EASE });
      return next;
    });
  }, [progress]);

  const measure = useCallback((h: number) => {
    setContentH((current) => (Math.abs(current - h) < 0.5 ? current : h));
  }, []);
  const onViewLayout = useCallback((e: LayoutChangeEvent) => measure(e.nativeEvent.layout.height), [measure]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, cappedH]),
    opacity: progress.value,
  }), [cappedH]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [180, 0])}deg` }],
  }));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.96 : 1 }]}
      >
        {/* Bare chevron (no box) — always the physical LEFT edge, like the
            description card. Rotates with the open/close timeline. */}
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-down" size={22} color={COLORS.primary} />
        </Animated.View>
        {/* Reading group: icon → title → count, hugging the reading start (right in
            Arabic). `rowDirection` here is hardcoded "row" app-wide, so we drive the
            flip off the language directly (proven pattern) + a physical LTR box. */}
        <View style={[styles.headerMain, { flexDirection: en ? "row" : "row-reverse" }]}>
          <Feather name={icon} size={18} color={COLORS.primary} />
          <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
            {title}
          </Text>
          {typeof count === "number" && count > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{toEnglishDigits(String(count))}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Animated.View style={[styles.bodyOuter, bodyStyle]}>
        {maxBodyHeight ? (
          // Content-size measurement is reliable even while clipped to 0 height.
          <ScrollView
            style={{ maxHeight: maxBodyHeight }}
            contentContainerStyle={styles.bodyInner}
            onContentSizeChange={(_w, h) => measure(h)}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
        ) : (
          <View onLayout={onViewLayout} style={styles.bodyInner}>
            {children}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", borderRadius: 24, borderWidth: 1, overflow: "hidden" },
  header: {
    // Static physical row: chevron is child 1 (always left), reading group fills
    // the rest. direction:"ltr" stops RN from double-flipping the box.
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  // Fills the space right of the chevron; content hugs the reading start
  // (right in Arabic) via flex-start + the inline row/row-reverse. flexDirection
  // set inline off the language.
  headerMain: { flex: 1, direction: "ltr", alignItems: "center", justifyContent: "flex-start", gap: 8 },
  title: { ...FONT.bold, fontSize: 15, flexShrink: 1 },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: COLORS.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { ...FONT.bold, fontSize: 11, color: COLORS.primary },
  bodyOuter: { overflow: "hidden" },
  bodyInner: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
});
