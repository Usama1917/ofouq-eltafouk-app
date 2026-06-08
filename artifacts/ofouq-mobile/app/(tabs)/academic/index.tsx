import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList, Pressable, StyleSheet, Text,
  View
} from "react-native";
import { FONT } from "@/constants/typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { usePreferences } from "@/contexts/PreferencesContext";
import { apiFetch } from "@/lib/api";
import { localizeAcademicText } from "@/lib/academicContentLocalization";

interface AcademicYear { id: number; name: string; nameEn?: string | null; description: string; descriptionEn?: string | null; }

export default function AcademicTab() {
  const { colors, language, strings } = usePreferences();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: years = [], isLoading } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/api/academic/years"),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{strings.academic.years}</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{strings.academic.chooseYear}</Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>{strings.common.loading}</Text>
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
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{strings.academic.noYears}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`./subjects?yearId=${item.id}&yearName=${encodeURIComponent(item.name)}`)}
          >
            <View style={[styles.cardIcon, { backgroundColor: COLORS.primary + "18" }]}>
              <Ionicons name="school" size={26} color={COLORS.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{localizeAcademicText(item.name, language, item.nameEn)}</Text>
              {item.description ? <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{localizeAcademicText(item.description, language, item.descriptionEn)}</Text> : null}
            </View>
            <Ionicons name="chevron-back" size={20} color={colors.textTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, ...FONT.bold, textAlign: "right" },
  headerSub: { fontSize: 13, ...FONT.regular, textAlign: "right", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { ...FONT.regular, fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, alignItems: "flex-end" },
  cardTitle: { ...FONT.bold, fontSize: 19, lineHeight: 28 },
  cardDesc: { ...FONT.regular, fontSize: 14, lineHeight: 22, marginTop: 2 },
});
