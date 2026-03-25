import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";

interface ContentProvider { id: number; name: string; description: string; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function ProvidersScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? COLORS.dark : COLORS.light;
  const router = useRouter();
  const navigation = useNavigation();
  const { yearId, yearName, subjectId, subjectName } = useLocalSearchParams<{
    yearId: string; yearName: string; subjectId: string; subjectName: string;
  }>();

  useEffect(() => {
    navigation.setOptions({ title: String(subjectName ?? "الجهات التعليمية") });
  }, [subjectName]);

  const { data: providers = [], isLoading } = useQuery<ContentProvider[]>({
    queryKey: ["academic", "providers", subjectId],
    queryFn: () => apiFetch(`/api/academic/subjects/${subjectId}/providers`),
    enabled: !!subjectId,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={providers}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>اختر الجهة التعليمية</Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>جاري التحميل...</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>لا توجد جهات تعليمية</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./units?yearId=${yearId}&yearName=${encodeURIComponent(String(yearName))}&subjectId=${subjectId}&subjectName=${encodeURIComponent(String(subjectName))}&providerId=${item.id}&providerName=${encodeURIComponent(item.name)}`)}
          >
            <View style={[styles.cardIcon, { backgroundColor: "#10B98118" }]}>
              <Ionicons name="people" size={24} color="#10B981" />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
              {item.description ? <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{item.description}</Text> : null}
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
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, alignItems: "flex-end" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
});
