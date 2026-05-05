import { router } from "expo-router";

import { apiFetch } from "@/lib/api";

export type NotificationTone = "primary" | "success" | "warning" | "danger";

export type NotificationActionData = {
  route?: "units" | "subscribe" | "lesson";
  yearId?: number | string;
  yearName?: string;
  subjectId?: number | string;
  subjectName?: string;
  unitId?: number | string;
  unitName?: string;
  lessonId?: number | string;
  lessonTitle?: string;
  seekSeconds?: number | string;
  reviewNotes?: string;
};

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  tone: NotificationTone | string;
  actionUrl?: string | null;
  data?: NotificationActionData | null;
  availableAt: string;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  items: AppNotification[];
  unreadCount: number;
};

export type NotificationSummary = {
  unreadCount: number;
};

export const notificationsQueryKey = ["notifications"] as const;

export function fetchNotifications(token: string | null) {
  return apiFetch<NotificationsResponse>("/api/notifications", { token });
}

export function fetchNotificationSummary(token: string | null) {
  return apiFetch<NotificationSummary>("/api/notifications/summary", { token });
}

export function markNotificationRead(id: number, token: string | null) {
  return apiFetch<AppNotification>(`/api/notifications/${id}/read`, {
    method: "PATCH",
    token,
  });
}

function cleanParam(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function openNotificationTarget(notification: AppNotification) {
  const data = notification.data ?? {};

  if (data.route === "units") {
    router.push({
      pathname: "/(tabs)/videos/units",
      params: {
        yearId: cleanParam(data.yearId),
        yearName: cleanParam(data.yearName),
        subjectId: cleanParam(data.subjectId),
        subjectName: cleanParam(data.subjectName),
      },
    });
    return;
  }

  if (data.route === "subscribe") {
    router.push({
      pathname: "/(tabs)/videos/subscribe",
      params: {
        yearId: cleanParam(data.yearId),
        yearName: cleanParam(data.yearName),
        subjectId: cleanParam(data.subjectId),
        subjectName: cleanParam(data.subjectName),
      },
    });
    return;
  }

  if (data.route === "lesson") {
    router.push({
      pathname: "/(tabs)/videos/lesson",
      params: {
        yearId: cleanParam(data.yearId),
        yearName: cleanParam(data.yearName),
        subjectId: cleanParam(data.subjectId),
        subjectName: cleanParam(data.subjectName),
        unitId: cleanParam(data.unitId),
        unitName: cleanParam(data.unitName),
        lessonId: cleanParam(data.lessonId),
        lessonTitle: cleanParam(data.lessonTitle),
        seekSeconds: cleanParam(data.seekSeconds),
      },
    });
  }
}
