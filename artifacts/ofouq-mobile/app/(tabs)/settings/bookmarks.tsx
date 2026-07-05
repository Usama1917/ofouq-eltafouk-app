import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { bookmarksQueryKey, fetchBookmarks } from "@/lib/engagement";
import { LessonRefCard } from "@/components/LessonRefCard";

export default function BookmarksScreen() {
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL, direction, textAlign } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: bookmarksQueryKey,
    queryFn: () => fetchBookmarks(token),
    enabled: !!token,
  });
  useRefetchOnFocus(refetch);
  const bookmarks = data?.bookmarks ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={resolvedScheme === "dark" ? ["#000", "#000", "#000"] : ["#EEF5FF", "#F7FAFF", "#F3F0FF"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, flexDirection: en ? "row" : "row-reverse" }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border, flexDirection: en ? "row" : "row-reverse" }]}>
          <Feather name={en ? "arrow-left" : "arrow-right"} size={19} color={colors.textSecondary} />
          <Text style={[styles.backText, { color: colors.text }]}>{en ? "Settings" : "الإعدادات"}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, textAlign, writingDirection: direction }]} numberOfLines={1}>
          {en ? "Saved lessons" : "الدروس المحفوظة"}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : bookmarks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{en ? "No saved lessons yet" : "لسه مفيش دروس محفوظة"}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {en ? "Tap the ⭐ on any lesson to save it here." : "اضغط ⭐ على أي درس عشان تحفظه هنا."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(it) => String(it.lessonId)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
          renderItem={({ item }) => <LessonRefCard item={item} showStar />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, alignItems: "center", gap: 12 },
  backBtn: { minHeight: 38, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", gap: 7 },
  backText: { ...FONT.bold, fontSize: 14 },
  headerTitle: { ...FONT.bold, fontSize: 18, flex: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: 30, gap: 10 },
  emptyTitle: { ...FONT.bold, fontSize: 16 },
  emptyText: { ...FONT.regular, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
