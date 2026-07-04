import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image as RNImage,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import { gamificationQueryKey } from "@/lib/gamification";
import { quizInfoQueryKey } from "@/components/QuizLessonCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const LETTERS = ["أ", "ب", "ج", "د", "هـ"];
const HPAD = 18;
// Every answer option is one image on a white card of this fixed height, so all four
// option cards are exactly the same size regardless of their picture's aspect ratio.
const OPTION_CARD_HEIGHT = 84;
// Width of the strip on the letter side reserved for the أ/ب/ج/د badge, so the option
// image never sits under it. The strip is the same white as the card (invisible), and the
// selection tint covers it too, so the reserved space isn't noticeable before OR after selecting.
const OPTION_LETTER_SLOT = 40;

// Question/option/explanation text may contain <sub>/<sup> formatting (chemical
// formulas etc.). We render sub/superscript using real Unicode glyphs where they exist
// (correct size + position — digits, signs, most letters) and fall back to a smaller
// font for the rare character that has no Unicode form. Plain text (no tags) renders
// unchanged.
const SUB_UNI: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};
const SUP_UNI: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ",
  A: "ᴬ", B: "ᴮ", D: "ᴰ", E: "ᴱ", G: "ᴳ", H: "ᴴ", I: "ᴵ", J: "ᴶ", K: "ᴷ", L: "ᴸ", M: "ᴹ", N: "ᴺ", O: "ᴼ", P: "ᴾ", R: "ᴿ", T: "ᵀ", U: "ᵁ", V: "ⱽ", W: "ᵂ",
};

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function toUnicodeScript(text: string, map: Record<string, string>): { str: string; full: boolean } {
  let full = true;
  const str = [...text]
    .map((c) => {
      const m = map[c];
      if (m === undefined && c.trim() !== "") full = false;
      return m ?? c;
    })
    .join("");
  return { str, full };
}
// Build the inline <Text> children for a chunk of formatted HTML (no <img>).
function buildInlineNodes(html: string, small: number): React.ReactNode[] {
  const stack = { bold: 0, italic: 0, underline: 0, strike: 0, sub: 0, sup: 0 };
  const nodes: React.ReactNode[] = [];
  let key = 0;
  const emitText = (raw: string) => {
    const text = decodeEntities(raw);
    if (!text) return;
    const s: TextStyle = {};
    if (stack.bold > 0) s.fontWeight = "bold";
    if (stack.italic > 0) s.fontStyle = "italic";
    if (stack.underline > 0 && stack.strike > 0) s.textDecorationLine = "underline line-through";
    else if (stack.underline > 0) s.textDecorationLine = "underline";
    else if (stack.strike > 0) s.textDecorationLine = "line-through";
    const script = stack.sub > 0 ? "sub" : stack.sup > 0 ? "sup" : "n";
    if (script !== "n") {
      const { str, full } = toUnicodeScript(text, script === "sub" ? SUB_UNI : SUP_UNI);
      if (full) {
        nodes.push(<Text key={key++} style={s}>{str}</Text>);
        return;
      }
      nodes.push(<Text key={key++} style={{ ...s, fontSize: small }}>{text}</Text>);
      return;
    }
    nodes.push(<Text key={key++} style={s}>{text}</Text>);
  };
  const re = /<[^>]+>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    emitText(html.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[0];
    const closing = /^<\s*\//.test(tag);
    const name = (tag.match(/^<\s*\/?\s*([a-z0-9]+)/i)?.[1] ?? "").toLowerCase();
    const d = closing ? -1 : 1;
    switch (name) {
      case "strong": case "b": stack.bold += d; break;
      case "em": case "i": stack.italic += d; break;
      case "u": stack.underline += d; break;
      case "s": case "strike": case "del": stack.strike += d; break;
      case "sub": stack.sub += d; break;
      case "sup": stack.sup += d; break;
      case "br": nodes.push(<Text key={key++}>{"\n"}</Text>); break;
      case "p": case "div": if (closing) nodes.push(<Text key={key++}>{"\n"}</Text>); break;
      case "li": nodes.push(<Text key={key++}>{closing ? "\n" : "•  "}</Text>); break;
      default: break;
    }
  }
  emitText(html.slice(last));
  while (nodes.length && (nodes[nodes.length - 1] as any)?.props?.children === "\n") nodes.pop();
  return nodes;
}

// An inline image (e.g. a screenshotted equation) sized to ~2 lines, keeping aspect ratio.
function InlineImage({ src, fontSize }: { src: string; fontSize: number }) {
  const uri = resolveMediaUrl(src) ?? "";
  const [ratio, setRatio] = useState(2.4);
  useEffect(() => {
    if (!uri) return;
    let ok = true;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (ok && h > 0) setRatio(w / h);
      },
      () => {},
    );
    return () => {
      ok = false;
    };
  }, [uri]);
  const h = Math.round(fontSize * 2.2);
  return <Image source={{ uri }} style={{ height: h, width: Math.round(h * ratio), marginHorizontal: 3, borderRadius: 4 }} contentFit="contain" />;
}

// A block image (a PDF screenshot of a question/option) shown full-width at its natural
// aspect ratio on a white backdrop, so it reads clearly and blends with the white card.
function AutoImage({ src, style, fill, contentPosition }: { src: string; style?: object; fill?: boolean; contentPosition?: "left" | "right" | "center" }) {
  const uri = resolveMediaUrl(src) ?? "";
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!uri) return;
    let ok = true;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (ok && h > 0) setRatio(w / h);
      },
      () => {},
    );
    return () => {
      ok = false;
    };
  }, [uri]);
  // Fill mode: the picture fits inside a fixed-size parent (the answer card), centered and
  // un-cropped, so every option card is the same height with the image flush to the edges.
  if (fill) {
    return <Image source={{ uri }} style={[StyleSheet.absoluteFillObject, { backgroundColor: "#FFFFFF" }, style as object]} contentFit="contain" contentPosition={contentPosition ?? "center"} />;
  }
  return (
    <Image
      source={{ uri }}
      style={[{ width: "100%", aspectRatio: ratio ?? 1.7, borderRadius: 10, backgroundColor: "#FFFFFF" }, style as object]}
      contentFit="contain"
    />
  );
}

// Render TipTap HTML (formatting, sub/sup, lists) as native <Text>, and lay out any
// inline <img> (equation/figure screenshots) inline via a wrapping row.
function RichText({ html, style }: { html: string | null | undefined; style?: TextStyle | TextStyle[] }) {
  if (!html) return null;
  if (!/[<&]/.test(html)) return <Text style={style}>{html}</Text>; // fast path: plain text
  const base = StyleSheet.flatten(style) as TextStyle | undefined;
  const small = Math.round(((base?.fontSize as number) ?? 14) * 0.72);
  if (!/<img/i.test(html)) {
    return <Text style={style}>{buildInlineNodes(html, small)}</Text>;
  }
  const isRTL = base?.writingDirection === "rtl" || base?.textAlign === "right";
  const fontSize = (base?.fontSize as number) ?? 15;
  const parts: React.ReactNode[] = [];
  const re = /<img[^>]*>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(html)) !== null) {
    const chunk = html.slice(last, m.index);
    if (chunk.trim()) parts.push(<Text key={`t${k++}`} style={style}>{buildInlineNodes(chunk, small)}</Text>);
    const srcM = m[0].match(/src="([^"]+)"/i) ?? m[0].match(/src='([^']+)'/i);
    if (srcM) parts.push(<InlineImage key={`i${k++}`} src={srcM[1]} fontSize={fontSize} />);
    last = re.lastIndex;
  }
  const tail = html.slice(last);
  if (tail.trim()) parts.push(<Text key={`t${k++}`} style={style}>{buildInlineNodes(tail, small)}</Text>);
  return <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", alignItems: "center" }}>{parts}</View>;
}

interface QuizTable {
  headerRow: boolean;
  cells: string[][];
}
interface OptionContent {
  key: number;
  kind: "text" | "image" | "table";
  text?: string | null;
  imageUrl?: string | null;
  table?: QuizTable | null;
}
interface QuizQuestion {
  id: number;
  text: string;
  imageUrl: string | null;
  table: QuizTable | null;
  options: OptionContent[];
}
interface QuizPayload {
  videoId?: number;
  unitId?: number;
  maxPoints?: number;
  // Exam reading direction, set once by the admin: "ar" (RTL) or "en" (LTR). Absent
  // for chapter exams → treated as Arabic/RTL.
  language?: string;
  // Chapter adaptive exam only: countdown minutes (0 = no timer).
  timerMinutes?: number;
  questions: QuizQuestion[];
}
interface ReviewItem {
  questionId: number;
  text: string;
  imageUrl: string | null;
  table: QuizTable | null;
  options: OptionContent[];
  chosenKey: number | null;
  correctKey: number;
  isCorrect: boolean;
  explanation: string | null;
}
interface SubmitResult {
  attemptId: number;
  score: number;
  total: number;
  percent: number;
  pointsAwarded: number;
  isFirstAttempt: boolean;
  streak: number;
  language: string;
  review: ReviewItem[];
}
interface AttemptRow {
  id: number;
  score: number;
  total: number;
  percent: number;
  pointsAwarded: number;
  createdAt: string;
}

function gradeBand(percent: number, en: boolean): { label: string; color: string } {
  if (percent >= 85) return { label: en ? "Excellent! 🌟" : "ممتاز! 🌟", color: "#059669" };
  if (percent >= 60) return { label: en ? "Good job 👍" : "كويس 👍", color: "#2563EB" };
  return { label: en ? "Review again 💪" : "راجع تاني 💪", color: "#D97706" };
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return toEnglishDigits(`${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}`);
}

// A quiz table rendered as a grid (Unicode cells preserve symbols/equations).
function TableView({ table, colors }: { table: QuizTable; colors: any }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" }}>
        {table.cells.map((row, r) => (
          <View key={r} style={{ flexDirection: "row" }}>
            {row.map((cell, c) => (
              <View
                key={c}
                style={{
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  minWidth: 84,
                  backgroundColor: table.headerRow && r === 0 ? colors.surfaceSecondary : "transparent",
                }}
              >
                <Text style={[{ color: colors.text, fontSize: 13 }, table.headerRow && r === 0 ? FONT.bold : FONT.regular]}>{cell}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// Renders one content item body (option or a shared block): text / image / table.
function ContentBody({ content, colors, textStyle, fill, contentPosition }: { content: { kind: string; text?: string | null; imageUrl?: string | null; table?: QuizTable | null }; colors: any; textStyle: TextStyle | TextStyle[]; fill?: boolean; contentPosition?: "left" | "right" | "center" }) {
  if (content.kind === "image" && content.imageUrl) {
    return <AutoImage src={content.imageUrl} fill={fill} contentPosition={contentPosition} />;
  }
  if (content.kind === "table" && content.table) {
    return <TableView table={content.table} colors={colors} />;
  }
  return <RichText html={content.text ?? ""} style={textStyle} />;
}

// The quiz is ALWAYS shown in light mode with pure-white cards — question/answer content
// is authored as screenshots from a PDF (white background), so a forced light template
// makes those images sit seamlessly regardless of the student's app theme.
const QUIZ_COLORS = {
  background: "#F4F7FD",
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  surfaceSecondary: "#F1F5F9",
};

export default function QuizScreen() {
  // The quiz chrome (background, header, buttons, results) follows the app theme; the
  // question/answer cards stay on QUIZ_COLORS (always white) because their content is
  // white-background PDF screenshots that must blend in either theme.
  const { language, isRTL, textAlign, direction, colors, resolvedScheme } = usePreferences();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const en = language === "en";

  const {
    videoId: videoIdParam,
    videoTitle,
    mode,
    examKind,
    unitId: unitIdParam,
    examTitle,
  } = useLocalSearchParams<{
    videoId?: string;
    videoTitle?: string;
    mode?: string;
    // "unit-review" (exam A) | "unit-adaptive" (exam B); absent = a normal video quiz.
    examKind?: string;
    unitId?: string;
    examTitle?: string;
  }>();
  const videoId = Number.parseInt(String(videoIdParam ?? ""), 10);
  const unitId = Number.parseInt(String(unitIdParam ?? ""), 10);
  const isHistory = mode === "history";
  const isReviewExam = examKind === "unit-review";
  const isAdaptiveExam = examKind === "unit-adaptive";
  const isUnitExam = isReviewExam || isAdaptiveExam;
  // Endpoint resolution: chapter exams reuse this whole screen, just different URLs.
  const takeUrl = isReviewExam
    ? `/api/units/${unitId}/exam/review`
    : isAdaptiveExam
      ? `/api/units/${unitId}/exam/adaptive`
      : `/api/videos/${videoId}/quiz`;
  const submitUrl = isReviewExam
    ? `/api/units/${unitId}/exam/review/submit`
    : isAdaptiveExam
      ? `/api/units/${unitId}/exam/adaptive/submit`
      : `/api/videos/${videoId}/quiz/submit`;
  const takeEnabled = isUnitExam ? Number.isFinite(unitId) : Number.isFinite(videoId);
  const screenTitle = isUnitExam ? (examTitle ?? (en ? "Chapter exam" : "امتحان الفصل")) : videoTitle;

  const [attemptNonce, setAttemptNonce] = useState(0);
  const { data: quiz, isLoading, isError, error, isFetching } = useQuery<QuizPayload>({
    queryKey: ["quiz", "take", examKind ?? "video", videoId, unitId, token, attemptNonce],
    queryFn: () => apiFetch<QuizPayload>(takeUrl, { token }),
    enabled: !isHistory && !!token && takeEnabled,
    staleTime: 0,
    gcTime: 0,
  });

  const { data: history, isLoading: historyLoading } = useQuery<AttemptRow[]>({
    queryKey: ["quiz", "history", videoId, token],
    queryFn: () => apiFetch<AttemptRow[]>(`/api/videos/${videoId}/quiz/history`, { token }),
    enabled: isHistory && !!token && Number.isFinite(videoId),
  });

  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // After the student picks "عرض الأسئلة" on the submit warning, the nav buttons walk ONLY
  // through the still-unanswered questions instead of moving one step at a time.
  const [guideUnanswered, setGuideUnanswered] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const burstAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [showBurst, setShowBurst] = useState(false);
  const triggerBurst = useCallback(() => {
    setShowBurst(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    burstAnim.setValue(0);
    Animated.sequence([
      Animated.spring(burstAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.delay(1200),
      Animated.timing(burstAnim, { toValue: 2, duration: 380, useNativeDriver: true }),
    ]).start(() => setShowBurst(false));
  }, [burstAnim]);

  const questions = quiz?.questions ?? [];
  const total = questions.length;
  const progress = total > 0 ? (currentIndex + 1) / total : 0;
  const answeredCount = useMemo(() => questions.filter((q) => answers[q.id] != null).length, [questions, answers]);
  const unansweredIndices = useMemo(
    () => questions.map((q, i) => (answers[q.id] == null ? i : -1)).filter((i) => i >= 0),
    [questions, answers],
  );
  // Move between questions. During the "review unanswered" walk we jump to the next/previous
  // still-empty question; otherwise we step one question at a time.
  const goToUnansweredOr = useCallback(
    (dir: 1 | -1) => {
      if (guideUnanswered) {
        const target =
          dir === 1
            ? unansweredIndices.find((i) => i > currentIndex)
            : [...unansweredIndices].reverse().find((i) => i < currentIndex);
        if (target != null) {
          setCurrentIndex(target);
          return;
        }
        if (dir === 1) {
          // Passed the last unanswered one → end the walk on the final question so "سلّم" shows.
          setGuideUnanswered(false);
          setCurrentIndex(total - 1);
          return;
        }
      }
      setCurrentIndex((i) => Math.min(total - 1, Math.max(0, i + dir)));
    },
    [guideUnanswered, unansweredIndices, currentIndex, total],
  );

  const restart = useCallback(() => {
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
    setAttemptNonce((n) => n + 1);
  }, []);

  const doSubmit = useCallback(async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    try {
      const payload = { answers: quiz.questions.map((q) => ({ questionId: q.id, chosenKey: answers[q.id] ?? null })) };
      const res = await apiFetch<SubmitResult>(submitUrl, { method: "POST", token, body: JSON.stringify(payload) });
      setResult(res);
      if (res.pointsAwarded > 0) triggerBurst();
      void queryClient.invalidateQueries({ queryKey: gamificationQueryKey });
      if (isUnitExam) {
        void queryClient.invalidateQueries({ queryKey: ["chapter-exam", "info", unitId] });
        void queryClient.invalidateQueries({ queryKey: ["subject-levels"] });
      } else {
        void queryClient.invalidateQueries({ queryKey: quizInfoQueryKey(videoId, token) });
        void queryClient.invalidateQueries({ queryKey: ["quiz", "history", videoId, token] });
      }
    } catch (e) {
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not submit the quiz." : "تعذّر تسليم الاختبار.");
    } finally {
      setSubmitting(false);
    }
  }, [quiz, submitting, answers, videoId, token, triggerBurst, queryClient, en]);

  const confirmSubmit = useCallback(() => {
    if (unansweredIndices.length > 0) {
      setShowSubmitConfirm(true);
      return;
    }
    void doSubmit();
  }, [unansweredIndices, doSubmit]);

  // ── Adaptive exam timer ───────────────────────────────────────────────────────
  // The formal chapter exam (B) is timed; when the clock hits zero it auto-submits
  // whatever's been answered. The review exam (A) is untimed.
  const timerMinutes = quiz?.timerMinutes ?? 0;
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerStartedRef = useRef<number | null>(null);
  useEffect(() => {
    if (isAdaptiveExam && quiz && timerMinutes > 0 && timerStartedRef.current !== attemptNonce) {
      timerStartedRef.current = attemptNonce;
      setTimeLeft(timerMinutes * 60);
    }
  }, [isAdaptiveExam, quiz, timerMinutes, attemptNonce]);
  useEffect(() => {
    if (timeLeft == null || result) return;
    if (timeLeft <= 0) {
      setTimeLeft(null);
      void doSubmit();
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, result, doSubmit]);
  const timerLabel =
    timeLeft == null
      ? null
      : toEnglishDigits(`${String(Math.floor(timeLeft / 60)).padStart(2, "0")}:${String(timeLeft % 60).padStart(2, "0")}`);

  useEffect(() => {
    setCurrentIndex(0);
    setGuideUnanswered(false);
    setShowSubmitConfirm(false);
  }, [attemptNonce]);

  // Animate the progress bar so it grows when moving to the next question and
  // shrinks when going back, instead of jumping to the new width instantly.
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 550,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const gradient: [string, string, string] =
    resolvedScheme === "dark" ? ["#0A0F1E", "#000000", "#0A0A12"] : ["#EEF5FF", "#F8FBFF", "#F5F2FF"];

  // Back button pinned to the left, lesson title on the same row to the right, and an
  // optional strip (the progress bar in exam mode) hangs under them inside the header.
  const Header = ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={20} color={colors.textSecondary} />
          <Text style={[styles.backText, { color: colors.text }]}>{en ? "Lesson" : "الدرس"}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]} numberOfLines={1}>{title}</Text>
      </View>
      {children}
    </View>
  );

  // ── History mode ─────────────────────────────────────────────────────────────────
  if (isHistory) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        <Header title={en ? "My attempts" : "كل المحاولات"} />
        <ScrollView contentContainerStyle={{ padding: HPAD, paddingBottom: insets.bottom + 40, gap: 10 }}>
          {historyLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : !history || history.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "No attempts yet." : "لسه مفيش محاولات."}</Text>
          ) : (
            history.map((a, i) => {
              const band = gradeBand(a.percent, en);
              return (
                <View key={a.id} style={[styles.attemptRow, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <View style={[styles.attemptScore, { backgroundColor: band.color }]}>
                    <Text style={styles.attemptScoreText}>{toEnglishDigits(String(a.percent))}٪</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.attemptTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>
                      {en ? `Attempt ${toEnglishDigits(String(history.length - i))}` : `المحاولة ${toEnglishDigits(String(history.length - i))}`}
                      {"  ·  "}
                      {toEnglishDigits(String(a.score))}/{toEnglishDigits(String(a.total))}
                      {a.pointsAwarded > 0 ? `  ·  +${toEnglishDigits(String(a.pointsAwarded))}` : ""}
                    </Text>
                    <Text style={[styles.attemptDate, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{formatDateTime(a.createdAt)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Result mode ──────────────────────────────────────────────────────────────────
  if (result) {
    const band = gradeBand(result.percent, en);
    // Align the review by the CONTENT language (the quiz's OWN language, returned with the
    // result) — NOT the app UI language and NOT the unreliable I18nManager.isRTL flag. An
    // Arabic quiz must read right-to-left even inside an English UI, exactly like the exam
    // screen keys layout off quiz.language while wording follows `en`. Each review row is
    // then placed in a `direction:"ltr"` context (reviewCard style + the heading wrapper
    // below) so these PHYSICAL right/left/row-reverse values resolve deterministically,
    // immune to whether native forceRTL has been applied this session.
    const revEn = result.language === "en";
    const revAlign: "left" | "right" = revEn ? "left" : "right";
    const revDir: "ltr" | "rtl" = revEn ? "ltr" : "rtl";
    const revRow: "row" | "row-reverse" = revEn ? "row" : "row-reverse";
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        {showBurst ? (
          <Animated.View pointerEvents="none" style={[styles.pointsBurst, { top: insets.top + 70, opacity: burstAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: [{ translateY: burstAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [12, 0, -44] }) }, { scale: burstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1], extrapolate: "clamp" }) }] }]}>
            <View style={styles.pointsBurstPill}>
              <Text style={styles.pointsBurstText}>+{toEnglishDigits(String(result.pointsAwarded))} {en ? "points 🎉" : "نقطة 🎉"}</Text>
            </View>
          </Animated.View>
        ) : null}

        <Header title={en ? "Result" : "النتيجة"} />
        <ScrollView contentContainerStyle={{ padding: HPAD, paddingBottom: insets.bottom + 40, gap: 14 }}>
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.scoreCircle, { borderColor: band.color }]}>
              <Text style={[styles.scoreBig, { color: band.color }]}>{toEnglishDigits(String(result.percent))}٪</Text>
              <Text style={[styles.scoreFraction, { color: colors.textSecondary }]}>{toEnglishDigits(String(result.score))} / {toEnglishDigits(String(result.total))}</Text>
            </View>
            <Text style={[styles.bandText, { color: band.color }]}>{band.label}</Text>
            {result.pointsAwarded > 0 ? (
              <Text style={[styles.pointsLine, { color: colors.text }]}>{en ? `You earned +${toEnglishDigits(String(result.pointsAwarded))} points` : `كسبت +${toEnglishDigits(String(result.pointsAwarded))} نقطة`}</Text>
            ) : (
              <Text style={[styles.pointsLine, { color: colors.textSecondary }]}>{en ? "Points are awarded on the first attempt only." : "النقاط بتتحسب أول محاولة بس."}</Text>
            )}
          </View>

          <View style={{ direction: "ltr" }}>
            <Text style={[styles.reviewHeading, { color: colors.text, textAlign: revAlign, writingDirection: revDir }]}>{en ? "Review" : "مراجعة الإجابات"}</Text>
          </View>
          {result.review.map((item, qi) => (
            <View key={item.questionId} style={[styles.reviewCard, { backgroundColor: QUIZ_COLORS.card, borderColor: QUIZ_COLORS.border }]}>
              <Text style={[styles.reviewQNum, { color: COLORS.primary, textAlign: revAlign, writingDirection: revDir }]}>
                {en ? `Question ${toEnglishDigits(String(qi + 1))}` : `السؤال رقم ${toEnglishDigits(String(qi + 1))}`}
              </Text>
              {item.text ? (
                <RichText html={item.text} style={[styles.reviewQuestion, { color: QUIZ_COLORS.text, textAlign: revAlign, writingDirection: revDir }]} />
              ) : null}
              {item.imageUrl ? <View style={{ marginTop: 8 }}><AutoImage src={item.imageUrl} /></View> : null}
              {item.table ? <TableView table={item.table} colors={QUIZ_COLORS} /> : null}
              <View style={{ gap: 7, marginTop: 8 }}>
                {item.options.map((opt) => {
                  const isCorrect = opt.key === item.correctKey;
                  const isChosen = opt.key === item.chosenKey;
                  const isImage = opt.kind === "image";
                  const bg = isCorrect ? "#05966915" : isChosen ? "#DC262615" : QUIZ_COLORS.surfaceSecondary;
                  const bd = isCorrect ? "#059669" : isChosen ? "#DC2626" : QUIZ_COLORS.border;
                  return (
                    <View key={opt.key} style={[styles.optRow, { backgroundColor: bg, borderColor: bd, flexDirection: revRow }]}>
                      <View style={{ flex: 1 }}>
                        <ContentBody content={opt} colors={QUIZ_COLORS} textStyle={[styles.optText, { color: QUIZ_COLORS.text, textAlign: revAlign, writingDirection: revDir }]} />
                      </View>
                      {/* Options are PDF screenshots, so the row's tint sits UNDER the image and
                          can't be seen. Lay a translucent colour ON TOP so correct/wrong still
                          reads on an image option. */}
                      {isImage && (isCorrect || isChosen) ? (
                        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { borderRadius: 12, backgroundColor: isCorrect ? "#05966933" : "#DC262633" }]} />
                      ) : null}
                      {/* Mark sits ON TOP at the far right instead of reserving a column, so the
                          image keeps the full width. A white bubble keeps it legible over the image. */}
                      {isCorrect || isChosen ? (
                        <View pointerEvents="none" style={styles.optMark}>
                          <View style={styles.optMarkBubble}>
                            {isCorrect ? <Feather name="check-circle" size={20} color="#059669" /> : <Feather name="x-circle" size={20} color="#DC2626" />}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              {item.chosenKey == null ? <Text style={[styles.unanswered, { color: "#D97706", textAlign: "center" }]}>{en ? "Not answered" : "لم تُجب"}</Text> : null}
              {item.explanation ? (
                <View style={[styles.explanationBox, { backgroundColor: QUIZ_COLORS.surfaceSecondary, borderColor: QUIZ_COLORS.border }]}>
                  <RichText html={`💡 ${item.explanation}`} style={[styles.explanationText, { color: QUIZ_COLORS.textSecondary, textAlign: revAlign, writingDirection: revDir }]} />
                </View>
              ) : null}
            </View>
          ))}

          <View style={{ gap: 10, marginTop: 4 }}>
            <Pressable onPress={restart} style={[styles.primaryBtn, { backgroundColor: COLORS.primary }]}>
              <Feather name="refresh-cw" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>{en ? "Retry" : "أعد المحاولة"}</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{en ? "Back to lesson" : "رجوع للدرس"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Loading / error ──────────────────────────────────────────────────────────────
  if (isLoading || isFetching) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        <Header title={en ? "Quiz" : "الاختبار"} />
        <View style={styles.centerFill}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 10 }]}>{en ? "Loading quiz…" : "جارٍ تحميل الاختبار…"}</Text>
        </View>
      </View>
    );
  }

  if (isError || !quiz || total === 0) {
    const msg = (error as { status?: number } | undefined)?.status === 403
      ? en ? "This quiz is for subscribers only." : "الاختبار ده للمشتركين في المادة بس."
      : error instanceof Error && error.message ? error.message : en ? "No quiz available for this lesson." : "مفيش اختبار للدرس ده.";
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
        <Header title={en ? "Quiz" : "الاختبار"} />
        <View style={styles.centerFill}>
          <Feather name="help-circle" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.text, marginTop: 10 }]}>{msg}</Text>
          <Pressable onPress={() => router.back()} style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{en ? "Back" : "رجوع"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Exam mode ────────────────────────────────────────────────────────────────────
  const q = questions[currentIndex];
  const isLast = currentIndex === total - 1;
  // The whole exam's reading direction is chosen ONCE by the admin (per quiz), not by the
  // student's app language: Arabic exam → RTL (option letter on the right, "التالي" on the
  // right), English exam → LTR (letter on the left, buttons mirrored).
  const examRTL = quiz.language !== "en";
  const unansweredCount = unansweredIndices.length;
  const manyUnanswered = unansweredCount > 1;
  const arUnanswered =
    unansweredCount === 1 ? "سؤال واحد" : unansweredCount === 2 ? "سؤالين" : unansweredCount <= 10 ? `${toEnglishDigits(String(unansweredCount))} أسئلة` : `${toEnglishDigits(String(unansweredCount))} سؤال`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
      <Header title={screenTitle || (en ? "Quiz" : "الاختبار")}>
        <View style={{ gap: 6, marginTop: 2 }}>
          {timerLabel != null ? (
            <View style={[styles.timerPill, { alignSelf: examRTL ? "flex-end" : "flex-start", backgroundColor: timeLeft != null && timeLeft <= 30 ? "#DC262618" : COLORS.primary + "14" }]}>
              <Feather name="clock" size={13} color={timeLeft != null && timeLeft <= 30 ? "#DC2626" : COLORS.primary} />
              <Text style={[styles.timerText, { color: timeLeft != null && timeLeft <= 30 ? "#DC2626" : COLORS.primary }]}>{timerLabel}</Text>
            </View>
          ) : null}
          <View style={[styles.progressRow, { flexDirection: examRTL ? "row-reverse" : "row" }]}>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>{en ? `Question ${toEnglishDigits(String(currentIndex + 1))} of ${toEnglishDigits(String(total))}` : `سؤال ${toEnglishDigits(String(currentIndex + 1))} من ${toEnglishDigits(String(total))}`}</Text>
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>{en ? `${toEnglishDigits(String(answeredCount))} solved` : `${toEnglishDigits(String(answeredCount))} سؤال محلول`}</Text>
          </View>
          {/* Fill grows from the start edge of the exam's language: right→left for Arabic, left→right for English. */}
          <View style={[styles.progressTrack, { backgroundColor: colors.border, flexDirection: "row", direction: examRTL ? "rtl" : "ltr" }]}>
            <Animated.View style={[styles.progressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }), backgroundColor: COLORS.primary }]} />
          </View>
        </View>
      </Header>

      <ScrollView contentContainerStyle={{ padding: HPAD, paddingBottom: insets.bottom + 120, gap: 12 }}>
        {q.imageUrl && !q.text && !q.table ? (
          // Image-only question: the picture fills the card edge-to-edge, no inner margins.
          <View style={[styles.questionCardImage, { borderColor: QUIZ_COLORS.border }]}>
            <AutoImage src={q.imageUrl} style={{ borderRadius: 0 }} />
          </View>
        ) : (
          <View style={[styles.questionCard, { backgroundColor: QUIZ_COLORS.card, borderColor: QUIZ_COLORS.border }]}>
            {q.text ? <RichText html={q.text} style={[styles.questionText, { color: QUIZ_COLORS.text, textAlign: examRTL ? "right" : "left", writingDirection: examRTL ? "rtl" : "ltr" }]} /> : null}
            {q.imageUrl ? <View style={{ marginTop: q.text ? 12 : 0 }}><AutoImage src={q.imageUrl} /></View> : null}
            {q.table ? <TableView table={q.table} colors={QUIZ_COLORS} /> : null}
          </View>
        )}

        {q.options.map((opt, i) => {
          const selected = answers[q.id] === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.key }))}
              style={[styles.answerCard, { borderColor: selected ? COLORS.primary : QUIZ_COLORS.border }]}
            >
              {/* The image fills the card EXCEPT a strip reserved for the letter, so the letter
                  never overlaps the picture. The strip is the same white as the card (invisible). */}
              <View style={[styles.answerContentFill, examRTL ? { left: 0, right: OPTION_LETTER_SLOT } : { left: OPTION_LETTER_SLOT, right: 0 }]}>
                <ContentBody content={opt} colors={QUIZ_COLORS} fill contentPosition={examRTL ? "right" : "left"} textStyle={[styles.answerText, { color: QUIZ_COLORS.text, textAlign: "center", writingDirection: examRTL ? "rtl" : "ltr" }]} />
              </View>
              {/* Selection tint covers the WHOLE card (image + reserved strip) → seamless either way. */}
              {selected ? <View pointerEvents="none" style={styles.answerSelectedOverlay} /> : null}
              {/* Letter: vertically centred, pinned to the far right (Arabic) / far left (English). */}
              <View style={[styles.answerLetterSlot, examRTL ? { right: 0 } : { left: 0 }]}>
                <View style={[styles.answerLetterBadge, { borderColor: selected ? COLORS.primary : QUIZ_COLORS.border, backgroundColor: selected ? COLORS.primary : QUIZ_COLORS.card }]}>
                  <Text style={[styles.answerLetterText, { color: selected ? "#fff" : QUIZ_COLORS.textSecondary }]}>{LETTERS[i]}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* direction:"ltr" makes the button SIDES deterministic (immune to forceRTL not being
          applied yet). Arabic → row-reverse → السابق(first) right, التالي left; English → row → swapped. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border, direction: "ltr", flexDirection: examRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => goToUnansweredOr(-1)} disabled={currentIndex === 0} style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: currentIndex === 0 ? 0.4 : 1 }]}>
          {/* Arrow follows the button's side: Previous sits right in Arabic (›, trailing),
              left in English (‹, leading). */}
          <View style={styles.navBtnInner}>
            {!examRTL ? <Feather name="chevron-left" size={18} color={colors.text} /> : null}
            <Text style={[styles.navBtnText, { color: colors.text }]}>{en ? "Previous" : "السابق"}</Text>
            {examRTL ? <Feather name="chevron-right" size={18} color={colors.text} /> : null}
          </View>
        </Pressable>
        {isLast ? (
          <Pressable onPress={confirmSubmit} disabled={submitting} style={[styles.navBtn, styles.submitBtn]}>
            {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitBtnText}>{en ? "Submit" : "سلّم الإجابات"}</Text>}
          </Pressable>
        ) : (
          <Pressable onPress={() => goToUnansweredOr(1)} style={[styles.navBtn, styles.submitBtn]}>
            {/* Arrow follows the button's side: Next sits left in Arabic (‹, leading),
                right in English (›, trailing). */}
            <View style={styles.navBtnInner}>
              {examRTL ? <Feather name="chevron-left" size={18} color="#fff" /> : null}
              <Text style={styles.submitBtnText}>{en ? "Next" : "التالي"}</Text>
              {!examRTL ? <Feather name="chevron-right" size={18} color="#fff" /> : null}
            </View>
          </Pressable>
        )}
      </View>

      <ConfirmDialog
        visible={showSubmitConfirm}
        title={en ? "Unanswered questions" : "أسئلة لسه فاضية"}
        message={en ? `You left ${unansweredCount} question${manyUnanswered ? "s" : ""} unanswered.` : `لسه فاضل ${arUnanswered} من غير إجابة.`}
        confirmLabel={en ? "Submit anyway" : "تسليم على أي حال"}
        cancelLabel={en ? (manyUnanswered ? "Show the questions" : "Show the question") : manyUnanswered ? "عرض الأسئلة" : "عرض السؤال"}
        destructive
        icon="alert-triangle"
        onConfirm={() => {
          setShowSubmitConfirm(false);
          void doSubmit();
        }}
        onCancel={() => {
          setShowSubmitConfirm(false);
          if (unansweredIndices[0] != null) {
            setGuideUnanswered(true);
            setCurrentIndex(unansweredIndices[0]);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: HPAD },
  emptyText: { ...FONT.semiBold, fontSize: 14, textAlign: "center" },
  header: { paddingHorizontal: HPAD, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, direction: "ltr" },
  backBtn: { minHeight: 38, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, direction: "ltr" },
  backText: { ...FONT.bold, fontSize: 14 },
  headerTitle: { ...FONT.bold, fontSize: 18, flex: 1 },
  progressRow: { alignItems: "center", justifyContent: "space-between" },
  progressText: { ...FONT.semiBold, fontSize: 12.5 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  timerText: { ...FONT.bold, fontSize: 14 },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 999 },
  questionCard: { borderRadius: 18, borderWidth: 1, padding: 16 },
  // Small WHITE padding around the question image: gives it breathing room off the border
  // without a visible margin (the padding is the same white as the image background).
  questionCardImage: { borderRadius: 18, borderWidth: 1, overflow: "hidden", backgroundColor: "#FFFFFF", padding: 8 },
  questionText: { ...FONT.bold, fontSize: 17, lineHeight: 27 },
  qImage: { width: "100%", height: 180, borderRadius: 14, marginTop: 12, backgroundColor: "#00000010" },
  answerCard: { height: OPTION_CARD_HEIGHT, borderRadius: 16, borderWidth: 2, overflow: "hidden", backgroundColor: "#FFFFFF" },
  answerContentFill: { position: "absolute", top: 8, bottom: 8, alignItems: "center", justifyContent: "center" },
  answerSelectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.primary + "33" },
  answerLetterSlot: { position: "absolute", top: 0, bottom: 0, width: OPTION_LETTER_SLOT, alignItems: "center", justifyContent: "center" },
  answerLetterBadge: { width: 28, height: 28, borderRadius: 999, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  answerLetterText: { ...FONT.bold, fontSize: 14 },
  answerText: { ...FONT.semiBold, fontSize: 15, lineHeight: 22 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: HPAD, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  navBtn: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  // direction:"ltr" neutralises the app's forceRTL so the arrow/label always lay out in
  // physical array order (‹ + label, or label + ›) — reliable even on a fresh launch where
  // I18nManager.isRTL isn't applied yet. The buttons only SWAP SIDES via the bar below.
  navBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, direction: "ltr" },
  navBtnText: { ...FONT.bold, fontSize: 15 },
  submitBtn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  submitBtnText: { ...FONT.bold, fontSize: 15, color: "#fff" },
  resultCard: { borderRadius: 22, borderWidth: 1, padding: 20, alignItems: "center", gap: 10 },
  scoreCircle: { width: 128, height: 128, borderRadius: 64, borderWidth: 6, alignItems: "center", justifyContent: "center" },
  scoreBig: { ...FONT.bold, fontSize: 34 },
  scoreFraction: { ...FONT.semiBold, fontSize: 14, marginTop: 2 },
  bandText: { ...FONT.bold, fontSize: 18 },
  pointsLine: { ...FONT.semiBold, fontSize: 14, textAlign: "center" },
  reviewHeading: { ...FONT.bold, fontSize: 16, marginTop: 4 },
  reviewQNum: { ...FONT.bold, fontSize: 13, marginBottom: 6 },
  // direction:"ltr" pins the whole review card to a deterministic PHYSICAL layout so the
  // Arabic content (textAlign:"right" on the number/question/options/explanation, and the
  // row-reverse option rows) always hugs the RIGHT edge and the correct/wrong mark stays
  // far-right — immune to whether the native forceRTL flag has been applied this session.
  reviewCard: { borderRadius: 18, borderWidth: 1, padding: 14, direction: "ltr" },
  reviewQuestion: { ...FONT.bold, fontSize: 15, lineHeight: 24 },
  optRow: { alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 11 },
  optMark: { position: "absolute", right: 8, top: 0, bottom: 0, justifyContent: "center" },
  optMarkBubble: { backgroundColor: "#FFFFFFF2", borderRadius: 999, padding: 2 },
  optText: { ...FONT.semiBold, fontSize: 14, lineHeight: 21 },
  unanswered: { ...FONT.bold, fontSize: 12, marginTop: 8 },
  explanationBox: { marginTop: 10, borderRadius: 12, borderWidth: 1, padding: 11 },
  explanationText: { ...FONT.regular, fontSize: 13, lineHeight: 21 },
  primaryBtn: { minHeight: 50, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { ...FONT.bold, fontSize: 16, color: "#fff" },
  secondaryBtn: { minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { ...FONT.bold, fontSize: 15 },
  attemptRow: { alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  attemptScore: { minWidth: 54, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  attemptScoreText: { ...FONT.bold, fontSize: 15, color: "#fff" },
  attemptTitle: { ...FONT.bold, fontSize: 14 },
  attemptDate: { ...FONT.regular, fontSize: 12, marginTop: 2 },
  pointsBurst: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 50 },
  pointsBurstPill: { backgroundColor: "#059669", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, shadowColor: "#059669", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  pointsBurstText: { ...FONT.bold, fontSize: 16, color: "#FFFFFF" },
});
