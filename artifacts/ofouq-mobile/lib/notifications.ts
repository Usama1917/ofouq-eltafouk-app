import { router } from "expo-router";
import { Linking } from "react-native";

import { apiFetch } from "@/lib/api";

export type NotificationTone = "primary" | "success" | "warning" | "danger";

export type NotificationActionData = {
  type?: string;
  route?: "units" | "subscribe" | "lesson" | "supportChat" | "external";
  url?: string;
  yearId?: number | string;
  yearName?: string;
  subjectId?: number | string;
  subjectName?: string;
  unitLabel?: string;
  unitId?: number | string;
  unitName?: string;
  lessonId?: number | string;
  lessonTitle?: string;
  videoTitle?: string;
  conversationId?: number | string;
  messageId?: number | string;
  seekSeconds?: number | string;
  resumeFromNotification?: number | string;
  notificationId?: number | string;
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

export function deleteNotification(id: number, token: string | null) {
  return apiFetch<{ success: boolean; id: number; unreadCount: number }>(`/api/notifications/${id}`, {
    method: "DELETE",
    token,
  });
}

export function clearReadNotifications(token: string | null) {
  return apiFetch<{ success: boolean; deletedCount: number; unreadCount: number }>("/api/notifications/read", {
    method: "DELETE",
    token,
  });
}

function cleanParam(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function openNotificationTarget(notification: AppNotification) {
  const data = notification.data ?? {};

  if (data.route === "external" && data.url) {
    // review F-20: only open http(s) URLs, matching the actionUrl branch below.
    // Without this an attacker-influenced notification payload could hand an
    // arbitrary scheme (javascript:, file:, intent:, a deep link, …) straight to
    // the OS via Linking.openURL.
    const externalUrl = cleanParam(data.url);
    if (/^https?:\/\//i.test(externalUrl)) {
      void Linking.openURL(externalUrl);
    }
    return;
  }

  if (!data.route && notification.actionUrl && /^https?:\/\//i.test(notification.actionUrl)) {
    void Linking.openURL(notification.actionUrl);
    return;
  }

  if (data.route === "supportChat") {
    router.push("/(tabs)/settings/support-chat" as any);
    return;
  }

  if (data.route === "units") {
    router.push({
      pathname: "/(tabs)/videos/units",
      params: {
        yearId: cleanParam(data.yearId),
        yearName: cleanParam(data.yearName),
        subjectId: cleanParam(data.subjectId),
        subjectName: cleanParam(data.subjectName),
        unitLabel: cleanParam(data.unitLabel),
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
        unitLabel: cleanParam(data.unitLabel),
        unitId: cleanParam(data.unitId),
        unitName: cleanParam(data.unitName),
        lessonId: cleanParam(data.lessonId),
        lessonTitle: cleanParam(data.lessonTitle),
        seekSeconds: cleanParam(data.seekSeconds),
        resumeFromNotification: notification.type === "resume_lesson" ? "1" : "",
        notificationId: cleanParam(notification.id),
      },
    });
  }
}
