import { router } from "expo-router";
import { apiFetch } from "@/lib/api";

// v2 Phase 4 — bookmarks, notes, search, progress.

export type LessonRef = {
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
};

export type LessonNote = {
  id: number;
  lessonId: number;
  atSeconds: number;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgressSubject = {
  subjectId: number;
  subjectName: string;
  subjectNameEn: string | null;
  icon: string;
  lessonCount: number;
  completedLessons: number;
  watchedSeconds: number;
  progressRatio: number;
};

export type ProgressData = {
  subjects: ProgressSubject[];
  totals: { lessonCount: number; completedLessons: number; watchedSeconds: number; progressRatio: number };
  streak: { current: number; best: number };
  points: { balance: number; totalEarned: number };
  exams: { averagePercent: number; attempts: number };
};

// ── query keys ─────────────────────────────────────────────────────────────
export const bookmarksQueryKey = ["bookmarks"] as const;
export const progressQueryKey = ["progress"] as const;
export const notesQueryKey = (lessonId: number | string) => ["lesson-notes", String(lessonId)] as const;
export const bookmarkStateKey = (lessonId: number | string) => ["bookmark-state", String(lessonId)] as const;

// ── bookmarks ────────────────────────────────────────────────────────────────
export function fetchBookmarks(token: string | null) {
  return apiFetch<{ bookmarks: LessonRef[] }>("/api/me/bookmarks", { token });
}
export function addBookmark(token: string | null, lessonId: number) {
  return apiFetch<{ bookmarked: boolean }>(`/api/lessons/${lessonId}/bookmark`, { method: "POST", token });
}
export function removeBookmark(token: string | null, lessonId: number) {
  return apiFetch<{ bookmarked: boolean }>(`/api/lessons/${lessonId}/bookmark`, { method: "DELETE", token });
}

// ── notes ──────────────────────────────────────────────────────────────────
export function fetchNotes(token: string | null, lessonId: number) {
  return apiFetch<{ notes: LessonNote[] }>(`/api/lessons/${lessonId}/notes`, { token });
}
export function addNote(token: string | null, lessonId: number, atSeconds: number, body: string) {
  return apiFetch<{ note: LessonNote }>(`/api/lessons/${lessonId}/notes`, {
    method: "POST",
    token,
    body: JSON.stringify({ atSeconds, body }),
  });
}
export function editNote(token: string | null, noteId: number, body: string) {
  return apiFetch<{ note: LessonNote }>(`/api/notes/${noteId}`, { method: "PATCH", token, body: JSON.stringify({ body }) });
}
export function deleteNote(token: string | null, noteId: number) {
  return apiFetch<{ deleted: boolean }>(`/api/notes/${noteId}`, { method: "DELETE", token });
}

// ── search ─────────────────────────────────────────────────────────────────
export function searchLessons(token: string | null, q: string) {
  return apiFetch<{ lessons: LessonRef[] }>(`/api/search?q=${encodeURIComponent(q)}`, { token });
}

// ── progress ───────────────────────────────────────────────────────────────
export function fetchProgress(token: string | null) {
  return apiFetch<ProgressData>("/api/me/progress", { token });
}

// Open a lesson (from a bookmark / search result) — optionally at a given second.
export function openLessonRef(item: LessonRef, seekSeconds?: number) {
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
      seekSeconds: seekSeconds && seekSeconds > 0 ? String(seekSeconds) : "",
    },
  } as any);
}
