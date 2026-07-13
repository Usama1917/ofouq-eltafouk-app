import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { FONT } from "@/constants/typography";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { formatNumber } from "@/lib/format";
import { listOrders, orderStatusLabel, ordersKey } from "@/lib/store";

const STATUS_COLOR: Record<string, string> = {
  placed: "#64748B",
  confirmed: "#3B82F6",
  packed: "#6366F1",
  shipped: "#8B5CF6",
  out_for_delivery: "#F59E0B",
  delivered: "#10B981",
  cancelled: "#EF4444",
};

export default function OrdersScreen() {
  const { token } = useAuth();
  const { colors, language, isRTL } = usePreferences();
  const en = language === "en";
  const insets = useSafeAreaInsets();
  const row = (e: boolean): "row" | "row-reverse" => (e ? "row" : "row-reverse");
  const ta = isRTL ? "right" : "left";

  const { data: orders = [], isLoading, refetch } = useQuery({ queryKey: ordersKey, queryFn: () => listOrders(token), enabled: !!token });
  useRefetchOnFocus(refetch);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6, flexDirection: "row", direction: "ltr", borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={[styles.circleBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{en ? "My orders" : "طلباتي"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="package" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{en ? "No orders yet" : "لسه مفيش طلبات"}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const color = STATUS_COLOR[item.status] ?? colors.textSecondary;
            return (
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/store/order", params: { orderId: String(item.id) } })}
                style={[styles.card, { backgroundColor: colors.surface }]}
              >
                <View style={[styles.cardTop, { flexDirection: row(en), direction: "ltr" }]}>
                  <Text style={[styles.orderNo, { color: colors.text }]} >{item.orderNumber ?? `#${item.id}`}</Text>
                  <View style={[styles.badge, { backgroundColor: color + "22" }]}>
                    <Text style={[styles.badgeText, { color }]}>{orderStatusLabel(item.status, en)}</Text>
                  </View>
                </View>
                <View style={[styles.cardBottom, { flexDirection: row(en), direction: "ltr" }]}>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {formatNumber(item.itemCount)} {en ? "items" : "كتاب"} · {en ? "COD" : "عند الاستلام"}
                  </Text>
                  <Text style={[styles.total, { color: COLORS.primary }]}>{formatNumber(item.totalEgp)} {en ? "EGP" : "ج"}</Text>
                </View>
              </Pressable>
            );
          }}
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
  card: { borderRadius: 16, padding: 16, gap: 10 },
  cardTop: { alignItems: "center", justifyContent: "space-between" },
  orderNo: { ...FONT.bold, fontSize: 15 },
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { ...FONT.bold, fontSize: 12 },
  cardBottom: { alignItems: "center", justifyContent: "space-between" },
  meta: { ...FONT.regular, fontSize: 13 },
  total: { ...FONT.bold, fontSize: 16 },
});
