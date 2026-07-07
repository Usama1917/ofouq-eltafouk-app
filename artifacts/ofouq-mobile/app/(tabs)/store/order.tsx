import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
    Alert.alert(
      en ? "Cancel order?" : "إلغاء الطلب؟",
      en ? "Are you sure you want to cancel this order?" : "متأكد إنك عايز تلغي الطلب ده؟",
      [
        { text: en ? "No" : "لأ", style: "cancel" },
        { text: en ? "Yes, cancel" : "أيوه، ألغِ", style: "destructive", onPress: () => void doCancel() },
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
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 40 }}>
          {justPlaced === "1" ? (
            <View style={[styles.successBanner, { backgroundColor: COLORS.success + "15" }]}>
              <Feather name="check-circle" size={22} color={COLORS.success} />
              <Text style={[styles.successText, { color: COLORS.success, textAlign: ta }]}>
                {en ? "Order placed! We'll deliver it soon." : "تم الطلب بنجاح! هنوصّلهولك قريب."}
              </Text>
            </View>
          ) : null}

          {/* Timeline */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Order tracking" : "تتبّع الطلب"}</Text>
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
            <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Items" : "الكتب"}</Text>
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
            <Text style={[styles.sectionH, { color: colors.text, textAlign: ta }]}>{en ? "Delivery to" : "التوصيل إلى"}</Text>
            <Text style={[styles.addrLine, { color: colors.text, textAlign: ta }]}>{order.recipientName}</Text>
            <Text style={[styles.addrMuted, { color: colors.textSecondary, textAlign: ta }]}>{order.phone}</Text>
            <Text style={[styles.addrMuted, { color: colors.textSecondary, textAlign: ta }]}>{[order.governorate, order.city, order.street].filter(Boolean).join("، ")}</Text>
          </View>

          {canCancel ? (
            <Pressable onPress={confirmCancel} disabled={cancelling} style={[styles.cancelBtn, { borderColor: COLORS.error }]}>
              {cancelling ? <ActivityIndicator color={COLORS.error} /> : <Text style={[styles.cancelBtnText, { color: COLORS.error }]}>{en ? "Cancel order" : "إلغاء الطلب"}</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
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
  cancelBtn: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { ...FONT.bold, fontSize: 15 },
});
