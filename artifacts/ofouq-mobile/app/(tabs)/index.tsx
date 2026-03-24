import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/Logo";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  onPress: () => void;
}

function QuickAction({ icon, label, color, onPress }: QuickActionProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
      <Animated.View style={[styles.quickAction, { transform: [{ scale }] }]}>
        <View style={[styles.quickActionIcon, { backgroundColor: color + "22" }]}>
          {icon}
        </View>
        <Text style={styles.quickActionLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const ACHIEVEMENTS = [
  { id: 1, title: "قارئ نشيط", desc: "قرأت 5 كتب هذا الشهر", icon: "book", color: "#3B82F6" },
  { id: 2, title: "متعلم ملتزم", desc: "7 أيام متتالية", icon: "award", color: "#F59E0B" },
  { id: 3, title: "نجم الفيديو", desc: "شاهدت 10 فيديوهات", icon: "play-circle", color: "#10B981" },
];

const FEED_ITEMS = [
  {
    id: 1,
    type: "book",
    title: "كتاب الرياضيات المتقدمة",
    subtitle: "الفصل الثالث",
    points: 250,
    rating: 4.8,
  },
  {
    id: 2,
    type: "video",
    title: "شرح معادلات الدرجة الثانية",
    subtitle: "أ. محمد أحمد",
    points: 50,
    duration: "45 دقيقة",
  },
  {
    id: 3,
    type: "book",
    title: "قواعد اللغة العربية",
    subtitle: "المستوى المتقدم",
    points: 180,
    rating: 4.6,
  },
];

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60 }),
    ]).start();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "صباح الخير";
    if (hour < 17) return "مساء الخير";
    return "مساء النور";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <LinearGradient
          colors={["#1D4ED8", "#1E3A8A"]}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <Animated.View
            style={[styles.headerContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <View style={styles.headerTop}>
              <Logo size={40} />
              <Pressable onPress={() => !user && router.push("/login")} style={styles.notifBtn}>
                <Feather name="bell" size={22} color="#fff" />
              </Pressable>
            </View>

            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.userName}>{user?.name ?? "مرحباً بك"}</Text>

            <View style={styles.pointsCard}>
              <View style={styles.pointsLeft}>
                <Ionicons name="star" size={20} color="#FCD34D" />
                <View style={{ marginRight: 8 }}>
                  <Text style={styles.pointsLabel}>نقاطك</Text>
                  <Text style={styles.pointsValue}>{user?.points?.toLocaleString("ar") ?? "0"}</Text>
                </View>
              </View>
              <Pressable
                style={styles.addPointsBtn}
                onPress={() => router.push("/(tabs)/profile")}
              >
                <Text style={styles.addPointsText}>ملفي</Text>
                <Feather name="arrow-left" size={14} color={COLORS.primary} />
              </Pressable>
            </View>
          </Animated.View>
        </LinearGradient>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>وصول سريع</Text>
            <View style={styles.quickActions}>
              <QuickAction
                icon={<Feather name="book" size={22} color="#3B82F6" />}
                label="الكتب"
                color="#3B82F6"
                onPress={() => router.push("/(tabs)/books")}
              />
              <QuickAction
                icon={<Feather name="play-circle" size={22} color="#10B981" />}
                label="الفيديوهات"
                color="#10B981"
                onPress={() => router.push("/(tabs)/videos")}
              />
              <QuickAction
                icon={<Ionicons name="sparkles-outline" size={22} color="#F59E0B" />}
                label="المساعد"
                color="#F59E0B"
                onPress={() => router.push("/(tabs)/chat")}
              />
              <QuickAction
                icon={<Feather name="users" size={22} color="#8B5CF6" />}
                label="المجتمع"
                color="#8B5CF6"
                onPress={() => {}}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>إنجازاتك</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {ACHIEVEMENTS.map((a) => (
                <View key={a.id} style={[styles.achievementCard, { backgroundColor: colors.surface }]}>
                  <View style={[styles.achievementIcon, { backgroundColor: a.color + "22" }]}>
                    <Feather name={a.icon as any} size={20} color={a.color} />
                  </View>
                  <Text style={[styles.achievementTitle, { color: colors.text }]}>{a.title}</Text>
                  <Text style={[styles.achievementDesc, { color: colors.textSecondary }]}>{a.desc}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>مقترح لك</Text>
              <Pressable>
                <Text style={[styles.seeAll, { color: COLORS.primary }]}>عرض الكل</Text>
              </Pressable>
            </View>

            {FEED_ITEMS.map((item) => (
              <Pressable
                key={item.id}
                style={[styles.feedCard, { backgroundColor: colors.surface }]}
              >
                <View style={[styles.feedCardIcon, {
                  backgroundColor: item.type === "book" ? "#3B82F622" : "#10B98122",
                }]}>
                  <Feather
                    name={item.type === "book" ? "book" : "play-circle"}
                    size={24}
                    color={item.type === "book" ? "#3B82F6" : "#10B981"}
                  />
                </View>
                <View style={styles.feedCardContent}>
                  <Text style={[styles.feedCardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.feedCardSubtitle, { color: colors.textSecondary }]}>
                    {item.subtitle}
                  </Text>
                  <View style={styles.feedCardMeta}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={[styles.feedCardPoints, { color: COLORS.accent }]}>
                      {item.points} نقطة
                    </Text>
                    {item.rating && (
                      <Text style={[styles.feedCardRating, { color: colors.textSecondary }]}>
                        {item.rating}
                      </Text>
                    )}
                    {item.duration && (
                      <Text style={[styles.feedCardRating, { color: colors.textSecondary }]}>
                        {item.duration}
                      </Text>
                    )}
                  </View>
                </View>
                <Feather name="arrow-left" size={18} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>

          <View style={{ height: 100 }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerContent: { gap: 4 },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  greeting: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "rgba(255,255,255,0.75)", textAlign: "right" },
  userName: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right", marginBottom: 16 },
  pointsCard: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 16, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pointsLeft: { flexDirection: "row", alignItems: "center" },
  pointsLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "right" },
  pointsValue: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#FCD34D", textAlign: "right" },
  addPointsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addPointsText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: COLORS.primary },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, textAlign: "right", marginBottom: 12 },
  seeAll: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  quickActions: { flexDirection: "row", justifyContent: "space-between" },
  quickAction: { alignItems: "center", gap: 6 },
  quickActionIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#64748B" },
  hScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  achievementCard: { width: 140, borderRadius: 16, padding: 14, marginLeft: 12, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  achievementIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  achievementTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  achievementDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  feedCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 12, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  feedCardIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  feedCardContent: { flex: 1, gap: 3 },
  feedCardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  feedCardSubtitle: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  feedCardMeta: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  feedCardPoints: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  feedCardRating: { fontFamily: "Cairo_400Regular", fontSize: 12 },
});
