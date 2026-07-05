import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { resolveMediaUrl } from "@/lib/media";
import { openFeedLesson, type FeedLesson } from "@/lib/homeFeed";

function SuggestionCard({ item }: { item: FeedLesson }) {
  const { colors, language, direction, textAlign } = usePreferences();
  const thumb = resolveMediaUrl(item.thumbnailUrl ?? item.posterUrl ?? undefined);
  const title = localizeAcademicText(item.lessonTitle, language, item.lessonTitleEn);
  const subject = localizeAcademicText(item.subjectName, language, item.subjectNameEn);
  const inProgress = item.progressRatio > 0.05 && item.progressRatio < 0.9;

  return (
    <Pressable
      onPress={() => openFeedLesson(item, { resume: inProgress })}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: COLORS.primary + "18", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="play" size={20} color={COLORS.primary} />
          </View>
        )}
        <View style={styles.playDot}>
          <Feather name="play" size={13} color="#fff" />
        </View>
        {inProgress ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, Math.round(item.progressRatio * 100))}%` }]} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.subject, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={1}>
        {subject}
      </Text>
    </Pressable>
  );
}

// v2 Phase 3 — the "مقترح ليك" horizontal rail. Hidden when there's nothing to suggest.
export function SuggestionsSection({ items }: { items: FeedLesson[] }) {
  const { strings, isRTL, direction, textAlign } = usePreferences();
  if (!items.length) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <View style={[styles.header, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
        <Text style={[styles.headerTitle, { textAlign, writingDirection: direction }]}>{strings.home.suggestedTitle}</Text>
        <Text style={[styles.headerSub, { textAlign, writingDirection: direction }]} numberOfLines={1}>
          {strings.home.suggestedSubtitle}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Physical LTR so the rail always scrolls the same way; first item sits at the
        // start edge in both languages via the row direction.
        style={{ direction: "ltr" }}
        contentContainerStyle={[styles.rail, { flexDirection: isRTL ? "row-reverse" : "row" }]}
      >
        {items.map((it) => (
          <SuggestionCard key={`${it.lessonId}-${it.reason ?? ""}`} item={it} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 12 },
  headerTitle: { ...FONT.bold, fontSize: 19, color: "#0F172A" },
  headerSub: { ...FONT.regular, fontSize: 12.5, color: "#64748B", marginTop: 2 },
  rail: { gap: 12, paddingBottom: 4 },
  card: { width: 164, borderRadius: 16, borderWidth: 1, padding: 8, gap: 7 },
  thumbWrap: { width: "100%", height: 96, borderRadius: 11, overflow: "hidden", position: "relative" },
  thumb: { width: "100%", height: "100%" },
  playDot: { position: "absolute", top: 7, left: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(15,23,42,0.55)", alignItems: "center", justifyContent: "center" },
  progressTrack: { position: "absolute", bottom: 0, left: 0, right: 0, height: 4, backgroundColor: "rgba(15,23,42,0.35)" },
  progressFill: { height: "100%", backgroundColor: COLORS.primary },
  title: { ...FONT.bold, fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
  subject: { ...FONT.regular, fontSize: 11.5, paddingHorizontal: 2 },
});
