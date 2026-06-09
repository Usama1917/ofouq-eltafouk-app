import { toEnglishDigits } from "@/lib/format";

export type WatchHistoryLesson = {
  id: number;
  title: string;
  titleEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  unitId: number;
  unitName: string;
  unitNameEn?: string | null;
  videoId?: number | null;
  videoTitle?: string | null;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  instructor?: string | null;
  durationSeconds: number;
  currentSeconds: number;
  progressRatio: number;
  completed: boolean;
  lastWatchedAt?: string | null;
};

export type WatchHistoryUnit = {
  id: number;
  name: string;
  nameEn?: string | null;
  lessonCount: number;
  watchedLessons: number;
  completedLessons: number;
  totalSeconds: number;
  watchedSeconds: number;
  progressRatio: number;
  lessons: WatchHistoryLesson[];
};

export type WatchHistorySubject = {
  subscriptionId: number;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  year: { id: number; name: string; nameEn?: string | null };
  subject: { id: number; name: string; nameEn?: string | null; icon: string; description: string; descriptionEn?: string | null; unitLabel: string };
  lessonCount: number;
  watchedLessons: number;
  completedLessons: number;
  totalSeconds: number;
  watchedSeconds: number;
  progressRatio: number;
  lastWatchedAt?: string | null;
  units: WatchHistoryUnit[];
  recentLessons: WatchHistoryLesson[];
};

export type WatchHistoryTotals = {
  subscriptionCount: number;
  lessonCount: number;
  watchedLessons: number;
  completedLessons: number;
  totalSeconds: number;
  watchedSeconds: number;
  progressRatio: number;
};

export type WatchHistoryResponse = {
  subjects: WatchHistorySubject[];
  totals: WatchHistoryTotals;
};

export function clampProgress(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function formatProgressPercent(value: unknown) {
  return toEnglishDigits(`${Math.round(clampProgress(value) * 100)}%`);
}

export function formatClockDuration(seconds: unknown) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;

  if (hours > 0) {
    return toEnglishDigits(
      `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`,
    );
  }

  return toEnglishDigits(`${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`);
}

export function formatStudyDuration(seconds: unknown, language: "ar" | "en" = "ar") {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (language === "en") {
    if (hours > 0 && minutes > 0) return toEnglishDigits(`${hours}h ${minutes}m`);
    if (hours > 0) return toEnglishDigits(`${hours}h`);
    return toEnglishDigits(`${minutes}m`);
  }

  if (hours > 0 && minutes > 0) return toEnglishDigits(`${hours}س ${minutes}د`);
  if (hours > 0) return toEnglishDigits(`${hours}س`);
  return toEnglishDigits(`${minutes}د`);
}

export function formatHistoryDate(value?: string | null, locale = "ar-EG-u-nu-latn") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return toEnglishDigits(date.toLocaleDateString(locale, { month: "short", day: "numeric" }));
}
