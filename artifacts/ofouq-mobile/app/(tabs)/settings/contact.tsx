import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
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

function ContactOption({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { colors, isRTL, textAlign, direction, rowDirection, alignStart } = usePreferences();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.optionRow,
        {
          backgroundColor: pressed ? colors.surfaceSecondary : colors.surface,
          flexDirection: rowDirection,
          direction,
        },
      ]}
    >
      <View style={[styles.optionLeading, { flexDirection: rowDirection, direction }]}>
        <View style={styles.optionIcon}>
          <Feather name={icon} size={20} color={COLORS.primary} />
        </View>
        <View style={[styles.optionTextBlock, { alignItems: alignStart }]}>
          <Text style={[styles.optionTitle, { color: colors.text, textAlign, writingDirection: direction }]}>
            {title}
          </Text>
          <Text style={[styles.optionSubtitle, { color: colors.textSecondary, textAlign, writingDirection: direction }]}>
            {toEnglishDigits(subtitle)}
          </Text>
        </View>
      </View>
      <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.textTertiary} />
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
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  function openHotline() {
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
            ? ["#0A0F1E", "#111827", "#0F172A"]
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
          <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={colors.textSecondary} />
          <Text style={[styles.pageBackText, { color: colors.text, writingDirection: direction }]}>
            {strings.common.back}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 74,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 118,
          gap: 18,
        }}
      >
        <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
          <View style={styles.titleIcon}>
            <Feather name="phone-call" size={24} color={COLORS.primary} />
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

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ContactOption
            icon="phone"
            title={strings.settings.contactHotline}
            subtitle={strings.settings.contactHotlineSubtitle}
            onPress={openHotline}
          />
          <ContactOption
            icon="message-circle"
            title={strings.settings.contactWhatsApp}
            subtitle={strings.settings.contactWhatsAppSubtitle}
            onPress={openWhatsApp}
          />
          <ContactOption
            icon="headphones"
            title={strings.settings.appSupport}
            subtitle={strings.settings.appSupportSubtitle}
            onPress={openSupportChat}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    lineHeight: 22,
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  titleBlock: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 27,
    lineHeight: 38,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  optionRow: {
    minHeight: 72,
    borderRadius: 18,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
    backgroundColor: COLORS.primary + "12",
  },
  optionTextBlock: { flex: 1, alignItems: "flex-end" },
  optionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    lineHeight: 24,
    textAlign: "right",
  },
  optionSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    lineHeight: 21,
    textAlign: "right",
  },
});
