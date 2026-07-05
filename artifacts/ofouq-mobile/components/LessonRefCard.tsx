import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { resolveMediaUrl } from "@/lib/media";
import { openLessonRef, type LessonRef } from "@/lib/engagement";
import { BookmarkStar } from "@/components/BookmarkStar";

// v2 Phase 4 — a compact lesson row used in the Saved list and Search results.
export function LessonRefCard({ item, showStar }: { item: LessonRef; showStar?: boolean }) {
  const { colors, language, direction, textAlign, isRTL } = usePreferences();
  const en = language === "en";
  const thumb = resolveMediaUrl(item.thumbnailUrl ?? item.posterUrl ?? undefined);
  const title = localizeAcademicText(item.lessonTitle, language, item.lessonTitleEn);
  const subject = localizeAcademicText(item.subjectName, language, item.subjectNameEn);
  const unit = localizeAcademicText(item.unitName, language, item.unitNameEn);

  return (
    <Pressable
      onPress={() => openLessonRef(item)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, direction: "ltr", flexDirection: en ? "row" : "row-reverse", opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: COLORS.primary + "18", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="play" size={18} color={COLORS.primary} />
          </View>
        )}
        <View style={styles.playDot}>
          <Feather name="play" size={12} color="#fff" />
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
          {subject} · {unit}
        </Text>
      </View>

      {showStar ? <BookmarkStar lessonId={item.lessonId} size={20} /> : (
        <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 10 },
  thumbWrap: { width: 78, height: 58, borderRadius: 11, overflow: "hidden", position: "relative" },
  thumb: { width: "100%", height: "100%" },
  playDot: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(15,23,42,0.55)", alignItems: "center", justifyContent: "center" },
  title: { ...FONT.bold, fontSize: 13.5, lineHeight: 19 },
  meta: { ...FONT.regular, fontSize: 11.5, marginTop: 2 },
});
