import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { localizeAcademicText } from "@/lib/academicContentLocalization";
import { toEnglishDigits } from "@/lib/format";
import { fetchProgress, progressQueryKey } from "@/lib/engagement";

function formatHours(sec: number, en: boolean): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return en ? `${toEnglishDigits(String(h))}h ${toEnglishDigits(String(m))}m` : `${toEnglishDigits(String(h))} س ${toEnglishDigits(String(m))} د`;
  return en ? `${toEnglishDigits(String(m))}m` : `${toEnglishDigits(String(m))} دقيقة`;
}

export default function ProgressScreen() {
  const { token } = useAuth();
  const { colors, resolvedScheme, language, direction, textAlign, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: progressQueryKey,
    queryFn: () => fetchProgress(token),
    enabled: !!token,
  });
  useRefetchOnFocus(refetch);

  const overallPct = Math.round((data?.totals.progressRatio ?? 0) * 100);

  const StatChip = ({ icon, value, label, tint }: { icon: any; value: string; label: string; tint: string }) => (
    <View style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.chipIcon, { backgroundColor: tint + "1A" }]}>
        <Feather name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.chipValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.chipLabel, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={resolvedScheme === "dark" ? ["#000", "#000", "#000"] : ["#EEF5FF", "#F7FAFF", "#F3F0FF"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, flexDirection: en ? "row" : "row-reverse" }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border, flexDirection: en ? "row" : "row-reverse" }]}>
          <Feather name={en ? "arrow-left" : "arrow-right"} size={19} color={colors.textSecondary} />
          <Text style={[styles.backText, { color: colors.text }]}>{en ? "Settings" : "الإعدادات"}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
          {en ? "My progress" : "تقدّمي"}
        </Text>
      </View>

      {isLoading || !data ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
          {/* streak + points + exams */}
          <View style={[styles.chipRow, { flexDirection: en ? "row" : "row-reverse" }]}>
            <StatChip icon="zap" tint="#F59E0B" value={toEnglishDigits(String(data.streak.current))} label={en ? "day streak" : "أيام متتالية"} />
            <StatChip icon="award" tint="#7C3AED" value={toEnglishDigits(String(data.points.balance))} label={en ? "points" : "نقطة"} />
            {data.exams.attempts > 0 ? (
              <StatChip icon="check-circle" tint="#059669" value={`${toEnglishDigits(String(data.exams.averagePercent))}%`} label={en ? "exam avg" : "متوسط الاختبارات"} />
            ) : null}
          </View>

          {/* overall */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text, textAlign, writingDirection: direction }]}>{en ? "Overall progress" : "الإنجاز العام"}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(2, overallPct)}%`, backgroundColor: COLORS.primary }]} />
            </View>
            <Text style={[styles.cardMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {en
                ? `${toEnglishDigits(String(overallPct))}% · ${toEnglishDigits(String(data.totals.completedLessons))}/${toEnglishDigits(String(data.totals.lessonCount))} lessons · ${formatHours(data.totals.watchedSeconds, en)} studied`
                : `${toEnglishDigits(String(overallPct))}٪ · ${toEnglishDigits(String(data.totals.completedLessons))} من ${toEnglishDigits(String(data.totals.lessonCount))} درس · ${formatHours(data.totals.watchedSeconds, en)} مذاكرة`}
            </Text>
          </View>

          {/* per-subject */}
          {data.subjects.length > 0 ? (
            <Text style={[styles.section, { color: colors.text, textAlign, writingDirection: direction }]}>{en ? "Your subjects" : "تقدّمك في المواد"}</Text>
          ) : null}
          {data.subjects.map((s) => {
            const pct = Math.round(s.progressRatio * 100);
            return (
              <View key={s.subjectId} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.subjRow, { direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
                  <Text style={styles.subjIcon}>{s.icon || "📚"}</Text>
                  <Text style={[styles.subjName, { color: colors.text, flex: 1, textAlign, writingDirection: direction }]} numberOfLines={1}>
                    {localizeAcademicText(s.subjectName, language, s.subjectNameEn)}
                  </Text>
                  <Text style={[styles.subjPct, { color: COLORS.primary }]}>{toEnglishDigits(String(pct))}%</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: COLORS.primary }]} />
                </View>
                <Text style={[styles.cardMeta, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {en
                    ? `${toEnglishDigits(String(s.completedLessons))}/${toEnglishDigits(String(s.lessonCount))} lessons · ${formatHours(s.watchedSeconds, en)}`
                    : `${toEnglishDigits(String(s.completedLessons))} من ${toEnglishDigits(String(s.lessonCount))} درس · ${formatHours(s.watchedSeconds, en)}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, alignItems: "center", gap: 12 },
  backBtn: { minHeight: 38, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", gap: 7 },
  backText: { ...FONT.bold, fontSize: 14 },
  headerTitle: { ...FONT.bold, fontSize: 18, flex: 1 },
  chipRow: { gap: 10 },
  chip: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: "center", gap: 5 },
  chipIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  chipValue: { ...FONT.bold, fontSize: 19 },
  chipLabel: { ...FONT.regular, fontSize: 11 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 9 },
  cardTitle: { ...FONT.bold, fontSize: 15 },
  cardMeta: { ...FONT.regular, fontSize: 12 },
  track: { height: 8, borderRadius: 5, backgroundColor: "rgba(120,140,170,0.22)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
  section: { ...FONT.bold, fontSize: 16, marginTop: 4 },
  subjRow: { alignItems: "center", gap: 9 },
  subjIcon: { fontSize: 20 },
  subjName: { ...FONT.bold, fontSize: 14 },
  subjPct: { ...FONT.bold, fontSize: 14 },
});
