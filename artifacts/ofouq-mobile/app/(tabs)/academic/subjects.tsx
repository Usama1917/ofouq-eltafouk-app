import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";

interface Subject { id: number; name: string; icon: string; description: string; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function SubjectsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { yearId, yearName } = useLocalSearchParams<{ yearId: string; yearName: string }>();

  useEffect(() => {
    navigation.setOptions({ title: String(yearName ?? "المواد") });
  }, [yearName]);

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/api/academic/years/${yearId}/subjects`),
    enabled: !!yearId,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={subjects}
        keyExtractor={item => String(item.id)}
        numColumns={2}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>جاري التحميل...</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="book-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد مواد متاحة</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.subjectCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1, flex: 1 }]}
            onPress={() => {
              router.push(`./units?yearId=${yearId}&yearName=${encodeURIComponent(String(yearName))}&subjectId=${item.id}&subjectName=${encodeURIComponent(item.name)}`);
            }}
          >
            <Text style={styles.subjectIcon}>{item.icon ?? "📚"}</Text>
            <Text style={[styles.subjectName, { color: colors.text }]}>{item.name}</Text>
            {item.description ? <Text style={[styles.subjectDesc, { color: colors.textSecondary }]} numberOfLines={2}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  subjectCard: { borderRadius: 20, borderWidth: 1, padding: 16, alignItems: "flex-end", gap: 6 },
  subjectIcon: { fontSize: 36, alignSelf: "center", marginBottom: 4 },
  subjectName: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  subjectDesc: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
});
