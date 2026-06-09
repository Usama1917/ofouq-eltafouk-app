import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TextStyle, ViewStyle } from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { toEnglishDigits } from "@/lib/format";
import {
  AppNotification,
  clearReadNotifications as clearReadNotificationsRequest,
  deleteNotification,
  fetchNotifications,
  markNotificationRead,
  notificationsQueryKey,
  openNotificationTarget,
} from "@/lib/notifications";

const SCREEN_WIDTH = Dimensions.get("window").width;

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

type NotificationCardProps = {
  item: AppNotification;
  tone: ReturnType<typeof getToneMeta>;
  isUnread: boolean;
  colors: typeof COLORS.light;
  titleDirection: ViewStyle["flexDirection"];
  direction: "rtl" | "ltr";
  alignStart: ViewStyle["alignItems"];
  textAlign: TextStyle["textAlign"];
  locale: string;
  resolvedScheme: string;
  deleteLabel: string;
  markReadLabel: string;
  deleting: boolean;
  onPress: (item: AppNotification) => void;
  onDismiss: (item: AppNotification) => Promise<void>;
  onMarkRead: (item: AppNotification) => Promise<void>;
};

function NotificationCard({
  item,
  tone,
  isUnread,
  colors,
  direction,
  textAlign,
  locale,
  resolvedScheme,
  deleteLabel,
  markReadLabel,
  deleting,
  onPress,
  onDismiss,
  onMarkRead,
}: NotificationCardProps) {
  const isRTL = direction === "rtl";
  const translateX = React.useRef(new Animated.Value(0)).current;
  const [hidden, setHidden] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const offsetRef = React.useRef(0);
  const actionIsDelete = !isUnread;

  // iOS-Mail-style swipe: ALWAYS swipe right-to-left (push left). A short swipe
  // snaps the row open to reveal one action button (green "mark read" for unread,
  // red "delete" for read) which can be tapped; a strong/long swipe performs the
  // action immediately.
  const OPEN_SNAP = -118;
  const FULL_SWIPE = -Math.min(260, SCREEN_WIDTH * 0.5);

  const snapTo = React.useCallback(
    (value: number, nextOpen: boolean) => {
      offsetRef.current = value;
      setOpen(nextOpen);
      Animated.spring(translateX, {
        toValue: value,
        // JS-driven so the action button's animated width (a layout prop) can
        // track the swipe in lock-step.
        useNativeDriver: false,
        speed: 20,
        bounciness: 4,
      }).start();
    },
    [translateX],
  );

  const dismissCard = React.useCallback(() => {
    if (deleting) return;
    offsetRef.current = -SCREEN_WIDTH;
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 230,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setHidden(true);
      void onDismiss(item).catch(() => {
        setHidden(false);
        snapTo(0, false);
      });
    });
  }, [deleting, item, onDismiss, snapTo, translateX]);

  const markReadCard = React.useCallback(() => {
    offsetRef.current = -SCREEN_WIDTH;
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 230,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      // Hide immediately; the refetch re-renders a fresh card in the "Read" section.
      setHidden(true);
      void onMarkRead(item).catch(() => {
        setHidden(false);
        snapTo(0, false);
      });
    });
  }, [item, onMarkRead, snapTo, translateX]);

  const performAction = React.useCallback(() => {
    if (actionIsDelete) dismissCard();
    else markReadCard();
  }, [actionIsDelete, dismissCard, markReadCard]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !deleting &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.1,
        onPanResponderGrant: () => {
          translateX.stopAnimation((value) => {
            offsetRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          let next = offsetRef.current + gesture.dx;
          next = Math.min(0, Math.max(-SCREEN_WIDTH, next));
          // gentle rubber-band past the open snap so it feels springy, not stuck
          if (next < OPEN_SNAP) next = OPEN_SNAP + (next - OPEN_SNAP) * 0.65;
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const pos = offsetRef.current + gesture.dx;
          if (pos <= FULL_SWIPE || gesture.vx <= -1.1) {
            performAction();
            return;
          }
          if (pos <= OPEN_SNAP / 2 || (gesture.vx < -0.35 && pos < -12)) {
            snapTo(OPEN_SNAP, true);
            return;
          }
          snapTo(0, false);
        },
        onPanResponderTerminate: () => snapTo(0, false),
      }),
    [FULL_SWIPE, OPEN_SNAP, deleting, performAction, snapTo, translateX],
  );

  React.useEffect(() => {
    if (!deleting) setHidden(false);
  }, [deleting]);

  // Action button visibility is tied to the swipe so it stays fully hidden behind
  // the card when closed (no bleed-through), fades in as you open it, then on a
  // full swipe it stretches and quickly dissolves as the action fires.
  const actionOpacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, FULL_SWIPE, OPEN_SNAP, -10, 0],
    outputRange: [0, 1, 1, 0, 0],
    extrapolate: "clamp",
  });
  // The button is anchored to the right; as the swipe deepens past the open snap
  // it stretches in WIDTH toward the notification (growing leftward), keeping a
  // constant gap from the card. Height stays fixed.
  const actionWidth = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, OPEN_SNAP, 0],
    outputRange: [SCREEN_WIDTH - 16, -OPEN_SNAP - 16, -OPEN_SNAP - 16],
    extrapolate: "clamp",
  });

  if (hidden) return null;

  return (
    <View style={styles.swipeFrame}>
      <Animated.View
        style={[styles.swipeActionWrap, { width: actionWidth, opacity: actionOpacity }]}
      >
        <Pressable
          disabled={deleting}
          onPress={performAction}
          accessibilityRole="button"
          accessibilityLabel={actionIsDelete ? deleteLabel : markReadLabel}
          style={({ pressed }) => [
            styles.swipeActionButton,
            {
              backgroundColor: actionIsDelete ? COLORS.error : COLORS.success,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <Feather name={actionIsDelete ? "trash-2" : "check-circle"} size={20} color="#FFFFFF" />
          <Text style={styles.swipeActionText}>{actionIsDelete ? deleteLabel : markReadLabel}</Text>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          disabled={deleting}
          onPress={() => {
            if (open) {
              snapTo(0, false);
              return;
            }
            void onPress(item);
          }}
          style={({ pressed }) => [
            styles.notificationCard,
            {
              backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
              borderColor: isUnread ? COLORS.primary + "35" : colors.border,
              direction,
              opacity: deleting ? 0.65 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.notificationIcon,
              direction === "rtl" ? styles.notificationIconRtl : styles.notificationIconLtr,
              { backgroundColor: tone.background },
            ]}
          >
            <Feather name={tone.icon} size={20} color={tone.color} />
          </View>
          {/* direction:"ltr" physical context + directional padding (clears the absolute
              icon on the start side) so title/body align right in Arabic, left in English */}
          <View
            style={[
              styles.notificationBody,
              { direction: "ltr", paddingLeft: isRTL ? 14 : 58, paddingRight: isRTL ? 58 : 14 },
            ]}
          >
            <View style={styles.notificationHeader}>
              <View
                style={[
                  styles.notificationTitleRow,
                  { flexDirection: "row", justifyContent: isRTL ? "flex-end" : "flex-start" },
                ]}
              >
                {isUnread ? <View style={styles.unreadDot} /> : null}
                <Text
                  style={[styles.notificationTitle, { color: colors.text, textAlign, writingDirection: direction }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>
              <Text style={[styles.notificationTime, { color: colors.textTertiary, textAlign, writingDirection: direction }]}>
                {toEnglishDigits(formatNotificationTime(item.createdAt, locale))}
              </Text>
            </View>
            <Text
              style={[styles.notificationText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}
            >
              {item.body}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    isRTL,
    textAlign,
    direction,
    rowDirection,
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
  const unreadNotifications = React.useMemo(
    () => notifications.filter((item) => !item.readAt),
    [notifications],
  );
  const readNotifications = React.useMemo(
    () => notifications.filter((item) => Boolean(item.readAt)),
    [notifications],
  );
  const unreadCount = data?.unreadCount ?? 0;
  const hasNotifications = notifications.length > 0;
  const titleDirection = isRTL ? "row-reverse" : "row";
  const headerOverlayHeight = insets.top + 104;
  const [deletingIds, setDeletingIds] = React.useState<Set<number>>(() => new Set());
  const [isClearingRead, setIsClearingRead] = React.useState(false);

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

  async function dismissNotification(item: AppNotification) {
    if (!token) return;

    setDeletingIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });

    try {
      await deleteNotification(item.id, token);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    } catch (err) {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      throw err;
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function markReadNotification(item: AppNotification) {
    if (!token || item.readAt) return;
    try {
      await markNotificationRead(item.id, token);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    } catch {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    }
  }

  async function clearReadNotifications() {
    if (!token || isClearingRead || readNotifications.length === 0) return;

    setIsClearingRead(true);
    try {
      await clearReadNotificationsRequest(token);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    } finally {
      setIsClearingRead(false);
    }
  }

  function renderNotificationItems(items: AppNotification[]) {
    return items.map((item) => {
      const tone = getToneMeta(normalizeTone(item.tone));
      const isUnread = !item.readAt;

      return (
        <NotificationCard
          key={item.id}
          item={item}
          tone={tone}
          isUnread={isUnread}
          colors={colors}
          titleDirection={titleDirection}
          direction={direction}
          alignStart={alignStart}
          textAlign={textAlign}
          locale={strings.locale}
          resolvedScheme={resolvedScheme}
          deleteLabel={strings.notifications.delete}
          markReadLabel={strings.notifications.markAsRead}
          deleting={deletingIds.has(item.id)}
          onPress={openNotification}
          onDismiss={dismissNotification}
          onMarkRead={markReadNotification}
        />
      );
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={
          resolvedScheme === "dark"
            ? ["#000000", "#000000", "#000000"]
            : ["#EEF5FF", "#F8FBFF", "#F5F2FF"]
        }
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.topBar,
          {
            height: headerOverlayHeight,
            paddingTop: insets.top + 34,
            flexDirection: rowDirection,
            direction,
          },
        ]}
      >
        <BlurView
          intensity={resolvedScheme === "dark" ? 62 : 92}
          tint={resolvedScheme === "dark" ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: resolvedScheme === "dark"
                ? "rgba(0,0,0,0.92)"
                : "rgba(248,251,255,0.92)",
            },
          ]}
        />
        <View style={[styles.topBarContent, { paddingHorizontal: 18, flexDirection: rowDirection, direction }]}>
          <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
            <Feather name="bell" size={24} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
          </View>
          <View style={[styles.titleBlock, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.notifications.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.notifications.subtitle}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 18,
        }}
      >
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryIcon}>
            <Feather name="inbox" size={21} color={COLORS.primary} />
          </View>
          <View style={[styles.summaryText, { direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
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
          <View style={styles.sections}>
            {unreadNotifications.length > 0 ? (
              <View style={styles.notificationSection}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                    {strings.notifications.unreadSection} ({toEnglishDigits(String(unreadNotifications.length))})
                  </Text>
                </View>
                <View style={styles.sectionList}>{renderNotificationItems(unreadNotifications)}</View>
              </View>
            ) : null}

            {readNotifications.length > 0 ? (
              <View style={styles.notificationSection}>
                <View style={[styles.sectionHeader, styles.readSectionHeader]}>
                  <Pressable
                    disabled={isClearingRead}
                    onPress={() => void clearReadNotifications()}
                    style={({ pressed }) => [
                      styles.clearButton,
                      {
                        backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
                        borderColor: resolvedScheme === "dark" ? "rgba(255,255,255,0.2)" : colors.border,
                        opacity: isClearingRead ? 0.58 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.clearButtonText, { color: colors.text }]}>
                      {strings.notifications.clear}
                    </Text>
                  </Pressable>
                  <View style={styles.readSectionTitleSlot}>
                    <Text style={[styles.sectionTitle, styles.readSectionTitle, { color: colors.textSecondary, writingDirection: direction }]}>
                      {strings.notifications.readSection} ({toEnglishDigits(String(readNotifications.length))})
                    </Text>
                  </View>
                </View>
                <View style={styles.sectionList}>{renderNotificationItems(readNotifications)}</View>
              </View>
            ) : null}
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
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
  },
  topBarContent: {
    zIndex: 1,
    width: "100%",
    flex: 1,
    alignItems: "center",
    gap: 13,
    paddingBottom: 14,
  },
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
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  title: {
    ...FONT.bold,
    fontSize: 29,
    lineHeight: 44,
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 24,
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
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  summaryText: {
    flex: 1,
    gap: 1,
  },
  summaryNumber: {
    ...FONT.bold,
    fontSize: 24,
    lineHeight: 34,
  },
  summaryLabel: {
    ...FONT.semiBold,
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
    ...FONT.bold,
    fontSize: 12,
    color: "#fff",
  },
  stateText: {
    ...FONT.regular,
    fontSize: 13,
    lineHeight: 22,
  },
  sections: {
    gap: 20,
  },
  notificationSection: {
    gap: 10,
  },
  sectionHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  readSectionHeader: {
    direction: "rtl",
  },
  readSectionTitleSlot: {
    flex: 1,
    direction: "ltr",
    alignItems: "flex-start",
  },
  sectionTitle: {
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 24,
  },
  readSectionTitle: {
    textAlign: "left",
  },
  clearButton: {
    minHeight: 34,
    minWidth: 72,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    ...FONT.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionList: {
    gap: 12,
  },
  swipeFrame: {
    position: "relative",
    borderRadius: 24,
  },
  deleteAction: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 104,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  deleteText: {
    ...FONT.bold,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.error,
  },
  markReadAction: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 104,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  markReadText: {
    ...FONT.bold,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.success,
  },
  swipeActionWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    overflow: "hidden",
  },
  swipeActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 6,
  },
  swipeActionText: {
    ...FONT.bold,
    fontSize: 11,
    lineHeight: 16,
    color: "#FFFFFF",
    textAlign: "center",
  },
  notificationCard: {
    position: "relative",
    minHeight: 96,
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  notificationIcon: {
    position: "absolute",
    top: 18,
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  notificationIconRtl: {
    right: 14,
  },
  notificationIconLtr: {
    left: 14,
  },
  notificationBody: {
    width: "100%",
    minWidth: 0,
    alignItems: "stretch",
    gap: 5,
  },
  notificationHeader: {
    width: "100%",
    alignItems: "stretch",
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
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 24,
    flexShrink: 1,
  },
  notificationTime: {
    ...FONT.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  notificationText: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    ...FONT.regular,
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
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  emptyTitle: {
    ...FONT.bold,
    fontSize: 18,
    lineHeight: 28,
  },
  emptyText: {
    ...FONT.regular,
    fontSize: 13,
    lineHeight: 22,
  },
});
