import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ListErrorState from "@/components/ListErrorState";
import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { formatNumber } from "@/lib/format";
import { getWishlist, removeWishlist, storeBooksKey, wishlistKey } from "@/lib/store";

export default function WishlistScreen() {
  const { token } = useAuth();
  const { colors, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";

  const { data: books = [], isLoading, isError, isFetching, refetch } = useQuery({ queryKey: wishlistKey, queryFn: () => getWishlist(token), enabled: !!token });
  useRefetchOnFocus(refetch);

  async function remove(bookId: number) {
    if (!token) return;
    try {
      await removeWishlist(token, bookId);
      await Promise.all([qc.invalidateQueries({ queryKey: wishlistKey }), qc.invalidateQueries({ queryKey: storeBooksKey() })]);
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: "row", direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{en ? "Wishlist" : "المفضّلة"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : isError ? (
        <ListErrorState onRetry={() => void refetch()} retrying={isFetching} />
      ) : (
        <FlatList
          data={books}
          keyExtractor={(b) => String(b.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="heart-outline" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "No saved books" : "مفيش كتب محفوظة"}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/store/book", params: { bookId: String(item.id) } })}
              style={[styles.item, { backgroundColor: colors.surface, flexDirection: row(en), direction: "ltr" }]}
            >
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" recyclingKey={String(item.id)} transition={160} />
              ) : (
                <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.cover}>
                  <Feather name="book" size={20} color={COLORS.primary} />
                </LinearGradient>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={2} style={[styles.itemTitle, { color: colors.text, textAlign: ta }]}>{item.title}</Text>
                <Text style={[styles.itemPrice, { color: COLORS.primary, textAlign: ta }]}>{formatNumber(item.priceEgp)} {en ? "EGP" : "ج"}</Text>
              </View>
              <Pressable onPress={() => remove(item.id)} hitSlop={8} style={{ alignSelf: "center" }}>
                <Ionicons name="heart" size={22} color={COLORS.error} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...FONT.bold, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyText: { ...FONT.semiBold, fontSize: 16 },
  item: { borderRadius: 16, padding: 12, gap: 12, alignItems: "center" },
  cover: { width: 56, height: 76, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  itemTitle: { ...FONT.bold, fontSize: 14 },
  itemAuthor: { ...FONT.regular, fontSize: 12 },
  itemPrice: { ...FONT.bold, fontSize: 14 },
});
