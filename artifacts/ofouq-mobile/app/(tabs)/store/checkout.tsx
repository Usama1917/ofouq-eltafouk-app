import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { EGYPT_GOVERNORATES } from "@/lib/egyptGovernorates";
import { formatNumber } from "@/lib/format";
import {
  addressKey,
  cartKey,
  checkCoupon,
  checkout,
  getAddress,
  getCart,
  getShippingQuote,
  ordersKey,
  saveAddress,
  shippingQuoteKey,
  storeBooksKey,
} from "@/lib/store";

export default function CheckoutScreen() {
  const { token } = useAuth();
  const { colors, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gov, setGov] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponFreeShip, setCouponFreeShip] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [govPickerOpen, setGovPickerOpen] = useState(false);

  const { data: cart } = useQuery({ queryKey: cartKey, queryFn: () => getCart(token), enabled: !!token });
  const { data: address } = useQuery({ queryKey: addressKey, queryFn: () => getAddress(token), enabled: !!token });
  const { data: quote } = useQuery({
    queryKey: [...shippingQuoteKey, gov],
    queryFn: () => getShippingQuote(token, gov),
    enabled: !!token && !!gov,
  });

  useEffect(() => {
    if (address) {
      setName(address.recipientName);
      setPhone(address.phone);
      setGov(address.governorate);
      setCity(address.city);
      setStreet(address.street);
      setNotes(address.notes ?? "");
    }
  }, [address]);

  const subtotal = cart?.subtotal ?? 0;
  const freeShipping = couponFreeShip || (quote?.freeShipping ?? false);
  const shipping = freeShipping ? 0 : quote?.shippingEgp ?? 0;
  const total = Math.max(0, subtotal + shipping - discount);

  async function applyCoupon() {
    if (!token || !coupon.trim()) return;
    setCouponMsg("");
    try {
      const r = await checkCoupon(token, coupon.trim());
      setDiscount(r.discountEgp);
      setCouponFreeShip(r.freeShipping);
      setAppliedCode(r.code);
      setCouponMsg(
        r.freeShipping
          ? en ? "Free shipping applied ✓" : "تم تفعيل الشحن المجاني ✓"
          : en ? `Discount ${r.discountEgp} EGP applied ✓` : `تم خصم ${formatNumber(r.discountEgp)} ج ✓`,
      );
    } catch (e) {
      setDiscount(0);
      setCouponFreeShip(false);
      setAppliedCode("");
      setCouponMsg(e instanceof Error ? e.message : en ? "Invalid code" : "كود غير صالح");
    }
  }

  async function placeOrder() {
    if (!token) return;
    if (!name.trim() || !phone.trim() || !gov) {
      setError(en ? "Fill name, phone and governorate" : "اكتب الاسم والتليفون والمحافظة");
      return;
    }
    setError("");
    setPlacing(true);
    try {
      await saveAddress(token, { recipientName: name.trim(), phone: phone.trim(), governorate: gov, city: city.trim(), street: street.trim(), notes: notes.trim() || null });
      const order = await checkout(token, "cod", appliedCode || undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: cartKey }),
        qc.invalidateQueries({ queryKey: ordersKey }),
        qc.invalidateQueries({ queryKey: addressKey }),
        // Post-purchase stock changed — refresh catalog + any open book detail.
        qc.invalidateQueries({ queryKey: storeBooksKey() }),
        qc.invalidateQueries({ queryKey: ["store", "book"] }),
      ]);
      router.replace({ pathname: "/(tabs)/store/order", params: { orderId: String(order.id), justPlaced: "1" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : en ? "Could not place order" : "تعذّر إتمام الطلب");
    } finally {
      setPlacing(false);
    }
  }

  const input = (value: string, setter: (v: string) => void, placeholder: string, keyboard?: "phone-pad") => (
    <TextInput
      value={value}
      onChangeText={setter}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      keyboardType={keyboard}
      style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, textAlign: ta, writingDirection: isRTL ? "rtl" : "ltr" }]}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: row(en), direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name={en ? "arrow-left" : "arrow-right"} size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{en ? "Checkout" : "إتمام الطلب"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 130 }} keyboardShouldPersistTaps="handled">
        {/* Address */}
        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Shipping address" : "عنوان الشحن"}</Text>
          {input(name, setName, en ? "Full name" : "الاسم بالكامل")}
          {input(phone, setPhone, en ? "Phone" : "رقم التليفون", "phone-pad")}
          <Pressable onPress={() => setGovPickerOpen(true)} style={[styles.input, { backgroundColor: colors.surfaceSecondary, flexDirection: row(en), direction: "ltr", alignItems: "center", justifyContent: "space-between" }]}>
            <Text style={[styles.govText, { color: gov ? colors.text : colors.textTertiary }]}>{gov || (en ? "Choose governorate" : "اختر المحافظة")}</Text>
            <Feather name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
          {input(city, setCity, en ? "City / area" : "المدينة / المنطقة")}
          {input(street, setStreet, en ? "Street & building" : "الشارع والعمارة")}
          {input(notes, setNotes, en ? "Notes for the courier (optional)" : "ملاحظات للمندوب (اختياري)")}
        </View>

        {/* Coupon */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Discount code" : "كود الخصم"}</Text>
          <View style={[styles.couponRow, { flexDirection: row(en), direction: "ltr" }]}>
            <TextInput
              value={coupon}
              onChangeText={setCoupon}
              autoCapitalize="characters"
              placeholder={en ? "Enter code" : "اكتب الكود"}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.text, textAlign: ta }]}
            />
            <Pressable onPress={applyCoupon} style={[styles.applyBtn, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.applyText, { color: COLORS.primary }]}>{en ? "Apply" : "تطبيق"}</Text>
            </Pressable>
          </View>
          {couponMsg ? <Text style={[styles.couponMsg, { color: discount > 0 ? COLORS.success : COLORS.error, textAlign: ta }]}>{couponMsg}</Text> : null}
        </View>

        {/* Payment */}
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Payment" : "طريقة الدفع"}</Text>
          <View style={[styles.payOption, { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "10", flexDirection: row(en), direction: "ltr" }]}>
            <Feather name="dollar-sign" size={18} color={COLORS.primary} />
            <Text style={[styles.payText, { color: colors.text }]}>{en ? "Cash on delivery" : "الدفع عند الاستلام"}</Text>
            <Feather name="check-circle" size={18} color={COLORS.primary} style={{ marginInlineStart: "auto" }} />
          </View>
        </View>

        {/* Summary */}
        <View style={[styles.summary, { backgroundColor: colors.surface }]}>
          <SummaryRow label={en ? "Subtotal" : "المجموع"} value={`${formatNumber(subtotal)} ${en ? "EGP" : "ج"}`} en={en} colors={colors} />
          <SummaryRow label={en ? "Shipping" : "الشحن"} value={freeShipping ? (en ? "Free" : "مجاني") : `${formatNumber(shipping)} ${en ? "EGP" : "ج"}`} en={en} colors={colors} />
          {discount > 0 ? <SummaryRow label={en ? "Discount" : "الخصم"} value={`−${formatNumber(discount)} ${en ? "EGP" : "ج"}`} en={en} colors={colors} accent={COLORS.success} /> : null}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SummaryRow label={en ? "Total" : "الإجمالي"} value={`${formatNumber(total)} ${en ? "EGP" : "ج"}`} en={en} colors={colors} bold />
        </View>

        {error ? <Text style={[styles.errorText, { textAlign: ta }]}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Pressable onPress={placeOrder} disabled={placing} style={[styles.placeBtn, { opacity: placing ? 0.7 : 1 }]}>
          {placing ? <ActivityIndicator color="#fff" /> : <Text style={styles.placeText}>{en ? `Place order · ${formatNumber(total)} EGP` : `أكّد الطلب · ${formatNumber(total)} ج`}</Text>}
        </Pressable>
      </View>

      {/* Governorate picker */}
      <Modal visible={govPickerOpen} transparent animationType="slide" onRequestClose={() => setGovPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGovPickerOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{en ? "Choose governorate" : "اختر المحافظة"}</Text>
            <FlatList
              data={EGYPT_GOVERNORATES}
              keyExtractor={(g) => g.value}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setGov(item.value);
                    setGovPickerOpen(false);
                  }}
                  style={[styles.govRow, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.govRowText, { color: colors.text, textAlign: ta }]}>{en ? item.en : item.ar}</Text>
                  {gov === item.value ? <Feather name="check" size={18} color={COLORS.primary} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SummaryRow({ label, value, en, colors, bold, accent }: { label: string; value: string; en: boolean; colors: typeof COLORS.light; bold?: boolean; accent?: string }) {
  return (
    <View style={[styles.sumRow, { flexDirection: en ? "row" : "row-reverse", direction: "ltr" }]}>
      <Text style={[bold ? styles.sumLabelBold : styles.sumLabel, { color: bold ? colors.text : colors.textSecondary }]}>{label}</Text>
      <Text style={[bold ? styles.sumValueBold : styles.sumValue, { color: accent ?? (bold ? COLORS.primary : colors.text) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...FONT.bold, fontSize: 18 },
  sectionH: { ...FONT.bold, fontSize: 16 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, ...FONT.regular, fontSize: 15 },
  govText: { ...FONT.regular, fontSize: 15 },
  couponRow: { gap: 8, alignItems: "center" },
  applyBtn: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  applyText: { ...FONT.bold, fontSize: 14 },
  couponMsg: { ...FONT.semiBold, fontSize: 13 },
  payOption: { alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 14 },
  payText: { ...FONT.semiBold, fontSize: 15 },
  summary: { borderRadius: 16, padding: 16, gap: 10 },
  sumRow: { alignItems: "center", justifyContent: "space-between" },
  sumLabel: { ...FONT.regular, fontSize: 14 },
  sumValue: { ...FONT.semiBold, fontSize: 14 },
  sumLabelBold: { ...FONT.bold, fontSize: 16 },
  sumValueBold: { ...FONT.bold, fontSize: 18 },
  divider: { height: StyleSheet.hairlineWidth },
  errorText: { ...FONT.semiBold, fontSize: 13, color: COLORS.error },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  placeBtn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  placeText: { ...FONT.bold, fontSize: 16, color: "#fff" },
  modalBackdrop: { flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { ...FONT.bold, fontSize: 18, textAlign: "center", marginBottom: 12 },
  govRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  govRowText: { ...FONT.semiBold, fontSize: 15, flex: 1 },
});
