import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React from "react";
import {
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
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";

type SupportUnreadCountResponse = {
  unreadCount: number;
};

export default function SettingsScreen() {
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
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const avatarUri = resolveMediaUrl(user?.avatarUrl);
  const headerOverlayHeight = insets.top + 104;
  const { data: supportUnreadSummary, refetch: refetchSupportUnreadCount } = useQuery<SupportUnreadCountResponse>({
    queryKey: ["support", "me", "unread-count", token],
    queryFn: () => apiFetch("/api/support/me/unread-count", { token }),
    enabled: Boolean(user && token),
    refetchInterval: 6000,
  });
  const supportUnreadCount = user ? supportUnreadSummary?.unreadCount ?? 0 : 0;
  const subscriptionsSubtitle = user ? strings.settings.subscriptionsSubtitle : strings.settings.accountLoginSubtitle;

  useFocusEffect(
    React.useCallback(() => {
      if (user && token) {
        void refetchSupportUnreadCount();
      }
    }, [refetchSupportUnreadCount, token, user]),
  );

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
          intensity={resolvedScheme === "dark" ? 34 : 58}
          tint={resolvedScheme === "dark" ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: resolvedScheme === "dark"
                ? "rgba(0,0,0,0.86)"
                : "rgba(248,251,255,0.68)",
            },
          ]}
        />
        <View style={[styles.topBarContent, { paddingHorizontal: 18, flexDirection: rowDirection, direction }]}>
          <View style={[styles.titleIcon, resolvedScheme === "dark" && { backgroundColor: COLORS.darkIconFrame.background, borderColor: COLORS.darkIconFrame.border }]}>
            <Feather name="settings" size={24} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
          </View>
          <View style={[styles.titleBlock, { alignItems: alignStart }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.settings.title}
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
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.cardTitleRow, { alignSelf: alignStart, flexDirection: rowDirection, direction }]}>
            <Feather name="user" size={20} color={COLORS.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.settings.account}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push(user ? "/(tabs)/settings/account" : "/login")}
            style={({ pressed }) => [
              styles.accountRow,
              {
                backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
                flexDirection: rowDirection,
                direction,
              },
            ]}
          >
            <View style={[styles.accountLeading, { flexDirection: rowDirection, direction }]}>
              <View style={styles.accountIcon}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.accountImage} contentFit="cover" />
                ) : (
                  <Text style={styles.accountInitial}>
                    {user?.name?.charAt(0) ?? strings.settings.accountInitial}
                  </Text>
                )}
              </View>
              <View style={[styles.accountTextBlock, { alignItems: alignStart }]}>
                <Text style={[styles.accountTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                  {user ? toEnglishDigits(user.name) : strings.common.signIn}
                </Text>
                <Text
                  style={[
                    styles.accountSubtitle,
                    { color: colors.textSecondary, textAlign, writingDirection: direction },
                  ]}
                >
                  {user ? strings.settings.accountManage : strings.settings.accountLoginSubtitle}
                </Text>
              </View>
            </View>
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={19}
              color={colors.textTertiary}
            />
          </Pressable>

        </View>

        <View style={[styles.subscriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push(user ? "/(tabs)/settings/watch-history" : "/login")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.subscriptionRow,
              {
                backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
                flexDirection: rowDirection,
                direction,
              },
            ]}
          >
            <View style={[styles.subscriptionLeading, { flexDirection: rowDirection, direction }]}>
              <View
                style={[
                  styles.subscriptionIcon,
                  resolvedScheme === "dark" && {
                    backgroundColor: COLORS.darkIconFrame.background,
                    borderColor: COLORS.darkIconFrame.border,
                  },
                ]}
              >
                <Feather name="activity" size={23} color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary} />
              </View>
              <View style={[styles.subscriptionTextBlock, { alignItems: alignStart }]}>
                <Text style={[styles.subscriptionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                  {strings.settings.subscriptions}
                </Text>
                <Text
                  style={[
                    styles.subscriptionSubtitle,
                    { color: colors.textSecondary, textAlign, writingDirection: direction },
                  ]}
                  numberOfLines={1}
                >
                  {toEnglishDigits(subscriptionsSubtitle)}
                </Text>
              </View>
            </View>
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={19}
              color={colors.textTertiary}
            />
          </Pressable>
        </View>

        <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push("/(tabs)/settings/contact" as any)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.contactRow,
              {
                backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
                flexDirection: rowDirection,
                direction,
              },
            ]}
          >
            <View style={[styles.contactLeading, { flexDirection: rowDirection, direction }]}>
              <View
                style={[
                  styles.contactIcon,
                  resolvedScheme === "dark" && {
                    backgroundColor: COLORS.darkIconFrame.background,
                    borderColor: COLORS.darkIconFrame.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="message-text-outline"
                  size={24}
                  color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary}
                />
                <View style={styles.contactPhoneBadge}>
                  <Feather name="phone" size={10} color="#FFFFFF" strokeWidth={2.6} />
                </View>
              </View>
              <View style={[styles.contactTextBlock, { alignItems: alignStart }]}>
                <Text style={[styles.contactTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
                  {strings.settings.contactUs}
                </Text>
                <Text
                  style={[
                    styles.contactSubtitle,
                    { color: colors.textSecondary, textAlign, writingDirection: direction },
                  ]}
                >
                  {toEnglishDigits(strings.settings.contactUsSubtitle)}
                </Text>
              </View>
            </View>
            <View style={[styles.contactTrailing, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
              {supportUnreadCount > 0 ? <View style={styles.supportUnreadBadge} /> : null}
              <Feather
                name={isRTL ? "chevron-left" : "chevron-right"}
                size={19}
                color={colors.textTertiary}
              />
            </View>
          </Pressable>
        </View>
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
    flexDirection: "row-reverse",
    alignItems: "center",
    minHeight: 60,
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
  titleBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    fontWeight: "700",
    fontSize: 27,
    lineHeight: 38,
    textAlign: "right",
  },
  subtitle: {
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  cardTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-end",
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 17,
    textAlign: "right",
  },
  optionRow: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextBlock: { flex: 1, alignItems: "flex-end" },
  optionLabel: {
    fontWeight: "700",
    fontSize: 15,
    textAlign: "right",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: COLORS.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  accountRow: {
    minHeight: 66,
    borderRadius: 18,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  accountLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  accountTextBlock: { flex: 1, alignItems: "flex-end" },
  accountTitle: {
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
  },
  accountSubtitle: {
    fontWeight: "400",
    fontSize: 12,
    textAlign: "right",
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    overflow: "hidden",
  },
  accountImage: {
    width: "100%",
    height: "100%",
  },
  accountInitial: {
    fontWeight: "700",
    fontSize: 18,
    color: "#fff",
  },
  contactCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 10,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
  },
  subscriptionCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 10,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
  },
  subscriptionRow: {
    minHeight: 64,
    borderRadius: 18,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  subscriptionLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  subscriptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  subscriptionTextBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  subscriptionTitle: {
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 26,
    textAlign: "right",
  },
  subscriptionSubtitle: {
    fontWeight: "400",
    fontSize: 12,
    textAlign: "right",
  },
  contactRow: {
    minHeight: 64,
    borderRadius: 18,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  contactLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  contactPhoneBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  contactTextBlock: { flex: 1, alignItems: "flex-end" },
  contactTrailing: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  supportUnreadBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    backgroundColor: COLORS.error,
  },
  contactTitle: {
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
  },
  contactSubtitle: {
    fontWeight: "400",
    fontSize: 12,
    textAlign: "right",
  },
});
