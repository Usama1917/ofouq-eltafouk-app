import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  getCart,
  pickBookCover,
  removeCartItem,
  removeWishlist,
  storeBookKey,
  storeBooksKey,
  updateCartItem,
  wishlistKey,
} from "@/lib/store";

// Extra bottom clearance so the fixed action bar clears the floating tab bar.
// Lowered a touch so the button sits closer to the tab bar (owner request).
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 70 : 60;

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { token } = useAuth();
  const { colors, resolvedScheme, language, isRTL, direction, reduceMotion } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  // Add-to-cart flow: tap → GREEN "تمت الإضافة للسلة" flash (0.5s) → the button pops
  // into a − / count / + stepper. The stepper mirrors the REAL cart line, so a book
  // already in the cart shows the stepper straight away.
  const [flash, setFlash] = useState(false);
  const [pendingQty, setPendingQty] = useState<number | null>(null); // optimistic qty while a cart call is in flight
  const busy = useRef(false);
  const stepAnim = useRef(new Animated.Value(1)).current;
  const isDark = resolvedScheme === "dark";

  const { data: book, isLoading } = useQuery({ queryKey: storeBookKey(bookId), queryFn: () => getBook(token, bookId), enabled: !!token && !!bookId });
  const { data: cart } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  const line = cart?.items.find((i) => i.bookId === book?.id) ?? null;
  const qty = pendingQty ?? line?.quantity ?? 0;
  const inCart = qty > 0;
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";
  const out = (book?.stockQuantity ?? 0) <= 0;
  // Detail page is full-width → landscape (16:9) hero, theme-aware with fallback.
  const heroCover = book ? pickBookCover(book, { landscape: true, dark: isDark }) : null;

  async function onAdd() {
    if (!token || !book || out || adding) return;
    setAdding(true);
    try {
      await addToCart(token, book.id, 1);
      setPendingQty(1);
      setFlash(true);
      qc.invalidateQueries({ queryKey: cartKey }).then(() => setPendingQty(null));
      // Green confirmation for half a second, then the button "slices" open: the side
      // pieces (− / +) grow out of its two ends while the middle shrinks between them.
      setTimeout(() => {
        setFlash(false);
        if (reduceMotion) {
          stepAnim.setValue(1);
        } else {
          stepAnim.setValue(0);
          Animated.timing(stepAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        }
      }, 500);
    } catch (e) {
      // Surface the server's Arabic reason (e.g. "نفدت الكمية") instead of silence.
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not add to cart" : "تعذّر الإضافة للسلة");
    } finally {
      setAdding(false);
    }
  }

  // +1 / −1 from the stepper; hitting 0 plays the slice morph IN REVERSE (the − / +
  // pieces melt back into one button, turning blue as they merge), removes the cart
  // line, and the "أضف للسلة" button returns.
  async function changeQty(delta: number) {
    if (!token || !book || !line || busy.current) return;
    const next = qty + delta;
    if (next > book.stockQuantity) return;
    busy.current = true;
    try {
      if (next <= 0) {
        if (!reduceMotion) {
          await new Promise<void>((resolve) =>
            Animated.timing(stepAnim, { toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(() => resolve()),
          );
        }
        setPendingQty(0);
        await removeCartItem(token, line.id);
      } else {
        setPendingQty(next);
        await updateCartItem(token, line.id, next);
      }
      await qc.invalidateQueries({ queryKey: cartKey });
    } catch (e) {
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : en ? "Could not update the cart" : "تعذّر تعديل السلة");
    } finally {
      setPendingQty(null);
      // Back to fully-open for the next time the stepper shows (also restores it
      // if the removal failed and the stepper is still on screen).
      stepAnim.setValue(1);
      busy.current = false;
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

            {/* Force a physical LTR box + align the block to the reading side
                (flex-end = right in Arabic), so the title sits on the right in Arabic
                regardless of the ambient RTL flag — matching the catalog card. The price
                row is centered (alignSelf) under the title per the owner's request. */}
            <View style={{ gap: 6, direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
              <Text style={[styles.title, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{book.title}</Text>
              <View style={[styles.priceRow, { flexDirection: row(en), direction: "ltr", alignSelf: "center" }]}>
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
              <View style={[styles.outBanner, { backgroundColor: COLORS.error + "15", direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={[styles.outBannerText, { color: COLORS.error, textAlign: ta, writingDirection: direction }]}>{en ? "Out of stock" : "الكتاب ده نفدت كميته حاليًا"}</Text>
              </View>
            ) : book.stockQuantity <= 5 ? (
              <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                <Text style={[styles.lowStock, { color: COLORS.warning, textAlign: ta, writingDirection: direction }]}>
                  {en ? `Only ${book.stockQuantity} left` : `متبقّي ${formatNumber(book.stockQuantity)} نسخ بس`}
                </Text>
              </View>
            ) : null}

            {book.description ? (
              <View style={{ gap: 6, direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                <Text style={[styles.sectionH, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{en ? "About the book" : "عن الكتاب"}</Text>
                <Text style={[styles.desc, { color: colors.textSecondary, textAlign: ta, writingDirection: direction, width: "100%" }]}>{book.description}</Text>
              </View>
            ) : null}

            {/* Related */}
            {book.related.length > 0 ? (
              <View style={{ gap: 10 }}>
                {/* Heading wrapped so it aligns to the right in Arabic without shrinking
                    the horizontal cards ScrollView below it. */}
                <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start" }}>
                  <Text style={[styles.sectionH, { color: colors.text, textAlign: ta, writingDirection: direction }]}>{en ? "You may also like" : "اشتروا كمان"}</Text>
                </View>
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
                      <Text numberOfLines={2} style={[styles.relTitle, { color: colors.text, textAlign: ta, writingDirection: direction, width: "100%" }]}>{r.title}</Text>
                      <Text style={[styles.relPrice, { color: COLORS.primary, textAlign: ta, width: "100%" }]}>{formatNumber(r.priceEgp)} {en ? "EGP" : "ج"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom cart bar: add → green flash (0.5s) → pops into − / count / + */}
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {flash ? (
              <View style={[styles.addBtn, { backgroundColor: COLORS.success, flexDirection: row(en), direction: "ltr" }]}>
                <Feather name="check" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{en ? "Added to cart ✓" : "تمت الإضافة للسلة ✓"}</Text>
              </View>
            ) : inCart && !out ? (
              // PHYSICAL layout (direction:"ltr"): − on the left, big counter (→ cart) in
              // the middle, + on the right. The "slice" morph: each side piece animates its
              // WIDTH 0→56 (+ its gap 0→10) so it grows out of the button's end while the
              // flex:1 middle shrinks between them — and its colour eases from the button's
              // blue to the final grey, like a piece cut off the original button.
              <View style={{ flexDirection: "row", direction: "ltr", alignItems: "stretch" }}>
                <Animated.View
                  style={{
                    width: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }),
                    marginRight: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
                    backgroundColor: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.primary, colors.surfaceSecondary] }),
                    borderColor: colors.border,
                    opacity: stepAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.6, 1] }),
                    overflow: "hidden",
                    borderRadius: 16,
                    borderWidth: 1,
                  }}
                >
                  <Pressable onPress={() => changeQty(-1)} style={styles.qtySideFill}>
                    <Feather name="minus" size={22} color={colors.text} />
                  </Pressable>
                </Animated.View>
                {/* Physical order (direction:"ltr" ON this node): icon ← 5 ← · ← الانتقال للسلة */}
                <Pressable onPress={() => router.push("/(tabs)/store/cart")} style={[styles.qtyMid, { backgroundColor: COLORS.primary }]}>
                  <Feather name="shopping-cart" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>{formatNumber(qty)}</Text>
                  <Text style={styles.qtyMidHint}>·</Text>
                  <Text style={styles.qtyMidHint}>{en ? "Go to cart" : "الانتقال للسلة"}</Text>
                </Pressable>
                <Animated.View
                  style={{
                    width: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }),
                    marginLeft: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
                    backgroundColor: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.primary, colors.surfaceSecondary] }),
                    borderColor: colors.border,
                    opacity: stepAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.6, 1] }),
                    overflow: "hidden",
                    borderRadius: 16,
                    borderWidth: 1,
                  }}
                >
                  <Pressable
                    onPress={() => changeQty(1)}
                    disabled={qty >= book.stockQuantity}
                    style={[styles.qtySideFill, { opacity: qty >= book.stockQuantity ? 0.4 : 1 }]}
                  >
                    <Feather name="plus" size={22} color={colors.text} />
                  </Pressable>
                </Animated.View>
              </View>
            ) : (
              <Pressable
                onPress={onAdd}
                disabled={out || adding}
                style={[styles.addBtn, { backgroundColor: out ? colors.textTertiary : COLORS.primary, flexDirection: row(en), direction: "ltr" }]}
              >
                <Feather name="shopping-cart" size={18} color="#fff" />
                <Text style={styles.addBtnText}>
                  {out ? (en ? "Out of stock" : "نفدت الكمية") : en ? "Add to cart" : "أضف للسلة"}
                </Text>
              </Pressable>
            )}
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
  // Fixed inner width (56 − 2px borders) so the icon stays centred at its final spot
  // while the animated overflow-hidden wrapper reveals it like a widening slice.
  qtySideFill: { width: 54, flex: 1, alignItems: "center", justifyContent: "center" },
  qtyMid: { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 6, flexDirection: "row", direction: "ltr" },
  qtyMidHint: { ...FONT.semiBold, fontSize: 13, color: "rgba(255,255,255,0.85)" },
});
