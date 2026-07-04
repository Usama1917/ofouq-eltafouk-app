import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

export interface QuizInfo {
  available: boolean;
  hasAccess: boolean;
  questionCount: number;
  bankSize: number;
  maxPoints: number;
  attemptsCount: number;
  lastAttempt: {
    id: number;
    score: number;
    total: number;
    percent: number;
    pointsAwarded: number;
    createdAt: string;
  } | null;
  // v2 Phase 2 — watch-gate: the quiz stays locked until the student has really
  // watched `requiredPercent`% of the video (playback coverage; seeking never counts).
  watchGate?: {
    enabled: boolean;
    requiredPercent: number;
    watchedPercent: number;
    watchedEnough: boolean;
  };
}

export function quizInfoQueryKey(videoId: number | null | undefined, token: string | null | undefined) {
  return ["quiz", "info", videoId, token] as const;
}

// v2 Phase 2 — the quiz entry card on the lesson screen. Sits between the lesson
// summary (description) and the segments list. Hidden entirely when the video has no
// published questions, or when the student isn't subscribed (quizzes are subscribers-
// only). After the first attempt it shows the LAST attempt's score + a re-take hint.
export function QuizLessonCard({ videoId, videoTitle }: { videoId: number; videoTitle?: string | null }) {
  const { token } = useAuth();
  const { colors, language, isRTL, direction } = usePreferences();
  const en = language === "en";

  const { data } = useQuery<QuizInfo>({
    queryKey: quizInfoQueryKey(videoId, token),
    queryFn: () => apiFetch<QuizInfo>(`/api/videos/${videoId}/quiz/info`, { token }),
    enabled: !!token && !!videoId,
    // While the quiz is watch-locked, re-poll so the card unlocks itself shortly after
    // the student crosses the required watch time (progress is reported every ~15s).
    refetchInterval: (query) => {
      const g = query.state.data?.watchGate;
      return g?.enabled && !g.watchedEnough ? 10000 : false;
    },
  });

  // Hide the card unless there's a published quiz AND the student can take it.
  if (!data || !data.available || !data.hasAccess) return null;

  // Watch-gate: if the student hasn't watched enough of the video yet, show a LOCKED
  // card (no quiz entry) with how much more they need to watch.
  const gate = data.watchGate;
  if (gate?.enabled && !gate.watchedEnough) {
    const unlockProgress = gate.requiredPercent > 0 ? Math.min(100, Math.round((gate.watchedPercent / gate.requiredPercent) * 100)) : 0;
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.mainRow, { direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
          <View style={[styles.iconBadge, { backgroundColor: "#F59E0B1A" }]}>
            <Feather name="lock" size={20} color="#D97706" />
          </View>
          <View style={[styles.textBlock, { alignItems: en ? "flex-start" : "flex-end" }]}>
            <Text style={[styles.title, { color: colors.text, textAlign: en ? "left" : "right", writingDirection: direction }]}>
              {en ? "Quiz locked" : "الاختبار مقفول"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: en ? "left" : "right", writingDirection: direction }]}>
              {en
                ? `Watch ${toEnglishDigits(String(gate.requiredPercent))}% of the video to unlock  ·  watched ${toEnglishDigits(String(gate.watchedPercent))}%`
                : `اتفرّج على ${toEnglishDigits(String(gate.requiredPercent))}٪ من الفيديو عشان يتفتح  ·  شُفت ${toEnglishDigits(String(gate.watchedPercent))}٪`}
            </Text>
          </View>
        </View>
        <View style={[styles.gateTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.gateFill, { width: `${unlockProgress}%` }]} />
        </View>
      </View>
    );
  }

  const last = data.lastAttempt;
  const rowDirection = isRTL ? "row-reverse" : "row";

  const goToQuiz = (mode?: "history") => {
    router.push({
      pathname: "/quiz",
      params: {
        videoId: String(videoId),
        videoTitle: videoTitle ?? "",
        ...(mode ? { mode } : {}),
      },
    } as any);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        onPress={() => goToQuiz()}
        // Keep a RELIABLE LTR base direction and flip the ROW instead (driven by `en`, the
        // app language, not the unreliable `isRTL`). Arabic → row-reverse → icon far right,
        // text block next to it, score pill far left.
        style={({ pressed }) => [styles.mainRow, { direction: "ltr", flexDirection: en ? "row" : "row-reverse", opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={styles.iconBadge}>
          <Text style={styles.iconEmoji}>📝</Text>
        </View>

        <View style={[styles.textBlock, { alignItems: en ? "flex-start" : "flex-end" }]}>
          <Text style={[styles.title, { color: colors.text, textAlign: en ? "left" : "right", writingDirection: direction }]}>
            {en ? "Lesson quiz" : "اختبار الدرس"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: en ? "left" : "right", writingDirection: direction }]}>
            {last
              ? en
                ? `Your score: ${toEnglishDigits(String(last.percent))}%  ·  tap to retry`
                : `نتيجتك: ${toEnglishDigits(String(last.percent))}٪  ·  اضغط للإعادة`
              : en
                ? `${toEnglishDigits(String(data.questionCount))} questions  ·  +${toEnglishDigits(String(data.maxPoints))} points`
                : `${toEnglishDigits(String(data.questionCount))} أسئلة  ·  +${toEnglishDigits(String(data.maxPoints))} نقطة`}
          </Text>
        </View>

        {last ? (
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{toEnglishDigits(String(last.percent))}٪</Text>
          </View>
        ) : (
          <View style={[styles.startBtn, { flexDirection: rowDirection }]}>
            <Text style={styles.startBtnText}>{en ? "Start" : "ابدأ"}</Text>
            <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={16} color="#fff" />
          </View>
        )}
      </Pressable>

      {last && data.attemptsCount > 0 ? (
        <Pressable
          onPress={() => goToQuiz("history")}
          style={({ pressed }) => [styles.historyRow, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="clock" size={13} color={colors.textSecondary} />
          <Text style={[styles.historyText, { color: colors.textSecondary }]}>
            {en
              ? `All attempts (${toEnglishDigits(String(data.attemptsCount))})`
              : `كل المحاولات (${toEnglishDigits(String(data.attemptsCount))})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mainRow: {
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "14",
  },
  iconEmoji: { fontSize: 22 },
  textBlock: { flex: 1, gap: 3 },
  title: { ...FONT.bold, fontSize: 15, lineHeight: 22 },
  subtitle: { ...FONT.regular, fontSize: 12.5, lineHeight: 18 },
  startBtn: {
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  startBtnText: { ...FONT.bold, fontSize: 13, color: "#fff" },
  scorePill: {
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 52,
    alignItems: "center",
  },
  scorePillText: { ...FONT.bold, fontSize: 14, color: "#fff" },
  gateTrack: {
    marginTop: 11,
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  gateFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#F59E0B",
  },
  historyRow: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  historyText: { ...FONT.semiBold, fontSize: 12 },
});
