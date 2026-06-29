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
  FlatList,
  Modal,
  PanResponder,
  Pressable,
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

// review F-27: Arabic counts the noun with four forms — singular (1), dual (2),
// plural (3–10), then back to the singular noun for 11+. The old code always
// used one form ("منذ 2 دقيقة"), which is ungrammatical. Build the correct form
// per unit. Numbers stay Western (the caller wraps the result in toEnglishDigits).
function arabicRelativeTime(
  count: number,
  forms: { singular: string; dual: string; plural: string; many: string },
) {
  if (count === 1) return `منذ ${forms.singular}`;
  if (count === 2) return `منذ ${forms.dual}`;
  if (count >= 3 && count <= 10) return `منذ ${count} ${forms.plural}`;
  return `منذ ${count} ${forms.many}`;
}

function formatNotificationTime(value: string, locale: string) {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) return "";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  const isArabic = locale.startsWith("ar");
  if (diffSeconds < 60) return isArabic ? "الآن" : "Now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return isArabic
      ? arabicRelativeTime(diffMinutes, { singular: "دقيقة", dual: "دقيقتين", plural: "دقائق", many: "دقيقة" })
      : `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return isArabic
      ? arabicRelativeTime(diffHours, { singular: "ساعة", dual: "ساعتين", plural: "ساعات", many: "ساعة" })
      : `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return isArabic
      ? arabicRelativeTime(diffDays, { singular: "يوم", dual: "يومين", plural: "أيام", many: "يوم" })
      : `${diffDays}d ago`;
  }

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

// review F-24: memoized so a re-render of NotificationsScreen (e.g. the 30s
// refetch interval, or another card's swipe state changing) does not re-render
// every row. Relies on the parent passing stable callbacks/props (see the
// useCallback-wrapped handlers below).
const NotificationCard = React.memo(function NotificationCard({
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
        // PHASE 1 — decide whether to grab the card vs. let the list scroll.
        // Only take over when the gesture is meaningfully horizontal (dx leads dy), so a
        // normal vertical scroll passes straight through to the FlatList and stays
        // natural. The dx > 6 floor ignores tiny taps. We don't need an extreme ratio
        // here anymore because, once grabbed, the lock below holds the swipe.
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (deleting) return false;
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          return dx > 6 && dx > dy * 0.5;
        },
        // Same decision in the CAPTURE phase, so a horizontal swipe wins the responder
        // BEFORE the surrounding vertical FlatList starts scrolling (that race used to
        // let the list "steal" the swipe on a little vertical drift).
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (deleting) return false;
          const dx = Math.abs(gesture.dx);
          const dy = Math.abs(gesture.dy);
          return dx > 6 && dx > dy * 0.5;
        },
        // PHASE 2 — once we've grabbed the card, NEVER hand the responder back to the
        // scroll view. This is what makes vertical movement fully ignored mid-swipe: the
        // card stays locked to the finger's horizontal travel and can't be yanked away,
        // which is what previously made it snap back / "stick".
        onPanResponderTerminationRequest: () => false,
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
});

export default function NotificationsScreen() {
  const {
    colors,
    resolvedScheme,
    strings,
    language,
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
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  // review F-24: per-item handlers are useCallback-stable (deps: token,
  // queryClient — both stable) so the memoized NotificationCard rows don't
  // re-render just because the parent re-rendered.
  const openNotification = React.useCallback(
    async (item: AppNotification) => {
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
    },
    [queryClient, token],
  );

  const dismissNotification = React.useCallback(
    async (item: AppNotification) => {
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
    },
    [queryClient, token],
  );

  const markReadNotification = React.useCallback(
    async (item: AppNotification) => {
      if (!token || item.readAt) return;
      try {
        await markNotificationRead(item.id, token);
        await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      } catch {
        await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
      }
    },
    [queryClient, token],
  );

  async function clearReadNotifications() {
    if (!token || isClearingRead || readNotifications.length === 0) return;

    setConfirmClearOpen(false);
    setIsClearingRead(true);
    try {
      await clearReadNotificationsRequest(token);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    } finally {
      setIsClearingRead(false);
    }
  }

  // Custom themed confirmation (instead of the native Alert) so the title can be
  // centered and the body right-aligned in Arabic — the OS dialog ignores RTL.
  function confirmClearReadNotifications() {
    if (isClearingRead || readNotifications.length === 0) return;
    setConfirmClearOpen(true);
  }

  const renderNotificationCard = React.useCallback(
    (item: AppNotification) => {
      const tone = getToneMeta(normalizeTone(item.tone));
      const isUnread = !item.readAt;

      return (
        <NotificationCard
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
    },
    [
      alignStart,
      colors,
      deletingIds,
      direction,
      dismissNotification,
      markReadNotification,
      openNotification,
      resolvedScheme,
      strings.locale,
      strings.notifications.delete,
      strings.notifications.markAsRead,
      textAlign,
      titleDirection,
    ],
  );

  // Flatten the (header summary + sections + state cards) into a single data
  // source so the list can virtualize. The summary card lives in the list
  // header; everything below it (state cards, section headers, notification
  // rows, empty card) is a typed row here. Notification row keys embed the
  // read-state so a card that gets marked read remounts FRESH in the "Read"
  // section instead of reusing the swiped-away (hidden) "Unread" instance —
  // otherwise a marked-read card stays hidden and looks like it was deleted.
  type ListRow =
    | { type: "state-loading"; key: string }
    | { type: "state-error"; key: string }
    | { type: "section-header"; key: string; section: "unread" | "read" }
    | { type: "notification"; key: string; item: AppNotification }
    | { type: "empty"; key: string };

  const listData = React.useMemo<ListRow[]>(() => {
    if (isLoading) return [{ type: "state-loading", key: "state-loading" }];
    if (isError) return [{ type: "state-error", key: "state-error" }];

    if (!hasNotifications) return [{ type: "empty", key: "empty" }];

    const rows: ListRow[] = [];
    if (unreadNotifications.length > 0) {
      rows.push({ type: "section-header", key: "header-unread", section: "unread" });
      for (const item of unreadNotifications) {
        rows.push({ type: "notification", key: `notification-${item.readAt ? "read" : "unread"}-${item.id}`, item });
      }
    }
    if (readNotifications.length > 0) {
      rows.push({ type: "section-header", key: "header-read", section: "read" });
      for (const item of readNotifications) {
        rows.push({ type: "notification", key: `notification-${item.readAt ? "read" : "unread"}-${item.id}`, item });
      }
    }
    return rows;
  }, [hasNotifications, isError, isLoading, readNotifications, unreadNotifications]);

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

      <FlatList
        data={listData}
        keyExtractor={(row) => row.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: headerOverlayHeight + 18,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
        }}
        ListHeaderComponent={
          <View style={[styles.summaryCard, styles.summaryCardSpacing, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
        }
        renderItem={({ item: row }) => {
          if (row.type === "state-loading") {
            return (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={[styles.stateText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.common.loading}
                </Text>
              </View>
            );
          }

          if (row.type === "state-error") {
            return (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="wifi-off" size={28} color={COLORS.warning} />
                <Text style={[styles.stateText, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                  {strings.common.unexpectedError}
                </Text>
                <Pressable onPress={() => void refetch()} disabled={isFetching} style={styles.retryButton}>
                  <Text style={styles.retryText}>{isFetching ? strings.common.retrying : strings.common.retry}</Text>
                </Pressable>
              </View>
            );
          }

          if (row.type === "empty") {
            return (
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
            );
          }

          if (row.type === "section-header") {
            if (row.section === "unread") {
              return (
                <View style={[styles.sectionHeader, styles.sectionHeaderSpacing]}>
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
                    {strings.notifications.unreadSection} ({toEnglishDigits(String(unreadNotifications.length))})
                  </Text>
                </View>
              );
            }
            return (
              <View style={[styles.sectionHeader, styles.readSectionHeader, styles.sectionHeaderSpacing, styles.readSectionHeaderSpacing]}>
                <Pressable
                  disabled={isClearingRead}
                  onPress={confirmClearReadNotifications}
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
            );
          }

          return <View style={styles.notificationRowSpacing}>{renderNotificationCard(row.item)}</View>;
        }}
      />

      <Modal
        visible={confirmClearOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmClearOpen(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmClearOpen(false)} />
          <View
            style={[
              styles.confirmCard,
              {
                backgroundColor: resolvedScheme === "dark" ? "rgba(28,28,30,0.98)" : "rgba(248,250,252,0.98)",
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.confirmIcon}>
              <Feather name="trash-2" size={24} color={COLORS.error} />
            </View>
            {/* Title centered; body follows the reading direction (right in Arabic). */}
            <Text style={[styles.confirmTitle, { color: colors.text, writingDirection: direction }]}>
              {language === "ar" ? "مسح الإشعارات المقروءة" : "Clear read notifications"}
            </Text>
            <Text
              style={[
                styles.confirmBody,
                {
                  color: colors.textSecondary,
                  // Modal portals can drop the RTL context (esp. Android), so pin
                  // the body alignment explicitly per language instead of relying
                  // on the inherited textAlign — Arabic must read right.
                  textAlign: language === "ar" ? "right" : "left",
                  writingDirection: direction,
                },
              ]}
            >
              {language === "ar"
                ? "سيتم حذف جميع الإشعارات التي تمت قراءتها. لا يمكن التراجع عن هذا الإجراء."
                : "All read notifications will be permanently removed. This action cannot be undone."}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmClearOpen(false)}
                style={({ pressed }) => [
                  styles.confirmButton,
                  styles.confirmCancelButton,
                  {
                    backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.confirmButtonText, { color: colors.text }]}>{strings.common.cancel}</Text>
              </Pressable>
              <Pressable
                onPress={() => void clearReadNotifications()}
                style={({ pressed }) => [
                  styles.confirmButton,
                  styles.confirmDeleteButton,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.confirmDeleteText}>{strings.notifications.clear}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  // Spacing helpers replace the ScrollView/section flex gaps now that rows are
  // laid out individually inside the FlatList.
  summaryCardSpacing: {
    marginBottom: 18,
  },
  sectionHeaderSpacing: {
    marginBottom: 10,
  },
  readSectionHeaderSpacing: {
    marginTop: 20,
  },
  notificationRowSpacing: {
    marginBottom: 12,
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
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  confirmTitle: {
    ...FONT.bold,
    fontSize: 18,
    lineHeight: 28,
    width: "100%",
    textAlign: "center",
  },
  confirmBody: {
    ...FONT.regular,
    fontSize: 14,
    lineHeight: 23,
    width: "100%",
  },
  confirmActions: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  confirmButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  confirmCancelButton: {
    borderWidth: 1,
  },
  confirmDeleteButton: {
    backgroundColor: COLORS.error,
  },
  confirmButtonText: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 22,
  },
  confirmDeleteText: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 22,
    color: "#FFFFFF",
  },
});
