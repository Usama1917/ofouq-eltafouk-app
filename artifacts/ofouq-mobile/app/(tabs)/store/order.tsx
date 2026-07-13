import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { ORDER_STATUS_FLOW, cancelOrder, getOrder, orderKey, orderStatusLabel, ordersKey } from "@/lib/store";

const STAGE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  placed: "shopping-bag",
  confirmed: "check-circle",
  packed: "package",
  shipped: "truck",
  out_for_delivery: "map-pin",
  delivered: "home",
};

// Same clearance as the book screen so the fixed cancel bar sits above the floating tab bar.
const TAB_BAR_CLEARANCE = Platform.OS === "ios" ? 70 : 60;

export default function OrderTrackingScreen() {
  const { orderId, justPlaced } = useLocalSearchParams<{ orderId: string; justPlaced?: string }>();
  const { token } = useAuth();
  const { colors, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";

  const { data: order, isLoading, refetch } = useQuery({ queryKey: orderKey(orderId), queryFn: () => getOrder(token, orderId), enabled: !!token && !!orderId });
  useRefetchOnFocus(refetch);

  const cancelled = order?.status === "cancelled";
  const currentIndex = order ? ORDER_STATUS_FLOW.indexOf(order.status as (typeof ORDER_STATUS_FLOW)[number]) : -1;
  const canCancel = order ? ["placed", "confirmed", "packed"].includes(order.status) : false;

  async function doCancel() {
    if (!token || !order) return;
    setCancelling(true);
    try {
      await cancelOrder(token, order.id);
      await Promise.all([qc.invalidateQueries({ queryKey: orderKey(orderId) }), qc.invalidateQueries({ queryKey: ordersKey })]);
    } catch (e) {
      Alert.alert(en ? "Error" : "خطأ", e instanceof Error ? e.message : "");
    } finally {
      setCancelling(false);
    }
  }

  function confirmCancel() {
    // Formal Arabic (فصحى) per the owner's request — not colloquial.
    Alert.alert(
      en ? "Cancel order?" : "إلغاء الطلب؟",
      en ? "Are you sure you want to cancel this order?" : "هل أنت متأكد من إلغاء هذا الطلب؟",
      [
        { text: en ? "No" : "لا", style: "cancel" },
        { text: en ? "Yes, cancel" : "نعم، إلغاء", style: "destructive", onPress: () => void doCancel() },
      ],
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: "row", direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/store/orders"))} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{order?.orderNumber ?? (en ? "Order" : "الطلب")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading || !order ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + (canCancel ? 210 : 40) }}>
          {/* Success banner — hidden entirely once the order is cancelled (owner request).
              Physical order (direction:"ltr"): Arabic → the sentence hugs the ✓ on the
              right; English mirrored. */}
          {justPlaced === "1" && !cancelled ? (
            <View style={[styles.successBanner, { backgroundColor: COLORS.success + "15", direction: "ltr" }]}>
              {!isRTL ? <Feather name="check-circle" size={22} color={COLORS.success} /> : null}
              <Text style={[styles.successText, { color: COLORS.success, textAlign: ta }]}>
                {en ? "Order placed! We'll deliver it soon." : "تم الطلب بنجاح! هنوصّلهولك قريب."}
              </Text>
              {isRTL ? <Feather name="check-circle" size={22} color={COLORS.success} /> : null}
            </View>
          ) : null}

          {/* Timeline */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* Physical alignment: title right in Arabic / left in English on every device. */}
            <View style={{ flexDirection: "row", direction: "ltr", justifyContent: isRTL ? "flex-end" : "flex-start" }}>
              <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Order tracking" : "تتبّع الطلب"}</Text>
            </View>
            {cancelled ? (
              <View style={[styles.cancelledBox, { backgroundColor: COLORS.error + "12", flexDirection: row(en), direction: "ltr" }]}>
                <Feather name="x-circle" size={20} color={COLORS.error} />
                <Text style={[styles.cancelledText, { color: COLORS.error }]}>{en ? "This order was cancelled" : "الطلب ده اتلغى"}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                {ORDER_STATUS_FLOW.map((stage, i) => {
                  const done = i <= currentIndex;
                  const isLast = i === ORDER_STATUS_FLOW.length - 1;
                  return (
                    <View key={stage} style={[styles.stageRow, { flexDirection: row(en), direction: "ltr" }]}>
                      <View style={{ alignItems: "center" }}>
                        <View style={[styles.stageDot, { backgroundColor: done ? COLORS.primary : colors.surfaceSecondary, borderColor: done ? COLORS.primary : colors.border }]}>
                          <Feather name={STAGE_ICON[stage]} size={15} color={done ? "#fff" : colors.textTertiary} />
                        </View>
                        {!isLast ? <View style={[styles.stageLine, { backgroundColor: i < currentIndex ? COLORS.primary : colors.border }]} /> : null}
                      </View>
                      <Text style={[styles.stageLabel, { color: done ? colors.text : colors.textTertiary, textAlign: ta, ...(done ? FONT.bold : FONT.regular) }]}>
                        {orderStatusLabel(stage, en)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Items */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: "row", direction: "ltr", justifyContent: isRTL ? "flex-end" : "flex-start" }}>
              <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Items" : "الكتب"}</Text>
            </View>
            {order.items.map((it) => (
              <View key={it.id} style={[styles.itemRow, { flexDirection: row(en), direction: "ltr" }]}>
                <Text style={[styles.itemName, { color: colors.text, textAlign: ta }]} numberOfLines={1}>{it.titleSnapshot}</Text>
                <Text style={[styles.itemQty, { color: colors.textSecondary }]}>×{it.quantity}</Text>
              </View>
            ))}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SumRow label={en ? "Subtotal" : "المجموع"} value={`${order.subtotalEgp} ${en ? "EGP" : "ج"}`} en={en} colors={colors} />
            <SumRow label={en ? "Shipping" : "الشحن"} value={`${order.shippingEgp} ${en ? "EGP" : "ج"}`} en={en} colors={colors} />
            {order.discountEgp > 0 ? <SumRow label={en ? "Discount" : "الخصم"} value={`−${order.discountEgp} ${en ? "EGP" : "ج"}`} en={en} colors={colors} /> : null}
            <SumRow label={en ? "Total" : "الإجمالي"} value={`${order.totalEgp} ${en ? "EGP" : "ج"}`} en={en} colors={colors} bold />
          </View>

          {/* Address */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/* Title + details: physically right in Arabic / left in English. */}
            <View style={{ direction: "ltr", alignItems: isRTL ? "flex-end" : "flex-start", gap: 8 }}>
              <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Delivery to" : "التوصيل إلى"}</Text>
              <Text style={[styles.addrLine, { color: colors.text, textAlign: ta }]}>{order.recipientName}</Text>
              <Text style={[styles.addrMuted, { color: colors.textSecondary, textAlign: ta }]}>{order.phone}</Text>
              <Text style={[styles.addrMuted, { color: colors.textSecondary, textAlign: ta }]}>{[order.governorate, order.city, order.street].filter(Boolean).join("، ")}</Text>
            </View>
          </View>

        </ScrollView>
        {/* Fixed full-width cancel bar above the floating tab bar (like the cart buttons). */}
        {canCancel ? (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Pressable onPress={confirmCancel} disabled={cancelling} style={[styles.cancelBtn, { borderColor: COLORS.error }]}>
              {cancelling ? <ActivityIndicator color={COLORS.error} /> : <Text style={[styles.cancelBtnText, { color: COLORS.error }]}>{en ? "Cancel order" : "إلغاء الطلب"}</Text>}
            </Pressable>
          </View>
        ) : null}
        </>
      )}
    </View>
  );
}

function SumRow({ label, value, en, colors, bold }: { label: string; value: string; en: boolean; colors: typeof COLORS.light; bold?: boolean }) {
  return (
    <View style={[styles.sumRow, { flexDirection: en ? "row" : "row-reverse", direction: "ltr" }]}>
      <Text style={[bold ? styles.sumLabelBold : styles.sumLabel, { color: bold ? colors.text : colors.textSecondary }]}>{label}</Text>
      <Text style={[bold ? styles.sumValueBold : styles.sumValue, { color: bold ? COLORS.primary : colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...FONT.bold, fontSize: 17, flex: 1, textAlign: "center", marginHorizontal: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  successBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14 },
  successText: { ...FONT.semiBold, fontSize: 14, flex: 1 },
  card: { borderRadius: 16, padding: 16, gap: 8 },
  sectionH: { ...FONT.bold, fontSize: 16 },
  cancelledBox: { alignItems: "center", gap: 10, borderRadius: 12, padding: 12, marginTop: 8 },
  cancelledText: { ...FONT.semiBold, fontSize: 14 },
  stageRow: { alignItems: "flex-start", gap: 12 },
  stageDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stageLine: { width: 2, height: 26, marginVertical: 2 },
  stageLabel: { fontSize: 15, paddingTop: 5 },
  itemRow: { alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemName: { ...FONT.semiBold, fontSize: 14, flex: 1 },
  itemQty: { ...FONT.bold, fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  sumRow: { alignItems: "center", justifyContent: "space-between" },
  sumLabel: { ...FONT.regular, fontSize: 14 },
  sumValue: { ...FONT.semiBold, fontSize: 14 },
  sumLabelBold: { ...FONT.bold, fontSize: 15 },
  sumValueBold: { ...FONT.bold, fontSize: 17 },
  addrLine: { ...FONT.semiBold, fontSize: 15 },
  addrMuted: { ...FONT.regular, fontSize: 13 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cancelBtn: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { ...FONT.bold, fontSize: 15 },
});
