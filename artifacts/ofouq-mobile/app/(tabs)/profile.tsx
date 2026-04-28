import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme, ThemePreference } from "@/contexts/ThemeContext";
import { useLanguage, Language } from "@/contexts/LanguageContext";

interface MenuItemProps {
  icon: string;
  label: string;
  color: string;
  colors: typeof COLORS.light;
  onPress: () => void;
}

function MenuItem({ icon, label, color, colors, onPress }: MenuItemProps) {
  const { isRTL } = useLanguage();
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View style={[styles.menuItem, { backgroundColor: colors.surface, transform: [{ scale }] }]}>
        <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={colors.textTertiary} />
        <View style={styles.menuItemLeft}>
          <Text style={[styles.menuItemLabel, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{label}</Text>
        </View>
        <View style={[styles.menuIcon, { backgroundColor: color + "22" }]}>
          <Feather name={icon as any} size={18} color={color} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

interface ChoiceSheetProps {
  visible: boolean;
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  colors: typeof COLORS.light;
  isRTL: boolean;
}

function ChoiceSheet({ visible, title, options, selected, onSelect, onClose, colors, isRTL }: ChoiceSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{title}</Text>
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.sheetOption, { borderColor: colors.border, backgroundColor: selected === opt.value ? COLORS.primary + "14" : "transparent" }]}
              onPress={() => { onSelect(opt.value); onClose(); }}
            >
              <View style={[styles.sheetCheck, { borderColor: selected === opt.value ? COLORS.primary : colors.textTertiary, backgroundColor: selected === opt.value ? COLORS.primary : "transparent" }]}>
                {selected === opt.value && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={[styles.sheetOptionText, { color: colors.text, textAlign: isRTL ? "right" : "left", flex: 1 }]}>{opt.label}</Text>
            </Pressable>
          ))}
          <View style={{ height: 24 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { colors, isDark, preference, setPreference } = useAppTheme();
  const { language, isRTL, t, setLanguage } = useLanguage();
  const { user, logout } = useAuth();

  const [showLangSheet, setShowLangSheet] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);

  const roleLabels: Record<string, string> = {
    student: t.roles.student,
    teacher: t.roles.teacher,
    parent: t.roles.parent,
    admin: t.roles.admin,
    moderator: t.roles.moderator,
    owner: t.roles.owner,
  };

  const roleColors: Record<string, string> = {
    student: "#3B82F6", teacher: "#10B981", parent: "#F59E0B",
    admin: "#EF4444", moderator: "#8B5CF6", owner: "#F59E0B",
  };

  const STATS = [
    { id: "books", label: t.profile.books, value: "8" },
    { id: "videos", label: t.profile.videos, value: "24" },
    { id: "days", label: t.profile.days, value: "14" },
  ];

  const MENU_ITEMS = [
    { id: "edit", icon: "edit-2", label: t.profile.editProfile, color: "#3B82F6" },
    { id: "purchases", icon: "shopping-bag", label: t.profile.myPurchases, color: "#10B981" },
    { id: "progress", icon: "trending-up", label: t.profile.academicProgress, color: "#F59E0B" },
    { id: "notifications", icon: "bell", label: t.profile.notifications, color: "#8B5CF6" },
    { id: "help", icon: "help-circle", label: t.profile.helpSupport, color: "#06B6D4" },
    { id: "about", icon: "info", label: t.profile.about, color: "#94A3B8" },
  ];

  const langOptions = [
    { value: "ar", label: t.settings.languageArabic },
    { value: "en", label: t.settings.languageEnglish },
  ];

  const themeOptions = [
    { value: "system", label: t.settings.themeSystem },
    { value: "light", label: t.settings.themeLight },
    { value: "dark", label: t.settings.themeDark },
  ];

  const currentLangLabel = langOptions.find(o => o.value === language)?.label ?? "";
  const currentThemeLabel = themeOptions.find(o => o.value === preference)?.label ?? "";

  const handleLogout = () => {
    Alert.alert(
      t.auth.logoutConfirmTitle,
      t.auth.logoutConfirmMessage,
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.auth.logoutConfirmButton,
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ]
    );
  };

  const roleColor = roleColors[user?.role ?? "student"] ?? COLORS.primary;
  const roleLabel = roleLabels[user?.role ?? "student"] ?? t.roles.student;

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Feather name="user" size={64} color={colors.textTertiary} />
        <Text style={[styles.noUserTitle, { color: colors.text }]}>{t.auth.notLoggedIn}</Text>
        <Text style={[styles.noUserSub, { color: colors.textSecondary }]}>{t.auth.notLoggedInSub}</Text>
        <Pressable style={styles.loginBtn} onPress={() => router.push("/login")}>
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.loginBtnGrad}>
            <Text style={styles.loginBtnText}>{t.auth.login}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.registerLink} onPress={() => router.push("/register")}>
          <Text style={[styles.registerLinkText, { color: COLORS.primary }]}>{t.auth.createAccount}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={["#1D4ED8", "#1E3A8A"]} style={styles.profileHeader}>
        <View style={styles.avatarWrapper}>
          <LinearGradient colors={[roleColor, roleColor + "BB"]} style={styles.avatar}>
            <Text style={styles.avatarInitial}>{user.name?.[0] ?? "م"}</Text>
          </LinearGradient>
          <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
            <Text style={styles.roleBadgeText}>{roleLabel}</Text>
          </View>
        </View>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
        {user.governorate && (
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.locationText}>{user.governorate}</Text>
          </View>
        )}
        <View style={styles.statsRow}>
          <View style={styles.pointsStat}>
            <Ionicons name="star" size={18} color="#FCD34D" />
            <Text style={styles.pointsValue}>{user.points?.toLocaleString(language === "ar" ? "ar" : "en") ?? "0"}</Text>
            <Text style={styles.pointsLabel}>{t.profile.points}</Text>
          </View>
          {STATS.map((s) => (
            <View key={s.id} style={styles.statBox}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={[styles.progressSection, { backgroundColor: colors.surface }]}>
        <Text style={[styles.progressTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{t.profile.learningLevel}</Text>
        <View style={styles.progressBarBg}>
          <LinearGradient
            colors={[COLORS.accent, COLORS.accentLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBarFill, { width: "68%" }]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={[styles.progressPercent, { color: COLORS.accent }]}>68%</Text>
          <Text style={[styles.progressNote, { color: colors.textSecondary }]}>{t.profile.advancedLevel}</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {MENU_ITEMS.map((item) => (
          <MenuItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            color={item.color}
            colors={colors}
            onPress={() => {}}
          />
        ))}
      </View>

      <View style={[styles.settingsSection, { marginHorizontal: 20, marginTop: 20 }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>
          {t.settings.settingsSection}
        </Text>

        <Pressable
          style={[styles.settingRow, { backgroundColor: colors.surface }]}
          onPress={() => setShowLangSheet(true)}
        >
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{currentLangLabel}</Text>
          <View style={styles.settingLeft}>
            <Text style={[styles.settingLabel, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{t.settings.language}</Text>
          </View>
          <View style={[styles.menuIcon, { backgroundColor: "#3B82F622" }]}>
            <Feather name="globe" size={18} color="#3B82F6" />
          </View>
        </Pressable>

        <Pressable
          style={[styles.settingRow, { backgroundColor: colors.surface }]}
          onPress={() => setShowThemeSheet(true)}
        >
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{currentThemeLabel}</Text>
          <View style={styles.settingLeft}>
            <Text style={[styles.settingLabel, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{t.settings.theme}</Text>
          </View>
          <View style={[styles.menuIcon, { backgroundColor: "#F59E0B22" }]}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color="#F59E0B" />
          </View>
        </Pressable>
      </View>

      <Pressable style={[styles.logoutBtn, { marginHorizontal: 20, marginTop: 10 }]} onPress={handleLogout}>
        <View style={[styles.menuItem, { backgroundColor: colors.surface }]}>
          <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={colors.textTertiary} />
          <View style={styles.menuItemLeft}>
            <Text style={[styles.menuItemLabel, { color: COLORS.error, textAlign: isRTL ? "right" : "left" }]}>{t.auth.logout}</Text>
          </View>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.error + "22" }]}>
            <Feather name="log-out" size={18} color={COLORS.error} />
          </View>
        </View>
      </Pressable>

      <View style={{ height: 100 }} />

      <ChoiceSheet
        visible={showLangSheet}
        title={t.settings.language}
        options={langOptions}
        selected={language}
        onSelect={(v) => setLanguage(v as Language)}
        onClose={() => setShowLangSheet(false)}
        colors={colors}
        isRTL={isRTL}
      />
      <ChoiceSheet
        visible={showThemeSheet}
        title={t.settings.theme}
        options={themeOptions}
        selected={preference}
        onSelect={(v) => setPreference(v as ThemePreference)}
        onClose={() => setShowThemeSheet(false)}
        colors={colors}
        isRTL={isRTL}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, alignItems: "center", gap: 6, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  avatarWrapper: { position: "relative", marginBottom: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.3)" },
  avatarInitial: { fontFamily: "Cairo_700Bold", fontSize: 32, color: "#fff" },
  roleBadge: { position: "absolute", bottom: -4, right: -4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: "#fff" },
  roleBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  userName: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  userEmail: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14 },
  pointsStat: { alignItems: "center", flexDirection: "row", gap: 6, flex: 1.4 },
  pointsValue: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#FCD34D" },
  pointsLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" },
  progressSection: { marginHorizontal: 20, marginTop: 16, borderRadius: 16, padding: 16, gap: 10 },
  progressTitle: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  progressBarBg: { height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 4 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressPercent: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  progressNote: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  menu: { marginHorizontal: 20, marginTop: 16, gap: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  menuItemLeft: { flex: 1 },
  menuItemLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 15 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logoutBtn: {},
  noUserTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, marginTop: 16 },
  noUserSub: { fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "center", marginBottom: 24 },
  loginBtn: { width: "80%", borderRadius: 16, overflow: "hidden" },
  loginBtnGrad: { paddingVertical: 16, alignItems: "center" },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  registerLink: { marginTop: 12 },
  registerLinkText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
  settingsSection: { gap: 10 },
  sectionTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  settingRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  settingLeft: { flex: 1 },
  settingLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 15 },
  settingValue: { fontFamily: "Cairo_400Regular", fontSize: 13 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#CBD5E1", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, marginBottom: 8 },
  sheetOption: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  sheetOptionText: { fontFamily: "Cairo_600SemiBold", fontSize: 15 },
  sheetCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
