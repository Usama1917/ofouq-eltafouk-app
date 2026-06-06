import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { toEnglishDigits } from "@/lib/format";

type SupportUnreadCountResponse = {
  unreadCount: number;
};

function ContactOption({
  icon,
  title,
  onPress,
  badgeCount = 0,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  onPress: () => void;
  badgeCount?: number;
}) {
  const { colors, resolvedScheme, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();
  const isDark = resolvedScheme === "dark";
  const safeBadgeCount = Number.isFinite(badgeCount) ? Math.max(0, Math.floor(badgeCount)) : 0;
  const trailingDirection = isRTL ? "row" : "row-reverse";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.optionRow,
        {
          backgroundColor: isDark
            ? pressed ? "rgba(55,65,81,0.98)" : "rgba(38,38,40,0.98)"
            : pressed ? colors.surfaceSecondary : colors.surface,
          borderColor: isDark
            ? pressed ? "rgba(96,165,250,0.34)" : "rgba(255,255,255,0.14)"
            : colors.border,
          flexDirection: rowDirection,
          direction,
          shadowColor: isDark ? "#000000" : "#1E3A8A",
          shadowOpacity: isDark ? 0.28 : 0.06,
        },
      ]}
    >
      <View style={[styles.optionLeading, { flexDirection: rowDirection, direction }]}>
        <View
          style={[
            styles.optionIcon,
            isDark && {
              backgroundColor: COLORS.darkIconFrame.background,
              borderColor: COLORS.darkIconFrame.border,
            },
          ]}
        >
          <Feather name={icon} size={20} color={isDark ? COLORS.darkIconFrame.foreground : COLORS.primary} />
        </View>
        <View style={[styles.optionTextBlock, { alignItems: alignStart }]}>
          <Text style={[styles.optionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
            {title}
          </Text>
        </View>
      </View>
      <View style={[styles.optionTrailing, { flexDirection: trailingDirection }]}>
        {safeBadgeCount > 0 ? <View style={styles.supportUnreadBadge} /> : null}
        <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

export default function ContactScreen() {
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
  const headerOverlayHeight = insets.top + 104;
  const { data: supportUnreadSummary, refetch: refetchSupportUnreadCount } = useQuery<SupportUnreadCountResponse>({
    queryKey: ["support", "me", "unread-count", token],
    queryFn: () => apiFetch("/api/support/me/unread-count", { token }),
    enabled: Boolean(user && token),
    refetchInterval: 6000,
  });
  const supportUnreadCount = user ? supportUnreadSummary?.unreadCount ?? 0 : 0;

  useFocusEffect(
    React.useCallback(() => {
      if (user && token) {
        void refetchSupportUnreadCount();
      }
    }, [refetchSupportUnreadCount, token, user]),
  );

  function openHotline() {
    if (user && token) {
      void apiFetch("/api/support/hotline-call", {
        method: "POST",
        token,
        body: JSON.stringify({ hotlineNumber: "17057" }),
      }).catch(() => undefined);
    }
    void Linking.openURL("tel:17057");
  }

  function openWhatsApp() {
    Linking.openURL("whatsapp://send?phone=201080080076").catch(() => {
      void Linking.openURL("https://wa.me/201080080076");
    });
  }

  function openSupportChat() {
    router.push(user ? "/(tabs)/settings/support-chat" : "/login");
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

      <View style={[styles.pageBackWrap, { top: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.pageBackButton,
            {
              backgroundColor: pressed ? colors.surfaceSecondary : colors.card,
              borderColor: colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={strings.common.back}
        >
          <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={20} color={colors.textSecondary} />
          <Text style={[styles.pageBackText, { color: colors.text, writingDirection: direction }]}>
            {strings.common.back}
          </Text>
        </Pressable>
      </View>

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
            <MaterialCommunityIcons
              name="message-text-outline"
              size={25}
              color={resolvedScheme === "dark" ? COLORS.darkIconFrame.foreground : COLORS.primary}
            />
            <View style={styles.titlePhoneBadge}>
              <Feather name="phone" size={12} color="#FFFFFF" strokeWidth={2.6} />
            </View>
          </View>
          <View style={[styles.titleBlock, { alignItems: alignStart }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.settings.contactUs}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
              {strings.settings.contactUsSubtitle}
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
          <ContactOption
            icon="phone"
            title={strings.settings.contactHotline}
            onPress={openHotline}
          />
          <ContactOption
            icon="message-circle"
            title={strings.settings.contactWhatsApp}
            onPress={openWhatsApp}
          />
          <ContactOption
            icon="headphones"
            title={strings.settings.appSupport}
            onPress={openSupportChat}
            badgeCount={supportUnreadCount}
          />
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
  pageBackWrap: {
    position: "absolute",
    left: 18,
    zIndex: 20,
  },
  pageBackButton: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  pageBackText: {
    ...FONT.bold,
    fontSize: 15,
    lineHeight: 24,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    minHeight: 64,
    gap: 13,
  },
  titleIcon: {
    width: 56,
    height: 56,
    borderRadius: 21,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  titlePhoneBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  titleBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    ...FONT.bold,
    fontSize: 27,
    lineHeight: 38,
    textAlign: "right",
  },
  subtitle: {
    ...FONT.regular,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "right",
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 8,
    gap: 12,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  optionRow: {
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 2,
  },
  optionLeading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 12,
  },
  optionIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.primary + "18",
    backgroundColor: COLORS.primary + "12",
  },
  optionTextBlock: {
    flex: 1,
    minHeight: 46,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  optionTitle: {
    ...FONT.bold,
    fontSize: 14,
    lineHeight: 25,
    textAlign: "right",
  },
  optionTrailing: {
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
});
