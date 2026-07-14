import type { AppLanguage } from "@/lib/i18n";
import { toEnglishDigits } from "@/lib/format";

const ENGLISH_ACADEMIC_COPY: Record<string, string> = {
  "الصف الاول الثانوي": "First Secondary Grade",
  "مسار تجريبي منشور لاختبار دروس الفيديو على الموبايل.": "A published demo path for testing video lessons on mobile.",
  "الرياضيات": "Mathematics",
  "دروس تاسيسيه في الجبر والدوال.": "Foundational lessons in algebra and functions.",
  "الجبر والدوال": "Algebra and Functions",
  "مفاهيم اساسيه قبل حل المسائل.": "Core concepts before solving problems.",
  "مقدمه في الدوال": "Introduction to Functions",
  "فهم معنى الداله والتمثيل البياني.": "Understanding functions and graph representation.",
  "شرح مبسط لمفهوم الداله مع امثله مرئيه.": "A simple explanation of functions with visual examples.",
  "الفكره الاساسيه": "Core Idea",
  "امثله محلوله": "Solved Examples",
  "تطبيق سريع": "Quick Practice",
  "قراءه الرسم البياني": "Reading Graphs",
  "كيف نستخرج القيم والمجالات من الرسم.": "How to extract values and domains from a graph.",
  "تدريب مرئي على قراءه العلاقات من الرسوم البيانيه.": "Visual practice for reading relationships from graphs.",
  "قراءه المحاور": "Reading Axes",
  "تحليل القيم": "Analyzing Values",
  "الفيزياء": "Physics",
  "مفاهيم الحركه والقوى بصوره مبسطه.": "Motion and force concepts explained simply.",
  "الحركه في خط مستقيم": "Motion in a Straight Line",
  "السرعه والعجله والتمثيل البياني للحركه.": "Speed, acceleration, and motion graphs.",
  "السرعه والعجله": "Speed and Acceleration",
  "مقارنه عمليه بين السرعه المتوسطه والعجله.": "A practical comparison between average speed and acceleration.",
  "شرح تطبيقي للحركه في خط مستقيم.": "An applied explanation of motion in a straight line.",
  "تعريف السرعه": "Defining Speed",
  "تعريف العجله": "Defining Acceleration",
  "التفوق": "Eltafouk",
  "الدرس الاول": "Lesson One",
  "الدعامه والحركه": "Support and Movement",
  "الدعامه والحركه في الكائنات الحيه": "Support and Movement in Living Organisms",
  "احمد علي": "Ahmed Ali",
  "احمد الطالب": "Ahmed Student",
};

const ARABIC_ORDINALS: Record<string, string> = {
  الاول: "One",
  الثاني: "Two",
  الثالث: "Three",
  الرابع: "Four",
  الخامس: "Five",
  السادس: "Six",
  السابع: "Seven",
  الثامن: "Eight",
  التاسع: "Nine",
  العاشر: "Ten",
};

function normalizeArabicKey(value: string) {
  return value
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

export function localizeAcademicText(
  value: string | null | undefined,
  language: AppLanguage,
  english?: string | null,
) {
  const text = String(value ?? "");
  if (!text) return text;

  if (language !== "en") return toEnglishDigits(text);

  // Prefer the admin-provided English value when present; otherwise fall back to the
  // built-in dictionary (for legacy/demo content), then to the Arabic text.
  const englishText = typeof english === "string" ? english.trim() : "";
  if (englishText) return toEnglishDigits(englishText);

  const normalized = normalizeArabicKey(toEnglishDigits(text));
  const directTranslation = ENGLISH_ACADEMIC_COPY[normalized];
  if (directTranslation) return directTranslation;

  const questionMatch = normalized.match(/^السؤال\s+(\d+)$/);
  if (questionMatch) return `Question ${questionMatch[1]}`;

  const numericLessonMatch = normalized.match(/^الدرس\s+(\d+)$/);
  if (numericLessonMatch) return `Lesson ${numericLessonMatch[1]}`;

  const ordinalLessonMatch = normalized.match(/^الدرس\s+(.+)$/);
  if (ordinalLessonMatch) {
    const ordinal = ARABIC_ORDINALS[normalizeArabicKey(ordinalLessonMatch[1])];
    if (ordinal) return `Lesson ${ordinal}`;
  }

  return toEnglishDigits(text);
}
