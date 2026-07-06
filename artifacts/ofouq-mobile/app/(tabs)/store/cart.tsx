import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { formatNumber } from "@/lib/format";
import { cartKey, getCart, removeCartItem, updateCartItem, type CartLine } from "@/lib/store";

export default function CartScreen() {
  const { token } = useAuth();
  const { colors, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  useRefetchOnFocus(refetch);
  const items = data?.items ?? [];
  const subtotal = data?.subtotal ?? 0;
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";

  async function setQty(item: CartLine, qty: number) {
    if (!token) return;
    try {
      if (qty <= 0) await removeCartItem(token, item.id);
      else await updateCartItem(token, item.id, Math.min(qty, item.stockQuantity));
      await qc.invalidateQueries({ queryKey: cartKey });
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: row(en), direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name={en ? "arrow-left" : "arrow-right"} size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{en ? "Cart" : "السلة"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Feather name="shopping-cart" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "Your cart is empty" : "السلة فاضية"}</Text>
          <Pressable onPress={() => router.push("/(tabs)/store")} style={[styles.shopBtn, { backgroundColor: COLORS.primary }]}>
            <Text style={styles.shopBtnText}>{en ? "Browse books" : "اتفرّج على الكتب"}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => String(i.id)}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 120 }}
            renderItem={({ item }) => (
              <View style={[styles.item, { backgroundColor: colors.surface, flexDirection: row(en), direction: "ltr" }]}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={[COLORS.primary + "22", COLORS.primary + "0A"]} style={styles.cover}>
                    <Feather name="book" size={20} color={COLORS.primary} />
                  </LinearGradient>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={2} style={[styles.itemTitle, { color: colors.text, textAlign: ta }]}>{item.title}</Text>
                  <Text style={[styles.itemPrice, { color: COLORS.primary, textAlign: ta }]}>{formatNumber(item.priceEgp)} {en ? "EGP" : "ج"}</Text>
                  <View style={[styles.qtyRow, { flexDirection: row(en), direction: "ltr" }]}>
                    <Pressable onPress={() => setQty(item, item.quantity - 1)} style={[styles.qtyBtn, { borderColor: colors.border }]}>
                      <Feather name="minus" size={14} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.qtyText, { color: colors.text }]}>{formatNumber(item.quantity)}</Text>
                    <Pressable onPress={() => setQty(item, item.quantity + 1)} disabled={item.quantity >= item.stockQuantity} style={[styles.qtyBtn, { borderColor: colors.border, opacity: item.quantity >= item.stockQuantity ? 0.4 : 1 }]}>
                      <Feather name="plus" size={14} color={colors.text} />
                    </Pressable>
                    <Pressable onPress={() => setQty(item, 0)} hitSlop={8} style={{ marginInlineStart: "auto" }}>
                      <Feather name="trash-2" size={18} color={COLORS.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          />
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <View style={[styles.totalRow, { flexDirection: row(en), direction: "ltr" }]}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>{en ? "Subtotal" : "الإجمالي"}</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>{formatNumber(subtotal)} {en ? "EGP" : "ج"}</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/store/checkout")} style={[styles.checkoutBtn, { flexDirection: row(en), direction: "ltr" }]}>
              <Text style={styles.checkoutText}>{en ? "Checkout" : "إتمام الطلب"}</Text>
              <Feather name={en ? "arrow-right" : "arrow-left"} size={18} color="#fff" />
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
  headerTitle: { ...FONT.bold, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  emptyText: { ...FONT.semiBold, fontSize: 16 },
  shopBtn: { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 },
  shopBtnText: { ...FONT.bold, fontSize: 14, color: "#fff" },
  item: { borderRadius: 16, padding: 12, gap: 12 },
  cover: { width: 60, height: 80, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  itemTitle: { ...FONT.bold, fontSize: 14 },
  itemPrice: { ...FONT.bold, fontSize: 14 },
  qtyRow: { alignItems: "center", gap: 12, marginTop: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qtyText: { ...FONT.bold, fontSize: 15, minWidth: 22, textAlign: "center" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  totalRow: { alignItems: "center", justifyContent: "space-between" },
  totalLabel: { ...FONT.semiBold, fontSize: 14 },
  totalValue: { ...FONT.bold, fontSize: 20 },
  checkoutBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center", justifyContent: "center", gap: 8 },
  checkoutText: { ...FONT.bold, fontSize: 16, color: "#fff" },
});
