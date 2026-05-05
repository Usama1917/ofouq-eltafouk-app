import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
import { toEnglishDigits } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";

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
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const avatarUri = resolveMediaUrl(user?.avatarUrl);

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
        <View style={[styles.titleRow, { flexDirection: rowDirection, direction }]}>
          <View style={styles.titleIcon}>
            <Feather name="settings" size={24} color={COLORS.primary} />
          </View>
          <View style={[styles.titleBlock, { alignItems: alignStart }]}>
            <Text style={[styles.title, { color: colors.text, textAlign, writingDirection: direction }]}>
              {strings.settings.title}
            </Text>
          </View>
        </View>

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
              <View style={styles.contactIcon}>
                <Feather name="phone-call" size={20} color={COLORS.primary} />
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
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={19}
              color={colors.textTertiary}
            />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  accountSubtitle: {
    fontFamily: "Cairo_400Regular",
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
    fontFamily: "Cairo_700Bold",
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "12",
  },
  contactTextBlock: { flex: 1, alignItems: "flex-end" },
  contactTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  contactSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
  },
});
