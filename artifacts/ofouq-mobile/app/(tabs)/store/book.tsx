import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { formatNumber } from "@/lib/format";
import {
  addToCart,
  addWishlist,
  cartKey,
  getBook,
  pickBookCover,
  removeWishlist,
  storeBookKey,
  storeBooksKey,
  wishlistKey,
} from "@/lib/store";

// Extra bottom clearance so the fixed action bar clears the floating tab bar.
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 86 : 74;

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const isDark = resolvedScheme === "dark";

  const { data: book, isLoading } = useQuery({ queryKey: storeBookKey(bookId), queryFn: () => getBook(token, bookId), enabled: !!token && !!bookId });
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";
  const out = (book?.stockQuantity ?? 0) <= 0;
  // Detail page is full-width → landscape (16:9) hero, theme-aware with fallback.
  const heroCover = book ? pickBookCover(book, { landscape: true, dark: isDark }) : null;

  async function onAdd() {
    if (!token || !book || out) return;
    setAdding(true);
    try {
      await addToCart(token, book.id, 1);
      await qc.invalidateQueries({ queryKey: cartKey });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      // Surface the server's Arabic reason (e.g. "نفدت الكمية") instead of silence.
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not add to cart" : "تعذّر الإضافة للسلة");
    } finally {
      setAdding(false);
    }
  }

  async function toggleFav() {
    if (!token || !book) return;
    try {
      if (book.favorite) await removeWishlist(token, book.id);
      else await addWishlist(token, book.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: storeBookKey(bookId) }),
        qc.invalidateQueries({ queryKey: storeBooksKey() }),
        qc.invalidateQueries({ queryKey: wishlistKey }),
      ]);
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: "row", direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{en ? "Book" : "الكتاب"}</Text>
        <Pressable onPress={toggleFav} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name={book?.favorite ? "heart" : "heart-outline"} size={20} color={book?.favorite ? COLORS.error : colors.text} />
        </Pressable>
      </View>

      {isLoading || !book ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 160, gap: 16 }}>
            {/* Cover */}
            <View style={styles.coverBox}>
              {heroCover ? (
                <Image source={{ uri: heroCover }} style={styles.cover} resizeMode="cover" />
              ) : (
                <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.cover}>
                  <Feather name="book-open" size={56} color={COLORS.primary} />
                </LinearGradient>
              )}
            </View>

            {/* Gallery thumbs */}
            {book.imageUrls && book.imageUrls.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: row(en) }}>
                {book.imageUrls.map((u, i) => (
                  <Image key={i} source={{ uri: u }} style={styles.thumb} resizeMode="cover" />
                ))}
              </ScrollView>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={[styles.title, { color: colors.text, textAlign: ta }]}>{book.title}</Text>
              <View style={[styles.priceRow, { flexDirection: row(en), direction: "ltr" }]}>
                <Text style={[styles.price, { color: COLORS.primary }]}>{formatNumber(book.priceEgp)} {en ? "EGP" : "ج"}</Text>
                {book.originalPriceEgp && book.originalPriceEgp > book.priceEgp ? (
                  <Text style={[styles.oldPrice, { color: colors.textTertiary }]}>{formatNumber(book.originalPriceEgp)}</Text>
                ) : null}
              </View>
            </View>

            {/* Unlocks-subject badge */}
            {book.unlocksSubject ? (
              <View style={[styles.unlockBadge, { flexDirection: row(en), direction: "ltr", backgroundColor: COLORS.primary + (isDark ? "22" : "12") }]}>
                <Ionicons name="lock-open" size={16} color={COLORS.primary} />
                <Text style={[styles.unlockText, { color: COLORS.primary }]}>
                  {en ? `Unlocks ${book.unlocksSubject.name} digitally` : `بيفتح لك مادة ${book.unlocksSubject.name} رقميًا`}
                </Text>
              </View>
            ) : null}

            {out ? (
              <View style={[styles.outBanner, { backgroundColor: COLORS.error + "15" }]}>
                <Text style={[styles.outBannerText, { color: COLORS.error, textAlign: ta }]}>{en ? "Out of stock" : "الكتاب ده نفدت كميته حاليًا"}</Text>
              </View>
            ) : book.stockQuantity <= 5 ? (
              <Text style={[styles.lowStock, { color: COLORS.warning, textAlign: ta }]}>
                {en ? `Only ${book.stockQuantity} left` : `متبقّي ${formatNumber(book.stockQuantity)} نسخ بس`}
              </Text>
            ) : null}

            {book.description ? (
              <View style={{ gap: 6 }}>
                <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "About the book" : "عن الكتاب"}</Text>
                <Text style={[styles.desc, { color: colors.textSecondary, textAlign: ta }]}>{book.description}</Text>
              </View>
            ) : null}

            {/* Related */}
            {book.related.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "You may also like" : "اشتروا كمان"}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, flexDirection: row(en) }}>
                  {book.related.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push({ pathname: "/(tabs)/store/book", params: { bookId: String(r.id) } })}
                      style={[styles.relCard, { backgroundColor: colors.surface }]}
                    >
                      <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.relCover}>
                        <Feather name="book" size={22} color={COLORS.primary} />
                      </LinearGradient>
                      <Text numberOfLines={2} style={[styles.relTitle, { color: colors.text, textAlign: ta }]}>{r.title}</Text>
                      <Text style={[styles.relPrice, { color: COLORS.primary }]}>{formatNumber(r.priceEgp)} {en ? "EGP" : "ج"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom add-to-cart bar */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Pressable
              onPress={onAdd}
              disabled={out || adding}
              style={[styles.addBtn, { backgroundColor: out ? colors.textTertiary : added ? COLORS.success : COLORS.primary, flexDirection: row(en), direction: "ltr" }]}
            >
              <Feather name={added ? "check" : "shopping-cart"} size={18} color="#fff" />
              <Text style={styles.addBtnText}>
                {out ? (en ? "Out of stock" : "نفدت الكمية") : added ? (en ? "Added ✓" : "اتضاف للسلة ✓") : en ? "Add to cart" : "أضف للسلة"}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...FONT.bold, fontSize: 17, flex: 1, textAlign: "center", marginHorizontal: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverBox: { alignItems: "center" },
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  title: { ...FONT.bold, fontSize: 22 },
  author: { ...FONT.regular, fontSize: 15 },
  priceRow: { alignItems: "center", gap: 10, marginTop: 4 },
  price: { ...FONT.bold, fontSize: 22 },
  oldPrice: { ...FONT.regular, fontSize: 15, textDecorationLine: "line-through" },
  unlockBadge: { alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  unlockText: { ...FONT.semiBold, fontSize: 13 },
  outBanner: { borderRadius: 12, padding: 12 },
  outBannerText: { ...FONT.semiBold, fontSize: 14 },
  lowStock: { ...FONT.semiBold, fontSize: 13 },
  sectionH: { ...FONT.bold, fontSize: 16 },
  desc: { ...FONT.regular, fontSize: 14, lineHeight: 24 },
  relCard: { width: 120, borderRadius: 14, padding: 10, gap: 6 },
  relCover: { height: 90, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  relTitle: { ...FONT.semiBold, fontSize: 12 },
  relPrice: { ...FONT.bold, fontSize: 13 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8 },
  addBtnText: { ...FONT.bold, fontSize: 16, color: "#fff" },
});
