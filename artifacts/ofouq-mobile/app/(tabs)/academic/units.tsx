import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface Unit { id: number; name: string; description: string; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function UnitsScreen() {
  const { colors } = useAppTheme();
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const navigation = useNavigation();
  const { yearId, yearName, subjectId, subjectName } = useLocalSearchParams<{
    yearId: string; yearName: string; subjectId: string; subjectName: string;
  }>();

  const title = subjectName ?? t.academic.units;

  useEffect(() => {
    navigation.setOptions({ title });
  }, [title]);

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ["academic", "units", subjectId],
    queryFn: () => apiFetch(`/api/academic/subjects/${subjectId}/units`),
    enabled: !!subjectId,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={units}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{t.academic.chooseUnit}</Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>{t.common.loading}</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="layers-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.academic.noUnits}</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./lessons?yearId=${yearId}&yearName=${encodeURIComponent(String(yearName))}&subjectId=${subjectId}&subjectName=${encodeURIComponent(String(subjectName))}&unitId=${item.id}&unitName=${encodeURIComponent(item.name)}`)}
          >
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.textTertiary} />
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{item.name}</Text>
              {item.description ? <Text style={[styles.cardDesc, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{item.description}</Text> : null}
            </View>
            <View style={[styles.indexBadge, { backgroundColor: COLORS.primary + "18" }]}>
              <Text style={[styles.indexText, { color: COLORS.primary }]}>{index + 1}</Text>
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
  indexBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  indexText: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
});
