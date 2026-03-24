import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef } from "react";
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_LABELS: Record<string, string> = {
  student: "طالب",
  teacher: "معلم",
  parent: "ولي أمر",
  admin: "مشرف",
  moderator: "مراقب",
  owner: "مالك",
};

const ROLE_COLORS: Record<string, string> = {
  student: "#3B82F6",
  teacher: "#10B981",
  parent: "#F59E0B",
  admin: "#EF4444",
  moderator: "#8B5CF6",
  owner: "#F59E0B",
};

const STATS = [
  { id: "books", label: "الكتب", value: "8", icon: "book" },
  { id: "videos", label: "الفيديوهات", value: "24", icon: "play-circle" },
  { id: "days", label: "الأيام", value: "14", icon: "calendar" },
];

const MENU_ITEMS = [
  { id: "edit", icon: "edit-2", label: "تعديل الملف الشخصي", color: "#3B82F6" },
  { id: "purchases", icon: "shopping-bag", label: "مشترياتي", color: "#10B981" },
  { id: "progress", icon: "trending-up", label: "تقدمي الدراسي", color: "#F59E0B" },
  { id: "notifications", icon: "bell", label: "الإشعارات", color: "#8B5CF6" },
  { id: "help", icon: "help-circle", label: "المساعدة والدعم", color: "#06B6D4" },
  { id: "about", icon: "info", label: "عن التطبيق", color: "#94A3B8" },
];

interface MenuItemProps {
  item: (typeof MENU_ITEMS)[0];
  colors: typeof COLORS.light;
  onPress: () => void;
}

function MenuItem({ item, colors, onPress }: MenuItemProps) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      onPress={onPress}
    >
      <Animated.View style={[styles.menuItem, { backgroundColor: colors.surface, transform: [{ scale }] }]}>
        <Feather name="arrow-left" size={18} color={colors.textTertiary} />
        <View style={styles.menuItemLeft}>
          <Text style={[styles.menuItemLabel, { color: colors.text }]}>{item.label}</Text>
        </View>
        <View style={[styles.menuIcon, { backgroundColor: item.color + "22" }]}>
          <Feather name={item.icon as any} size={18} color={item.color} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد من تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const roleColor = ROLE_COLORS[user?.role ?? "student"] ?? COLORS.primary;
  const roleLabel = ROLE_LABELS[user?.role ?? "student"] ?? "طالب";

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <Feather name="user" size={64} color={colors.textTertiary} />
        <Text style={[styles.noUserTitle, { color: colors.text }]}>لم تسجّل دخولك</Text>
        <Text style={[styles.noUserSub, { color: colors.textSecondary }]}>سجّل دخولك للوصول إلى ملفك الشخصي</Text>
        <Pressable style={styles.loginBtn} onPress={() => router.push("/login")}>
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.loginBtnGrad}>
            <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.registerLink} onPress={() => router.push("/register")}>
          <Text style={[styles.registerLinkText, { color: COLORS.primary }]}>إنشاء حساب جديد</Text>
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
            <Text style={styles.pointsValue}>{user.points?.toLocaleString("ar") ?? "0"}</Text>
            <Text style={styles.pointsLabel}>نقطة</Text>
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
        <Text style={[styles.progressTitle, { color: colors.text }]}>مستوى التعلم</Text>
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
          <Text style={[styles.progressNote, { color: colors.textSecondary }]}>الوصول للمستوى المتقدم</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {MENU_ITEMS.map((item) => (
          <MenuItem key={item.id} item={item} colors={colors} onPress={() => {}} />
        ))}
      </View>

      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <View style={[styles.menuItem, { backgroundColor: colors.surface }]}>
          <Feather name="arrow-left" size={18} color={colors.textTertiary} />
          <View style={styles.menuItemLeft}>
            <Text style={[styles.menuItemLabel, { color: COLORS.error }]}>تسجيل الخروج</Text>
          </View>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.error + "22" }]}>
            <Feather name="log-out" size={18} color={COLORS.error} />
          </View>
        </View>
      </Pressable>

      <View style={{ height: 100 }} />
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
  progressTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  progressBarBg: { height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", borderRadius: 4 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressPercent: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  progressNote: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  menu: { marginHorizontal: 20, marginTop: 16, gap: 10 },
  menuItem: { flexDirection: "row", alignItems: "center", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  menuItemLeft: { flex: 1 },
  menuItemLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 15, textAlign: "right" },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logoutBtn: { marginHorizontal: 20, marginTop: 10 },
  noUserTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, marginTop: 16 },
  noUserSub: { fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "center", marginBottom: 24 },
  loginBtn: { width: "80%", borderRadius: 16, overflow: "hidden" },
  loginBtnGrad: { paddingVertical: 16, alignItems: "center" },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  registerLink: { marginTop: 12 },
  registerLinkText: { fontFamily: "Cairo_600SemiBold", fontSize: 14 },
});
