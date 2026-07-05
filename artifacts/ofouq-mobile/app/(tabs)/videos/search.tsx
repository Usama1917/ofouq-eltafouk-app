import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { searchLessons } from "@/lib/engagement";
import { LessonRefCard } from "@/components/LessonRefCard";

export default function SearchScreen() {
  const { token } = useAuth();
  const { colors, resolvedScheme, language, direction, textAlign } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  // Debounce the query so we don't hit the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q, token],
    queryFn: () => searchLessons(token, q),
    enabled: !!token && q.length >= 2,
  });
  const lessons = q.length >= 2 ? data?.lessons ?? [] : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={resolvedScheme === "dark" ? ["#000", "#000", "#000"] : ["#EEF5FF", "#F7FAFF", "#F3F0FF"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, flexDirection: en ? "row" : "row-reverse" }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={({ pressed }) => [styles.backBtn, { backgroundColor: pressed ? colors.surfaceSecondary : colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={19} color={colors.textSecondary} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border, direction: "ltr", flexDirection: en ? "row" : "row-reverse" }]}>
          <Feather name="search" size={18} color={colors.textTertiary} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            placeholder={en ? "Search for a lesson…" : "دوّر على درس…"}
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.text, textAlign: en ? "left" : "right", writingDirection: direction }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {input.length > 0 ? (
            <Pressable onPress={() => setInput("")} hitSlop={8}>
              <Feather name="x" size={17} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isFetching && q.length >= 2 ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : q.length < 2 ? (
        <View style={styles.hint}>
          <Feather name="search" size={38} color={colors.textTertiary} />
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {en ? "Type at least 2 letters to search your subjects." : "اكتب حرفين على الأقل للبحث في موادك."}
          </Text>
        </View>
      ) : lessons.length === 0 ? (
        <View style={styles.hint}>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{en ? "No lessons found." : "مفيش دروس مطابقة."}</Text>
        </View>
      ) : (
        <FlatList
          data={lessons}
          keyExtractor={(it) => String(it.lessonId)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
          renderItem={({ item }) => <LessonRefCard item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, alignItems: "center", gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  searchBox: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", gap: 9 },
  input: { flex: 1, ...FONT.regular, fontSize: 15, paddingVertical: 0 },
  hint: { alignItems: "center", justifyContent: "center", paddingTop: 70, paddingHorizontal: 40, gap: 12 },
  hintText: { ...FONT.regular, fontSize: 13.5, textAlign: "center", lineHeight: 21 },
});
