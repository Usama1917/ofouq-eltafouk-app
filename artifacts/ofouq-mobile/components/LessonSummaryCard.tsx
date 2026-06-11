import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
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
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";

// ── Morph geometry ────────────────────────────────────────────────────────────
const PAD = 14; // inner padding of the card body
const THUMB_W = 96; // collapsed header thumbnail (16:9 so the scale never distorts)
const THUMB_H = 54;
const DIVIDER_SPACE = 15; // gap below the divider line (line sits at its top)
const BIG_RATIO = 9 / 16; // expanded image aspect ratio
const OPEN_MS = 620;
const CLOSE_MS = 460;
// Smooth, premium ease — gentle in, slow soft out.
const EASE = Easing.bezier(0.33, 0, 0.1, 1);

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

type Props = {
  thumbnailUrl: string | null;
  title: string;
  titleEn?: string | null;
  instructor: string;
  instructorEn?: string | null;
  duration: number;
  description?: string | null;
  descriptionEn?: string | null;
  segmentsCount: number;
  userName?: string | null;
  userEmail?: string | null;
};

export function LessonSummaryCard({
  thumbnailUrl,
  title,
  titleEn,
  instructor,
  instructorEn,
  duration,
  description,
  descriptionEn,
  segmentsCount,
  userName,
  userEmail,
}: Props) {
  const { colors, language, strings, isRTL, direction, textAlign, rowDirection } = usePreferences();
  const { width: windowWidth } = useWindowDimensions();

  const [expanded, setExpanded] = useState(false);
  // Single UI-thread timeline. Everything (image frame, heights, opacity,
  // rotation) is derived from this on the UI thread → no JS-thread jank.
  const progress = useSharedValue(0);

  // Measured frames — fall back to estimates until the first layout.
  const [cardW, setCardW] = useState(Math.max(1, windowWidth - 36));
  const [headerH, setHeaderH] = useState(78);
  const [extrasH, setExtrasH] = useState(140);

  const toggle = useCallback(() => {
    setExpanded((value) => {
      const next = !value;
      progress.value = withTiming(next ? 1 : 0, { duration: next ? OPEN_MS : CLOSE_MS, easing: EASE });
      return next;
    });
  }, [progress]);

  const onCardLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(1, event.nativeEvent.layout.width);
    setCardW((current) => (Math.abs(current - next) < 0.5 ? current : next));
  }, []);
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(1, event.nativeEvent.layout.height);
    setHeaderH((current) => (Math.abs(current - next) < 0.5 ? current : next));
  }, []);
  const onExtrasLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(1, event.nativeEvent.layout.height);
    setExtrasH((current) => (Math.abs(current - next) < 0.5 ? current : next));
  }, []);

  // Derived frames for the morphing image.
  const innerW = Math.max(1, cardW - PAD * 2);
  const bigH = Math.round(innerW * BIG_RATIO);
  const smallTop = Math.max(0, (headerH - THUMB_H) / 2);
  const smallLeft = Math.max(0, cardW - PAD - THUMB_W);
  const bigTop = headerH + DIVIDER_SPACE;

  // Animate the real width/height/top/left so expo-image re-renders crisply at
  // every size (no raster scaling) while staying on the UI thread.
  const imageStyle = useAnimatedStyle(() => ({
    top: interpolate(progress.value, [0, 1], [smallTop, bigTop]),
    left: interpolate(progress.value, [0, 1], [smallLeft, PAD]),
    width: interpolate(progress.value, [0, 1], [THUMB_W, innerW]),
    height: interpolate(progress.value, [0, 1], [THUMB_H, bigH]),
    borderRadius: interpolate(progress.value, [0, 1], [16, 18]),
    borderWidth: interpolate(progress.value, [0, 1], [2, 1]),
  }), [smallTop, bigTop, smallLeft, innerW, bigH]);

  const dividerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, DIVIDER_SPACE]),
    opacity: progress.value,
  }));

  const spacerStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, bigH]),
  }), [bigH]);

  const extrasStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, extrasH]),
    opacity: progress.value,
  }), [extrasH]);

  const headerTextStyle = useAnimatedStyle(() => ({
    paddingRight: interpolate(progress.value, [0, 1], [THUMB_W + 12, 0]),
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [180, 0])}deg` }],
  }));

  return (
    <Pressable
      onPress={toggle}
      onLayout={onCardLayout}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.96 : 1 },
      ]}
    >
      {/* Header — always visible. Text right (RTL), arrow button left. */}
      <View style={styles.header} onLayout={onHeaderLayout}>
        <View style={styles.headerToggle}>
          <Animated.View style={chevronStyle}>
            <Feather name="chevron-down" size={20} color="#fff" />
          </Animated.View>
        </View>
        <Animated.View style={[styles.headerText, { alignItems: isRTL ? "flex-end" : "flex-start" }, headerTextStyle]}>
          <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
            {localizeAcademicText(title, language, titleEn)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
            {localizeAcademicText(instructor, language, instructorEn)} · {formatVideoDuration(duration)}
          </Text>
          {userName ? (
            <Text style={[styles.email, { color: colors.textTertiary, textAlign, writingDirection: direction }]} numberOfLines={1}>
              {localizeAcademicText(userName, language)}{userEmail ? ` - ${toEnglishDigits(userEmail)}` : ""}
            </Text>
          ) : null}
        </Animated.View>
      </View>

      {/* Divider — line sits at the top so the header's bottom padding above and
          this block's height below keep it centered in the header→image gap. */}
      <Animated.View style={[styles.dividerBlock, dividerStyle]}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </Animated.View>

      {/* Spacer that reserves the big image area when expanded. */}
      <Animated.View style={spacerStyle} />

      {/* Body extras — chips + description. Clipped + faded on collapse. */}
      <Animated.View style={[styles.extrasOuter, extrasStyle]}>
        <View onLayout={onExtrasLayout} style={styles.extrasInner}>
          <View style={[styles.chips, { flexDirection: rowDirection, direction }]}>
            <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="clock" size={13} color={COLORS.primary} />
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>{formatVideoDuration(duration)}</Text>
            </View>
            {segmentsCount > 0 ? (
              <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="list" size={13} color={COLORS.primary} />
                <Text style={[styles.chipText, { color: colors.textSecondary }]}>
                  {toEnglishDigits(String(segmentsCount))} {strings.academic.lessonSegments}
                </Text>
              </View>
            ) : null}
          </View>
          {description ? (
            <View style={{ width: "100%", direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
              <Text style={[styles.description, { color: colors.textSecondary, width: "100%", textAlign: isRTL ? "right" : "left", writingDirection: direction }]}>
                {localizeAcademicText(description, language, descriptionEn)}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* Morphing image — travels between the header thumbnail and the body. */}
      <Animated.View style={[styles.image, imageStyle]} pointerEvents="none">
        {thumbnailUrl ? (
          // The frame morphs from a 96px thumbnail to full width. Without this,
          // expo-image decodes at the small collapsed size and upscales that
          // bitmap as the frame grows → pixelated until it re-decodes. Decoding
          // at source resolution keeps it crisp at every size in the animation.
          <Image
            source={{ uri: thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            allowDownscaling={false}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
            <Feather name="play" size={20} color={COLORS.primary} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: PAD,
    paddingTop: PAD,
    paddingBottom: PAD,
    minHeight: THUMB_H + PAD,
  },
  headerToggle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  headerText: { flex: 1 },
  title: { ...FONT.bold, fontSize: 14, textAlign: "right" },
  meta: { ...FONT.regular, fontSize: 12, textAlign: "right", marginTop: 2 },
  email: { ...FONT.regular, fontSize: 10, textAlign: "right", marginTop: 3 },
  dividerBlock: { justifyContent: "flex-start", paddingHorizontal: PAD, overflow: "hidden" },
  divider: { height: 1, width: "100%" },
  extrasOuter: { overflow: "hidden" },
  extrasInner: {
    paddingHorizontal: PAD,
    paddingTop: 14,
    paddingBottom: PAD,
    gap: 12,
  },
  chips: {
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: {
    ...FONT.semiBold,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  },
  description: { ...FONT.regular, fontSize: 14, lineHeight: 23 },
  image: {
    position: "absolute",
    borderColor: COLORS.primary,
    overflow: "hidden",
    backgroundColor: "#0B1220",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "14",
  },
});
