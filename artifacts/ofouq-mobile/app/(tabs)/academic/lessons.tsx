import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { colors } = useAppTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const navigation = useNavigation();
  const { unitId, unitName } = useLocalSearchParams<{
    unitId: string; unitName: string; yearId: string; yearName: string;
    subjectId: string; subjectName: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: String(unitName ?? t.academic.lessons) });
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
          <Text style={[styles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{t.academic.chooseLesson}</Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>{t.common.loading}</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="play-circle-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.academic.noLessons}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./lesson?lessonId=${item.id}&lessonTitle=${encodeURIComponent(item.title)}`)}
          >
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.textTertiary} />
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{item.title}</Text>
              {item.video && (
                <Text style={[styles.cardDesc, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>
                  {item.video.instructor} · {item.video.duration} {t.academic.minute}
                </Text>
              )}
            </View>
            <View style={[styles.thumbnail, { backgroundColor: COLORS.primary + "14" }]}>
              <Ionicons name="play-circle" size={28} color={COLORS.primary} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: { fontFamily: "Cairo_400Regular", fontSize: 13, marginBottom: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  thumbnail: { width: 52, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
});
