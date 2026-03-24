import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

import { COLORS } from "@/constants/colors";

const SUBJECTS = ["الكل", "رياضيات", "فيزياء", "علوم", "لغة عربية", "إنجليزي"];

const VIDEOS = [
  { id: 1, title: "حل معادلات الدرجة الثانية", teacher: "أ. محمد أحمد", subject: "رياضيات", duration: "45 دق", views: "2.3K", likes: 186, points: 50, featured: true },
  { id: 2, title: "قوانين نيوتن للحركة", teacher: "أ. سارة خالد", subject: "فيزياء", duration: "38 دق", views: "1.8K", likes: 143, points: 50, featured: false },
  { id: 3, title: "التحليل النحوي المتقدم", teacher: "د. منى حسن", subject: "لغة عربية", duration: "52 دق", views: "3.1K", likes: 254, points: 50, featured: true },
  { id: 4, title: "قواعد الكيمياء العضوية", teacher: "أ. كريم علي", subject: "علوم", duration: "41 دق", views: "1.5K", likes: 117, points: 50, featured: false },
  { id: 5, title: "الجبر الخطي للمرحلة الثانوية", teacher: "د. أمير حسن", subject: "رياضيات", duration: "60 دق", views: "4.2K", likes: 321, points: 50, featured: false },
  { id: 6, title: "قراءة في الأدب العربي", teacher: "أ. هند محمود", subject: "لغة عربية", duration: "35 دق", views: "980", likes: 88, points: 50, featured: false },
];

const subjectColors: Record<string, string> = {
  رياضيات: "#3B82F6",
  فيزياء: "#EF4444",
  علوم: "#10B981",
  "لغة عربية": "#8B5CF6",
  إنجليزي: "#F59E0B",
};

interface VideoCardProps {
  video: (typeof VIDEOS)[0];
  featured?: boolean;
}

function VideoCard({ video, featured }: VideoCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const scale = useRef(new Animated.Value(1)).current;
  const subColor = subjectColors[video.subject] ?? COLORS.primary;

  if (featured) {
    return (
      <Pressable
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        style={{ marginHorizontal: 20, marginBottom: 12 }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient
            colors={[subColor, subColor + "BB"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredCard}
          >
            <View style={styles.featuredBadge}>
              <Feather name="zap" size={12} color="#fff" />
              <Text style={styles.featuredBadgeText}>مميز</Text>
            </View>
            <View style={styles.featuredPlay}>
              <Feather name="play" size={28} color="#fff" />
            </View>
            <View style={styles.featuredContent}>
              <Text style={styles.featuredTitle}>{video.title}</Text>
              <Text style={styles.featuredTeacher}>{video.teacher}</Text>
              <View style={styles.featuredMeta}>
                <View style={styles.metaChip}>
                  <Feather name="clock" size={11} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.metaChipText}>{video.duration}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Feather name="eye" size={11} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.metaChipText}>{video.views}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons name="star" size={11} color="#FCD34D" />
                  <Text style={styles.metaChipText}>{video.points} نقطة</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      style={{ marginHorizontal: 20, marginBottom: 10 }}
    >
      <Animated.View style={[styles.videoCard, { backgroundColor: colors.surface, transform: [{ scale }] }]}>
        <View style={[styles.videoThumb, { backgroundColor: subColor + "22" }]}>
          <Feather name="play-circle" size={28} color={subColor} />
          <Text style={[styles.durBadge, { color: subColor }]}>{video.duration}</Text>
        </View>
        <View style={styles.videoInfo}>
          <View style={[styles.subjectTag, { backgroundColor: subColor + "22" }]}>
            <Text style={[styles.subjectTagText, { color: subColor }]}>{video.subject}</Text>
          </View>
          <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={2}>{video.title}</Text>
          <Text style={[styles.videoTeacher, { color: colors.textSecondary }]}>{video.teacher}</Text>
          <View style={styles.videoMeta}>
            <View style={styles.likesRow}>
              <Feather name="heart" size={12} color={COLORS.error} />
              <Text style={[styles.likeCount, { color: colors.textSecondary }]}>{video.likes}</Text>
            </View>
            <View style={styles.likesRow}>
              <Feather name="eye" size={12} color={colors.textTertiary} />
              <Text style={[styles.likeCount, { color: colors.textSecondary }]}>{video.views}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function VideosScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;

  const [selectedSubject, setSelectedSubject] = useState("الكل");
  const [search, setSearch] = useState("");

  const filtered = VIDEOS.filter((v) => {
    const matchSub = selectedSubject === "الكل" || v.subject === selectedSubject;
    const matchSearch = !search || v.title.includes(search) || v.teacher.includes(search);
    return matchSub && matchSearch;
  });

  const featured = filtered.filter((v) => v.featured);
  const regular = filtered.filter((v) => !v.featured);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.surface }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>الفيديوهات التعليمية</Text>
        <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="ابحث عن فيديو..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
      </View>

      <FlatList
        data={regular}
        keyExtractor={(i) => String(i.id)}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View>
            <FlatList
              data={SUBJECTS}
              keyExtractor={(s) => s}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterBar}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.filterChip,
                    selectedSubject === item && { backgroundColor: COLORS.primary },
                    selectedSubject !== item && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => setSelectedSubject(item)}
                >
                  <Text style={[
                    styles.filterChipText,
                    { color: selectedSubject === item ? "#fff" : colors.textSecondary },
                  ]}>
                    {item}
                  </Text>
                </Pressable>
              )}
            />
            {featured.length > 0 && (
              <View style={{ marginBottom: 4 }}>
                {featured.map((v) => <VideoCard key={v.id} video={v} featured />)}
              </View>
            )}
            {regular.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                {regular.length} فيديو
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <VideoCard video={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="video-off" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد فيديوهات</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "right" },
  searchBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14 },
  filterBar: { paddingHorizontal: 20, paddingVertical: 10 },
  filterChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
  filterChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  sectionLabel: { fontFamily: "Cairo_400Regular", fontSize: 13, paddingHorizontal: 20, marginBottom: 8 },
  featuredCard: { borderRadius: 20, padding: 20, minHeight: 160 },
  featuredBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  featuredBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff" },
  featuredPlay: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  featuredContent: { gap: 4 },
  featuredTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff", textAlign: "right" },
  featuredTeacher: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", textAlign: "right" },
  featuredMeta: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 8 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaChipText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  videoCard: { flexDirection: "row", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  videoThumb: { width: 90, alignItems: "center", justifyContent: "center", gap: 6 },
  durBadge: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  videoInfo: { flex: 1, padding: 12, gap: 4 },
  subjectTag: { alignSelf: "flex-end", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  subjectTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  videoTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  videoTeacher: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  videoMeta: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 4 },
  likesRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  likeCount: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 16 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 16 },
});
