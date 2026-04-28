import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useEffect } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/constants/api";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Subject {
  id: number;
  name: string;
  icon: string;
  description: string;
  isSubscribed?: boolean;
}

async function apiFetch<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function SubjectsScreen() {
  const { colors } = useAppTheme();
  const { t, isRTL } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const { yearId, yearName } = useLocalSearchParams<{ yearId: string; yearName: string }>();

  useEffect(() => {
    navigation.setOptions({ title: String(yearName ?? t.academic.subjects) });
  }, [yearName]);

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/api/academic/years/${yearId}/subjects`, token),
    enabled: !!yearId,
  });

  const handleSubjectPress = (item: Subject) => {
    if (item.isSubscribed === false) {
      Alert.alert(
        t.academic.subscribeTitle,
        t.academic.subscribeMessage,
        [
          { text: t.common.cancel, style: "cancel" },
          {
            text: t.academic.requestAccess,
            onPress: () => {},
          },
        ]
      );
      return;
    }
    router.push(`./units?yearId=${yearId}&yearName=${encodeURIComponent(String(yearName))}&subjectId=${item.id}&subjectName=${encodeURIComponent(item.name)}`);
  };

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
            <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40, fontFamily: "Cairo_400Regular" }}>{t.common.loading}</Text>
          ) : (
            <View style={styles.center}>
              <Ionicons name="book-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.academic.noSubjects}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isLocked = item.isSubscribed === false;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.subjectCard,
                { backgroundColor: colors.card, borderColor: isLocked ? colors.border : COLORS.primary + "30", opacity: pressed ? 0.8 : 1, flex: 1 },
              ]}
              onPress={() => handleSubjectPress(item)}
            >
              {isLocked && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={12} color="#fff" />
                </View>
              )}
              <Text style={styles.subjectIcon}>{item.icon ?? "📚"}</Text>
              <Text style={[styles.subjectName, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>{item.name}</Text>
              {item.description ? (
                <Text style={[styles.subjectDesc, { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {isLocked && (
                <View style={styles.lockedTag}>
                  <Text style={styles.lockedTagText}>{t.academic.locked}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15 },
  subjectCard: { borderRadius: 20, borderWidth: 1, padding: 16, alignItems: "flex-end", gap: 6, position: "relative" },
  subjectIcon: { fontSize: 36, alignSelf: "center", marginBottom: 4 },
  subjectName: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  subjectDesc: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  lockBadge: { position: "absolute", top: 10, left: 10, backgroundColor: COLORS.error, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  lockedTag: { backgroundColor: COLORS.error + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-end" },
  lockedTagText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: COLORS.error },
});
