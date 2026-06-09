import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

type QuestionKey =
  | "heardAboutUs"
  | "gradeLevel"
  | "interestedSubjects"
  | "mainGoal"
  | "currentLevel"
  | "learningPreference"
  | "preferredStudyTime";

type QuestionDef = { key: QuestionKey; type: "single" | "multi"; options: string[] };

// Question order + the STABLE option keys. Labels come from i18n (ar/en).
const QUESTIONS: QuestionDef[] = [
  { key: "heardAboutUs", type: "single", options: ["facebook", "instagram", "tiktok", "youtube", "friend", "teacher", "sponsored_ad", "google", "other"] },
  { key: "gradeLevel", type: "single", options: ["secondary_1", "secondary_2", "secondary_3"] },
  { key: "interestedSubjects", type: "multi", options: ["physics", "chemistry", "biology"] },
  { key: "mainGoal", type: "single", options: ["follow_lessons", "more_exercises", "exam_review", "improve_level", "catch_up", "organize_study"] },
  { key: "currentLevel", type: "single", options: ["excellent", "good", "average", "need_help"] },
  { key: "learningPreference", type: "single", options: ["short_videos", "detailed_long", "summaries", "questions_exercises", "live_sessions", "mix"] },
  { key: "preferredStudyTime", type: "single", options: ["morning", "afternoon", "evening", "night", "not_sure"] },
];

export function onboardingDoneKey(userId: number | string) {
  return `ofouq_onboarding_done_${userId}`;
}

export default function OnboardingScreen() {
  const { colors, resolvedScheme, strings, isRTL, textAlign, direction, rowDirection } = usePreferences();
  const { token, user, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === "dark";
  const tr = strings.onboarding;

  const [index, setIndex] = useState(0);
  const [single, setSingle] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Guard: this screen is student-only and requires auth.
  useEffect(() => {
    if (!token || (user && user.role !== "student")) {
      router.replace("/(tabs)");
    }
  }, [token, user]);

  const question = QUESTIONS[index];
  const isMulti = question.type === "multi";
  const total = QUESTIONS.length;
  const isLast = index === total - 1;
  const progress = (index + 1) / total;

  const questionStrings = (tr.questions as Record<string, { title: string; options: Record<string, string> }>)[question.key];
  const answered = isMulti ? subjects.length > 0 : Boolean(single[question.key]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  function animateTo(nextIndex: number) {
    const forward = nextIndex > index;
    const startOffset = (forward ? 26 : -26) * (isRTL ? -1 : 1);
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setIndex(nextIndex);
      setError("");
      slide.setValue(startOffset);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 5 }),
      ]).start();
    });
  }

  function haptic() {
    void Haptics.selectionAsync().catch(() => undefined);
  }

  function chooseSingle(value: string) {
    haptic();
    setSingle((prev) => ({ ...prev, [question.key]: value }));
  }

  function toggleSubject(value: string) {
    haptic();
    setSubjects((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  }

  function goNext() {
    if (!answered) return;
    animateTo(index + 1);
  }

  function goBack() {
    if (index === 0) return;
    animateTo(index - 1);
  }

  async function finish() {
    if (!answered || submitting || !token) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/student/onboarding", {
        method: "POST",
        token,
        body: JSON.stringify({
          heardAboutUs: single.heardAboutUs,
          gradeLevel: single.gradeLevel,
          interestedSubjects: subjects,
          mainGoal: single.mainGoal,
          currentLevel: single.currentLevel,
          learningPreference: single.learningPreference,
          preferredStudyTime: single.preferredStudyTime,
        }),
      });
      if (user) {
        await AsyncStorage.setItem(onboardingDoneKey(user.id), "1").catch(() => undefined);
        updateUser({ ...user, onboardingCompleted: true });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err?.message || tr.submitError);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  }

  const optionRows = useMemo(() => {
    return question.options.map((optionKey) => {
      const selected = isMulti ? subjects.includes(optionKey) : single[question.key] === optionKey;
      return { optionKey, label: questionStrings?.options?.[optionKey] ?? optionKey, selected };
    });
  }, [question, isMulti, subjects, single, questionStrings]);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
      <LinearGradient
        colors={isDark ? ["#000000", "#05070D", "#000000"] : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header: brand + progress */}
      <View style={styles.header}>
        <View style={[styles.brandRow, { flexDirection: rowDirection, direction }]}>
          <View style={styles.brandBadge}>
            <Feather name="award" size={18} color="#fff" />
          </View>
          <View style={[styles.brandText, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.brandTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
              {tr.welcomeTitle}
            </Text>
            <Text style={[styles.brandSubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]} numberOfLines={2}>
              {tr.welcomeSubtitle}
            </Text>
          </View>
        </View>

        <View style={[styles.progressRow, { flexDirection: rowDirection, direction }]}>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.08)" }]}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
            {`${tr.questionLabel} ${toEnglishDigits(String(index + 1))} ${tr.ofLabel} ${toEnglishDigits(String(total))}`}
          </Text>
        </View>
      </View>

      {/* Question + options */}
      <Animated.View style={[styles.body, { opacity: fade, transform: [{ translateX: slide }] }]}>
        <Text style={[styles.questionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
          {questionStrings?.title}
        </Text>
        {isMulti ? (
          <Text style={[styles.multiHint, { color: colors.textTertiary, textAlign, writingDirection: direction }]}>
            {tr.multiHint}
          </Text>
        ) : null}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 12, paddingTop: 6 }}
          style={styles.optionsScroll}
        >
          {optionRows.map(({ optionKey, label, selected }) => (
            <Pressable
              key={optionKey}
              onPress={() => (isMulti ? toggleSubject(optionKey) : chooseSingle(optionKey))}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  flexDirection: rowDirection,
                  direction,
                  backgroundColor: selected ? COLORS.primary + (isDark ? "26" : "14") : colors.card,
                  borderColor: selected ? COLORS.primary : colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <View
                style={[
                  isMulti ? styles.checkBox : styles.radio,
                  {
                    borderColor: selected ? COLORS.primary : colors.border,
                    backgroundColor: selected ? COLORS.primary : "transparent",
                  },
                ]}
              >
                {selected ? <Feather name="check" size={13} color="#fff" /> : null}
              </View>
              <Text
                style={[
                  styles.optionLabel,
                  { color: selected ? COLORS.primary : colors.text, textAlign, writingDirection: direction },
                ]}
                numberOfLines={2}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: isDark ? "rgba(239,68,68,0.16)" : "#FFF1F2", borderColor: isDark ? "rgba(248,113,113,0.34)" : "#FECDD3" }]}>
          <Text style={[styles.errorText, { textAlign, writingDirection: direction }]}>{error}</Text>
        </View>
      ) : null}

      {/* Footer: back + next/finish */}
      <View style={[styles.footer, { flexDirection: rowDirection, direction }]}>
        {index > 0 ? (
          <Pressable
            onPress={goBack}
            disabled={submitting}
            style={({ pressed }) => [
              styles.backButton,
              { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : colors.card, opacity: submitting ? 0.5 : 1 },
            ]}
          >
            <Text style={[styles.backText, { color: colors.text, writingDirection: direction }]}>{tr.back}</Text>
          </Pressable>
        ) : (
          <View style={styles.footerSpacer} />
        )}

        <Pressable
          onPress={isLast ? finish : goNext}
          disabled={!answered || submitting}
          style={({ pressed }) => [
            styles.nextButton,
            { backgroundColor: COLORS.primary, opacity: !answered || submitting ? 0.5 : pressed ? 0.9 : 1 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextText}>{isLast ? tr.finish : tr.next}</Text>
              <Feather name={isLast ? "check" : isRTL ? "arrow-left" : "arrow-right"} size={17} color="#fff" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  header: { gap: 16, paddingTop: 6 },
  brandRow: { alignItems: "center", gap: 12 },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  brandText: { flex: 1, minWidth: 0 },
  brandTitle: { ...FONT.bold, fontSize: 18, lineHeight: 26 },
  brandSubtitle: { ...FONT.regular, fontSize: 13, lineHeight: 20, marginTop: 2 },
  progressRow: { alignItems: "center", gap: 12 },
  progressTrack: { flex: 1, height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 999, backgroundColor: COLORS.primary },
  progressLabel: { ...FONT.semiBold, fontSize: 12, writingDirection: "ltr" },
  body: { flex: 1, marginTop: 22 },
  questionTitle: { ...FONT.bold, fontSize: 23, lineHeight: 34 },
  multiHint: { ...FONT.regular, fontSize: 13, marginTop: 6 },
  optionsScroll: { flex: 1, marginTop: 14 },
  optionCard: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 15,
    paddingVertical: 12,
    alignItems: "center",
    gap: 13,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { flex: 1, ...FONT.bold, fontSize: 15, lineHeight: 22 },
  errorBox: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  errorText: { ...FONT.semiBold, fontSize: 13, lineHeight: 20, color: "#BE123C" },
  footer: { alignItems: "center", gap: 12, paddingTop: 6 },
  footerSpacer: { width: 0 },
  backButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { ...FONT.bold, fontSize: 15 },
  nextButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  nextText: { ...FONT.bold, fontSize: 16, color: "#fff" },
});
