import { router } from "expo-router";
import { apiFetch } from "@/lib/api";

// v2 Phase 3 — the personalized home feed (continue card + suggestions). All scoped to
// the student's active subscriptions by the server.
export type FeedLesson = {
  lessonId: number;
  lessonTitle: string;
  lessonTitleEn: string | null;
  unitId: number;
  unitName: string;
  unitNameEn: string | null;
  unitLabel: string;
  subjectId: number;
  subjectName: string;
  subjectNameEn: string | null;
  yearId: number;
  yearName: string;
  yearNameEn: string | null;
  videoId: number | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  instructor: string | null;
  durationSeconds: number;
  currentSeconds: number;
  progressRatio: number;
  reason?: string;
};

export type HomeFeed = {
  continueLesson: FeedLesson | null;
  startJourney: FeedLesson | null;
  suggestions: FeedLesson[];
};

export const homeFeedQueryKey = ["home-feed"] as const;

export function fetchHomeFeed(token: string | null) {
  return apiFetch<HomeFeed>("/api/me/home-feed", { token });
}

// Open a feed lesson in the player. `resume` seeks to where the student stopped.
export function openFeedLesson(item: FeedLesson, opts?: { resume?: boolean }) {
  const resumeAt = opts?.resume && item.currentSeconds > 0 ? String(item.currentSeconds) : "";
  router.push({
    pathname: "/(tabs)/videos/lesson",
    params: {
      lessonId: String(item.lessonId),
      lessonTitle: item.lessonTitle,
      lessonTitleEn: item.lessonTitleEn ?? "",
      yearId: String(item.yearId),
      yearName: item.yearName,
      yearNameEn: item.yearNameEn ?? "",
      subjectId: String(item.subjectId),
      subjectName: item.subjectName,
      subjectNameEn: item.subjectNameEn ?? "",
      unitId: String(item.unitId),
      unitName: item.unitName,
      unitNameEn: item.unitNameEn ?? "",
      unitLabel: item.unitLabel,
      seekSeconds: resumeAt,
    },
  } as any);
}
