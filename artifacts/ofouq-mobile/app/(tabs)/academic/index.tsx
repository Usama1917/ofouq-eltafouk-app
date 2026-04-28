import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface AcademicYear { id: number; name: string; description: string; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function AcademicTab() {
  const { colors } = useAppTheme();
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: years = [], isLoading } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/api/academic/years"),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{t.academic.years}</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{t.academic.chooseYear}</Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>{t.common.loading}</Text>
        </View>
      )}

      <FlatList
        data={years}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.center}>
              <Ionicons name="school-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.academic.noYears}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./subjects?yearId=${item.id}&yearName=${encodeURIComponent(item.name)}`)}
          >
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={colors.textTertiary} />
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{item.name}</Text>
              {item.description ? <Text style={[styles.cardDesc, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]}>{item.description}</Text> : null}
            </View>
            <View style={[styles.cardIcon, { backgroundColor: COLORS.primary + "18" }]}>
              <Ionicons name="school" size={26} color={COLORS.primary} />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: "Cairo_700Bold", marginTop: 2 },
  headerSub: { fontSize: 13, fontFamily: "Cairo_400Regular", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, marginTop: 2 },
});
