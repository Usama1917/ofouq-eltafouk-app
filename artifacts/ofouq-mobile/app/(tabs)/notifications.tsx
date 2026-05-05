import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import {
  AppNotification,
  fetchNotifications,
  markNotificationRead,
  notificationsQueryKey,
  openNotificationTarget,
} from "@/lib/notifications";

type NotificationTone = "primary" | "success" | "warning" | "danger";

function getToneMeta(tone: NotificationTone) {
  switch (tone) {
    case "success":
      return {
        color: COLORS.success,
        background: "rgba(16,185,129,0.12)",
        icon: "check-circle" as const,
      };
    case "warning":
      return {
        color: COLORS.warning,
        background: "rgba(245,158,11,0.14)",
        icon: "clock" as const,
      };
    case "danger":
      return {
        color: COLORS.error,
        background: "rgba(239,68,68,0.12)",
        icon: "alert-circle" as const,
      };
    case "primary":
    default:
      return {
        color: COLORS.primary,
        background: "rgba(29,78,216,0.12)",
        icon: "bell" as const,
      };
  }
}

function normalizeTone(tone: string): NotificationTone {
  if (tone === "success" || tone === "warning" || tone === "danger") return tone;
  return "primary";
}

function formatNotificationTime(value: string, locale: string) {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  const isArabic = locale.startsWith("ar");
  if (diffSeconds < 60) return isArabic ? "الآن" : "Now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return isArabic ? `منذ ${diffMinutes} دقيقة` : `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return isArabic ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return isArabic ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;

  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(value));
}

export default function NotificationsScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    isRTL,
    textAlign,
    direction,
    alignStart,
  } = usePreferences();
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [...notificationsQueryKey, token],
    queryFn: () => fetchNotifications(token),
    enabled: Boolean(token && user),
    refetchInterval: 30000,
  });

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const hasNotifications = notifications.length > 0;
  const titleDirection = isRTL ? "row-reverse" : "row";

  async function openNotification(item: AppNotification) {
    if (!token) return;
    try {
      if (!item.readAt) {
        await markNotificationRead(item.id, token);
        await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      }
    } catch {
      // Navigation is more important than blocking on the read marker.
    }
    openNotificationTarget(item);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#0A0F1E", "#111827", "#0F172A"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 22,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 18,
        }}
      >
        <View style={[styles.titleRow, { flexDirection: titleDirection, direction }]}>
          <View style={styles.titleIcon}>
            <Feather name="bell" size={24} color={COLORS.primary} />
          </View>
          <View style={[styles.titleBlock, { alignItems: alignStart }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.notifications.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.notifications.subtitle}
            </Text>
          </View>
        </View>

        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryIcon}>
            <Feather name="inbox" size={21} color={COLORS.primary} />
          </View>
          <View style={[styles.summaryText, { alignItems: alignStart }]}>
            <Text style={[styles.summaryNumber, { color: colors.text, textAlign, writingDirection: direction }]}>
              {toEnglishDigits(String(unreadCount))}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.notifications.unread}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={[styles.stateText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.common.loading}
            </Text>
          </View>
        ) : null}

        {!isLoading && isError ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="wifi-off" size={28} color={COLORS.warning} />
            <Text style={[styles.stateText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.common.unexpectedError}
            </Text>
            <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.retryButton}>
              <Text style={styles.retryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
            </Pressable>
          </View>
        ) : null}

        {hasNotifications ? (
          <View style={styles.list}>
            {notifications.map((item, index) => {
              const tone = getToneMeta(normalizeTone(item.tone));
              const isUnread = !item.readAt;

              return (
                <Pressable
                  key={`${item.id}-${index}`}
                  onPress={() => void openNotification(item)}
                  style={({ pressed }) => [
                    styles.notificationCard,
                    {
                      backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                      borderColor: isUnread ? COLORS.primary + "35" : colors.border,
                      flexDirection: titleDirection,
                      direction,
                    },
                  ]}
                >
                  <View style={[styles.notificationIcon, { backgroundColor: tone.background }]}>
                    <Feather name={tone.icon} size={20} color={tone.color} />
                  </View>
                  <View style={[styles.notificationBody, { alignItems: alignStart }]}>
                    <View style={[styles.notificationHeader, { alignItems: alignStart }]}>
                      <View style={[styles.notificationTitleRow, { flexDirection: titleDirection, direction }]}>
                        {isUnread ? <View style={styles.unreadDot} /> : null}
                        <Text style={[styles.notificationTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={[styles.notificationTime, { color: colors.textTertiary, textAlign, writingDirection: direction }]}>
                        {toEnglishDigits(formatNotificationTime(item.createdAt, strings.locale))}
                      </Text>
                    </View>
                    <Text style={[styles.notificationText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                      {item.body}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : !isLoading && !isError ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.emptyIcon}>
              <Feather name="bell-off" size={30} color={COLORS.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.notifications.emptyTitle}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.notifications.emptyText}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    alignItems: "center",
    minHeight: 68,
    gap: 13,
  },
  titleIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 29,
    lineHeight: 44,
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
  },
  summaryCard: {
    minHeight: 106,
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  summaryText: {
    flex: 1,
    gap: 1,
  },
  summaryNumber: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    lineHeight: 34,
  },
  summaryLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    lineHeight: 21,
  },
  stateCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  retryButton: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  stateText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
  },
  list: {
    gap: 12,
  },
  notificationCard: {
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 13,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  notificationIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  notificationHeader: {
    width: "100%",
    gap: 1,
  },
  notificationTitleRow: {
    alignItems: "center",
    gap: 7,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  notificationTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    lineHeight: 24,
  },
  notificationTime: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  notificationText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
  },
  emptyCard: {
    minHeight: 260,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 74,
    height: 74,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    lineHeight: 28,
  },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
  },
});
