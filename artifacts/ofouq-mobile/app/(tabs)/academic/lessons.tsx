import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";

interface Lesson {
  id: number; title: string; description: string; videoId?: number;
  video?: { id: number; title: string; videoUrl: string; thumbnailUrl?: string; duration: number; instructor: string; } | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function LessonsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const navigation = useNavigation();
  const { unitId, unitName, yearId, yearName, subjectId, subjectName, providerId, providerName } = useLocalSearchParams<{
    unitId: string; unitName: string; yearId: string; yearName: string;
    subjectId: string; subjectName: string; providerId?: string; providerName?: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: String(unitName ?? "الدروس") });
  }, [unitName]);

  const { data: lessons = [], isLoading } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId],
    queryFn: () => apiFetch(`/api/academic/units/${unitId}/lessons`),
    enabled: !!unitId,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={lessons}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>اختر الدرس</Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>جاري التحميل...</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="play-circle-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد دروس متاحة</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./lesson?lessonId=${item.id}&lessonTitle=${encodeURIComponent(item.title)}`)}
          >
            <View style={[styles.thumbnail, { backgroundColor: COLORS.primary + "14" }]}>
              <Ionicons name="play-circle" size={28} color={COLORS.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
              {item.video && (
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                  {item.video.instructor} · {item.video.duration} دق
                </Text>
              )}
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "right", marginBottom: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  thumbnail: { width: 52, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, alignItems: "flex-end" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
});
