import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { formatNumber } from "@/lib/format";
import {
  addWishlist,
  cartKey,
  getCart,
  listBooks,
  removeWishlist,
  storeBooksKey,
  wishlistKey,
  type StoreBook,
} from "@/lib/store";

export default function StoreCatalogScreen() {
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL, direction } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  const { data: books = [], isLoading, refetch } = useQuery({
    queryKey: storeBooksKey(),
    queryFn: () => listBooks(token),
    enabled: !!token,
  });
  const { data: cart } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  useRefetchOnFocus(refetch);

  const categories = useMemo(() => Array.from(new Set(books.map((b) => b.category).filter(Boolean))), [books]);
  const filtered = useMemo(
    () =>
      books.filter((b) => {
        const okCat = !category || b.category === category;
        const okSearch = !search.trim() || b.title.includes(search.trim());
        return okCat && okSearch;
      }),
    [books, category, search],
  );
  const cartCount = cart?.items.length ?? 0;
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");

  async function toggleFav(book: StoreBook) {
    if (!token) return;
    try {
      if (book.favorite) await removeWishlist(token, book.id);
      else await addWishlist(token, book.id);
      await Promise.all([qc.invalidateQueries({ queryKey: storeBooksKey() }), qc.invalidateQueries({ queryKey: wishlistKey })]);
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: row(en), direction: "ltr" }]}>
        <Text style={[styles.title, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>
          {en ? "Store" : "المتجر"}
        </Text>
        <View style={{ flexDirection: row(en), gap: 10, direction: "ltr" }}>
          <Pressable onPress={() => router.push("/(tabs)/store/wishlist")} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="heart-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/store/orders")} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="package" size={19} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/store/cart")} style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="shopping-cart" size={19} color={colors.text} />
            {cartCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{formatNumber(cartCount)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchBox, { backgroundColor: colors.surfaceSecondary, flexDirection: row(en), direction: "ltr" }]}>
        <Feather name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, textAlign: isRTL ? "right" : "left", writingDirection: direction }]}
          placeholder={en ? "Search books..." : "دوّر على كتاب..."}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category chips */}
      {categories.length > 0 ? (
        <FlatList
          data={["", ...categories]}
          keyExtractor={(c) => c || "all"}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBar}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, flexDirection: row(en) }}
          renderItem={({ item }) => {
            const active = category === item;
            return (
              <Pressable
                onPress={() => setCategory(item)}
                style={[styles.chip, { backgroundColor: active ? COLORS.primary : colors.surfaceSecondary }]}
              >
                <Text style={[styles.chipText, { color: active ? "#fff" : colors.textSecondary }]}>
                  {item || (en ? "All" : "الكل")}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : null}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(b) => String(b.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingBottom: insets.bottom + 100 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="book" size={44} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "No books" : "مفيش كتب"}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BookCard book={item} colors={colors} isDark={resolvedScheme === "dark"} en={en} isRTL={isRTL} onFav={() => toggleFav(item)} />
          )}
        />
      )}
    </View>
  );
}

function BookCard({
  book,
  colors,
  isDark,
  en,
  isRTL,
  onFav,
}: {
  book: StoreBook;
  colors: typeof COLORS.light;
  isDark: boolean;
  en: boolean;
  isRTL: boolean;
  onFav: () => void;
}) {
  const out = book.stockQuantity <= 0;
  const discounted = book.originalPriceEgp && book.originalPriceEgp > book.priceEgp;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/(tabs)/store/book", params: { bookId: String(book.id) } })}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <View style={styles.coverWrap}>
        {book.coverUrl ? (
          <Image source={{ uri: book.coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.cover}>
            <Feather name="book-open" size={30} color={COLORS.primary} />
          </LinearGradient>
        )}
        <Pressable onPress={onFav} hitSlop={8} style={[styles.favBtn, { backgroundColor: isDark ? "#0008" : "#fff" }]}>
          <Ionicons name={book.favorite ? "heart" : "heart-outline"} size={16} color={book.favorite ? COLORS.error : colors.textSecondary} />
        </Pressable>
        {out ? (
          <View style={styles.outBadge}>
            <Text style={styles.outText}>{en ? "Out of stock" : "نفدت"}</Text>
          </View>
        ) : book.stockQuantity <= 5 ? (
          <View style={[styles.outBadge, { backgroundColor: COLORS.warning }]}>
            <Text style={styles.outText}>{en ? `${book.stockQuantity} left` : `متبقّي ${formatNumber(book.stockQuantity)}`}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={2} style={[styles.bookTitle, { color: colors.text, textAlign: isRTL ? "right" : "left" }]}>
          {book.title}
        </Text>
        <View style={[styles.priceRow, { flexDirection: en ? "row" : "row-reverse", direction: "ltr" }]}>
          <Text style={[styles.price, { color: COLORS.primary }]}>{formatNumber(book.priceEgp)} {en ? "EGP" : "ج"}</Text>
          {discounted ? (
            <Text style={[styles.oldPrice, { color: colors.textTertiary }]}>{formatNumber(book.originalPriceEgp!)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12, alignItems: "center", justifyContent: "space-between" },
  title: { ...FONT.bold, fontSize: 24 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { ...FONT.bold, fontSize: 9, color: "#fff" },
  searchBox: { marginHorizontal: 20, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", gap: 8 },
  searchInput: { flex: 1, ...FONT.regular, fontSize: 14 },
  chipBar: { marginTop: 12, maxHeight: 40, flexGrow: 0 },
  chip: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  chipText: { ...FONT.semiBold, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 50, gap: 12, minHeight: 200 },
  emptyText: { ...FONT.regular, fontSize: 15 },
  card: { flex: 1, borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  coverWrap: { position: "relative" },
  cover: { height: 150, width: "100%", alignItems: "center", justifyContent: "center" },
  favBtn: { position: "absolute", top: 8, left: 8, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  outBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: COLORS.error, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  outText: { ...FONT.bold, fontSize: 10, color: "#fff" },
  cardBody: { padding: 12, gap: 4 },
  bookTitle: { ...FONT.bold, fontSize: 14 },
  bookAuthor: { ...FONT.regular, fontSize: 12 },
  priceRow: { alignItems: "center", gap: 8, marginTop: 4 },
  price: { ...FONT.bold, fontSize: 15 },
  oldPrice: { ...FONT.regular, fontSize: 12, textDecorationLine: "line-through" },
});
