import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AcademicVideoSegment } from "@/components/AcademicVideoPlayer";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => toEnglishDigits(String(n).padStart(2, "0"));
  return h > 0 ? `${toEnglishDigits(String(h))}:${two(m)}:${two(r)}` : `${toEnglishDigits(String(m))}:${two(r)}`;
}

// v2 — lesson segments as a collapsible card (under the description card). Tapping
// a segment seeks the player to that second. Caps at ~3 rows, the rest scrolls,
// so a long lesson never blows up the screen.
export function LessonSegmentsCard({
  segments,
  onSeek,
}: {
  segments?: AcademicVideoSegment[] | null;
  onSeek: (seconds: number) => void;
}) {
  const { colors, language, strings, isRTL, direction } = usePreferences();

  const items = useMemo(() => {
    if (!Array.isArray(segments)) return [];
    return segments
      .filter((segment) => segment && String(segment.title ?? "").trim())
      .map((segment, index) => ({
        ...segment,
        id: segment.id ?? index + 1,
        title: String(segment.title).trim(),
        startSeconds: Math.max(0, Math.floor(Number(segment.startSeconds) || 0)),
        orderIndex: Number.isFinite(segment.orderIndex) ? Number(segment.orderIndex) : index,
        thumbnailUrl: resolveMediaUrl(segment.thumbnailUrl),
      }))
      .sort((a, b) => (a.startSeconds - b.startSeconds) || ((a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
  }, [segments]);

  if (items.length === 0) return null;

  const label = (type?: AcademicVideoSegment["segmentType"]) => {
    if (type === "questions") return strings.academic.segmentTypes.questions;
    if (type === "parts") return strings.academic.segmentTypes.parts;
    if (type === "topics") return strings.academic.segmentTypes.topics;
    return strings.academic.segmentTypes.segment;
  };

  return (
    <CollapsibleCard icon="list" title={strings.academic.lessonSegments} count={items.length} maxBodyHeight={228}>
      <View style={styles.list}>
        {items.map((segment) => (
          <Pressable
            key={`${segment.id}-${segment.startSeconds}`}
            onPress={() => onSeek(segment.startSeconds)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                direction: "ltr",
                // rowDirection is hardcoded "row" app-wide → drive the flip off RTL
                // so the thumbnail sits far-right in Arabic, play icon far-left.
                flexDirection: isRTL ? "row-reverse" : "row",
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            {segment.thumbnailUrl ? (
              <Image source={{ uri: segment.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Feather name="play" size={15} color="#fff" />
              </View>
            )}
            <View style={styles.body}>
              <Text
                style={[styles.title, { color: colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
                numberOfLines={1}
              >
                {localizeAcademicText(segment.title, language, segment.titleEn)}
              </Text>
              <Text
                style={[styles.meta, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
                numberOfLines={1}
              >
                {label(segment.segmentType)} · {fmtTime(segment.startSeconds)}
              </Text>
            </View>
            <Feather name="play-circle" size={20} color={COLORS.primary} />
          </Pressable>
        ))}
      </View>
    </CollapsibleCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
  },
  thumb: { width: 64, height: 40, borderRadius: 10, backgroundColor: "#111827" },
  thumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  body: { flex: 1, minWidth: 0 },
  title: { ...FONT.bold, fontSize: 14, lineHeight: 21 },
  meta: { ...FONT.regular, fontSize: 12, lineHeight: 18, marginTop: 2 },
});
