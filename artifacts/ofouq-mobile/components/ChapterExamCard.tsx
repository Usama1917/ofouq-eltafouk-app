import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

interface ExamInfo {
  available: boolean;
  timerMinutes: number;
  points: number;
  level: "beginner" | "intermediate" | "advanced" | "unrated";
  review: { available: boolean; count: number; mistakeCount: number; totalChapterQuestions: number; lastPercent: number | null };
  adaptive: { available: boolean; count: number; bankSize: number; lastPercent: number | null };
}

export function chapterExamInfoKey(unitId: number | null | undefined) {
  return ["chapter-exam", "info", unitId] as const;
}

// v2 Phase 2 — the end-of-chapter EXAM card. A distinct, "exam-day" indigo card that
// sits after the last lesson of a chapter. Hidden until the admin publishes the exam
// (or if the student has no access). Holds two entries: راجع أخطاءك + امتحان الفصل.
export function ChapterExamCard({ unitId, unitName }: { unitId: number; unitName?: string | null }) {
  const { token } = useAuth();
  const { colors, language, direction } = usePreferences();
  const en = language === "en";

  const { data } = useQuery<ExamInfo>({
    queryKey: chapterExamInfoKey(unitId),
    queryFn: () => apiFetch<ExamInfo>(`/api/units/${unitId}/exam/info`, { token }),
    enabled: !!token && !!unitId,
  });

  if (!data || !data.available) return null;
  const canReview = data.review.available;
  const canAdaptive = data.adaptive.available;
  if (!canReview && !canAdaptive) return null;

  const title = unitName ? (en ? `Exam · ${unitName}` : `امتحان · ${unitName}`) : en ? "Chapter exam" : "امتحان الفصل";

  const go = (kind: "unit-review" | "unit-adaptive") => {
    router.push({
      pathname: "/quiz",
      params: {
        examKind: kind,
        unitId: String(unitId),
        examTitle:
          kind === "unit-review"
            ? en
              ? "Catch-up exam"
              : "امتحان الاستدراك"
            : en
              ? "Your own challenge"
              : "تحديك الخاص",
      },
    } as any);
  };

  return (
    <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={[styles.headerRow, { direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
        <View style={styles.iconBadge}>
          <Feather name="award" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { textAlign: en ? "left" : "right", writingDirection: direction }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { textAlign: en ? "left" : "right", writingDirection: direction }]}>
            {en ? "Test yourself on the whole chapter" : "اختبر نفسك على الفصل كله"}
          </Text>
        </View>
      </View>

      <View style={{ gap: 9, marginTop: 13 }}>
        {canReview ? (
          <Pressable onPress={() => go("unit-review")} style={({ pressed }) => [styles.btn, styles.btnLight, { opacity: pressed ? 0.85 : 1, direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
            <Feather name="refresh-ccw" size={16} color="#4F46E5" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.btnTitle, { color: "#312E81", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en ? "Catch-up exam" : "امتحان الاستدراك"}
              </Text>
              <Text style={[styles.btnMeta, { color: "#4338CA", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en ? "We focused on the points that need another try." : "ركزنا لك على النقط اللي محتاجة محاولة تانية."}
              </Text>
              <Text style={[styles.btnStat, { color: "#6366F1", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en
                  ? `${toEnglishDigits(String(data.review.count))} questions · instant feedback`
                  : `${toEnglishDigits(String(data.review.count))} سؤال · تصحيح فوري`}
              </Text>
            </View>
            <Feather name={en ? "chevron-right" : "chevron-left"} size={18} color="#4F46E5" />
          </Pressable>
        ) : null}

        {canAdaptive ? (
          <Pressable onPress={() => go("unit-adaptive")} style={({ pressed }) => [styles.btn, styles.btnSolid, { opacity: pressed ? 0.85 : 1, direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
            <Feather name="edit-3" size={16} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.btnTitle, { color: "#fff", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en ? "Your own challenge" : "تحديك الخاص"}
              </Text>
              <Text style={[styles.btnMeta, { color: "#EDE9FE", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en ? "Questions picked for your level." : "أسئلة اختيرت بناءً على مستواك."}
              </Text>
              <Text style={[styles.btnStat, { color: "#C7D2FE", textAlign: en ? "left" : "right", writingDirection: direction }]}>
                {en
                  ? `${toEnglishDigits(String(data.adaptive.count))} questions${data.timerMinutes > 0 ? ` · ${toEnglishDigits(String(data.timerMinutes))} min` : ""} · +${toEnglishDigits(String(data.points))} pts`
                  : `${toEnglishDigits(String(data.adaptive.count))} سؤال${data.timerMinutes > 0 ? ` · ${toEnglishDigits(String(data.timerMinutes))} دقيقة` : ""} · +${toEnglishDigits(String(data.points))} نقطة`}
              </Text>
            </View>
            <Feather name={en ? "chevron-right" : "chevron-left"} size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, shadowColor: "#4F46E5", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  headerRow: { alignItems: "center", gap: 12 },
  iconBadge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  title: { ...FONT.bold, fontSize: 16, color: "#fff", lineHeight: 23 },
  subtitle: { ...FONT.regular, fontSize: 12.5, color: "#E0E7FF", lineHeight: 18, marginTop: 1 },
  btn: { alignItems: "center", gap: 10, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12 },
  btnLight: { backgroundColor: "rgba(255,255,255,0.94)" },
  btnSolid: { backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  btnTitle: { ...FONT.bold, fontSize: 14, lineHeight: 20 },
  btnMeta: { ...FONT.regular, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  btnStat: { ...FONT.regular, fontSize: 10.5, lineHeight: 14, marginTop: 2, opacity: 0.95 },
});
