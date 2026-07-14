import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FONT } from "@/constants/typography";
import { usePreferences } from "@/contexts/PreferencesContext";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import { openFeedLesson, type FeedLesson } from "@/lib/homeFeed";

// v2 Phase 3 — the big "continue where you left off" card at the very top of home.
// `mode="continue"` shows the resume thumbnail + progress; `mode="start"` is the
// brand-new-student "start your journey" variant (no progress).
export function ContinueLessonCard({ item, mode }: { item: FeedLesson; mode: "continue" | "start" }) {
  const { strings, language, direction } = usePreferences();
  const en = language === "en";
  const row = en ? "row" : "row-reverse";
  const align = en ? "left" : "right";

  const title = localizeAcademicText(item.lessonTitle, language, item.lessonTitleEn);
  const subject = localizeAcademicText(item.subjectName, language, item.subjectNameEn);
  const unit = localizeAcademicText(item.unitName, language, item.unitNameEn);
  const thumb = resolveMediaUrl(item.thumbnailUrl ?? item.posterUrl ?? undefined);
  const percent = Math.round(Math.min(1, Math.max(0, item.progressRatio)) * 100);
  const progressLabel = (strings.home.lessonProgress ?? "{percent}%").replace("{percent}", toEnglishDigits(String(percent)));

  return (
    <Pressable
      onPress={() => openFeedLesson(item, { resume: mode === "continue" })}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <LinearGradient colors={["#1D4ED8", "#2563EB", "#0EA5E9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={[styles.rowTop, { direction: "ltr", flexDirection: row }]}>
          {/* thumbnail with a play overlay */}
          <View style={styles.thumbWrap}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]} />
            )}
            <View style={styles.playBadge}>
              <Feather name="play" size={18} color="#1D4ED8" />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <View style={[styles.badge, { alignSelf: en ? "flex-start" : "flex-end", flexDirection: row }]}>
              <Feather name={mode === "continue" ? "play-circle" : "compass"} size={13} color="#DBEAFE" />
              <Text style={[styles.badgeText, { writingDirection: direction }]}>
                {mode === "continue" ? strings.home.continueTitle : strings.home.startJourneyTitle}
              </Text>
            </View>
            <Text style={[styles.title, { textAlign: align, writingDirection: direction }]} numberOfLines={2}>
              {mode === "continue" ? title : strings.home.startJourneyBody}
            </Text>
            <Text style={[styles.meta, { textAlign: align, writingDirection: direction }]} numberOfLines={1}>
              {mode === "continue" ? `${subject} · ${unit}` : title}
            </Text>
          </View>
        </View>

        {mode === "continue" ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, percent)}%` }]} />
            </View>
            <View style={[styles.progressLabelRow, { direction: "ltr", flexDirection: row }]}>
              <Text style={[styles.progressText, { writingDirection: direction }]}>{progressLabel}</Text>
              {/* Physical order: Arabic → arrow (◄) sits to the LEFT of the text; English
                  → arrow (►) to the right. direction:"ltr" pins it on every device. */}
              <View style={[styles.resumeChip, { direction: "ltr", flexDirection: en ? "row-reverse" : "row" }]}>
                <Feather name={en ? "arrow-right" : "arrow-left"} size={13} color="#1D4ED8" />
                <Text style={[styles.resumeText, { writingDirection: direction }]}>{strings.home.continueResume}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.startCta, { alignSelf: en ? "flex-start" : "flex-end", flexDirection: row }]}>
            <Text style={[styles.resumeText, { writingDirection: direction }]}>{strings.home.startJourneyCta}</Text>
            <Feather name={en ? "arrow-right" : "arrow-left"} size={14} color="#1D4ED8" />
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: { borderRadius: 22, padding: 15, shadowColor: "#2563EB", shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  rowTop: { alignItems: "center", gap: 13 },
  thumbWrap: { width: 92, height: 68, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  thumb: { width: "100%", height: "100%" },
  thumbFallback: { backgroundColor: "rgba(255,255,255,0.18)" },
  playBadge: { position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" },
  badge: { alignItems: "center", gap: 5, marginBottom: 5 },
  badgeText: { ...FONT.bold, fontSize: 11.5, color: "#DBEAFE" },
  title: { ...FONT.bold, fontSize: 15.5, color: "#fff", lineHeight: 22 },
  meta: { ...FONT.regular, fontSize: 12, color: "#DBEAFE", marginTop: 3 },
  progressRow: { marginTop: 13, gap: 8 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, backgroundColor: "#fff" },
  progressLabelRow: { alignItems: "center", justifyContent: "space-between" },
  progressText: { ...FONT.bold, fontSize: 12, color: "#EFF6FF" },
  resumeChip: { alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  resumeText: { ...FONT.bold, fontSize: 12.5, color: "#1D4ED8" },
  startCta: { alignItems: "center", gap: 6, marginTop: 13, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
});
