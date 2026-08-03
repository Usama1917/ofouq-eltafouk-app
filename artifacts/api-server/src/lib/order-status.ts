import { eq, sql } from "drizzle-orm";
import { db, booksTable, ordersTable, orderItemsTable, orderStatusHistoryTable } from "@workspace/db";

import { awardPoints } from "./gamification";

// The ONE place an order's status changes.
//
// It is reached from two directions — an admin picking a status in the dashboard,
// and the ERPNext webhook reporting what happened to the shipment. Both must
// behave identically (same restock rules, same loyalty points, same student
// notification), so the logic lives here rather than being duplicated per caller.

export const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export type StatusChangeResult =
  | { ok: true; changed: boolean; order: typeof ordersTable.$inferSelect }
  | { ok: false; reason: "not_found" | "bad_status" };

/**
 * Move an order to `status`, recording history, adjusting stock, awarding points
 * on delivery and notifying the student. No-ops when the status is unchanged.
 *
 * `notify` runs the student notification; passing false is only for callers that
 * have already told the student themselves.
 */
export async function applyOrderStatusChange(
  orderId: number,
  status: string,
  note: string | null = null,
  options: { notify?: boolean } = {},
): Promise<StatusChangeResult> {
  if (!isOrderStatus(status)) return { ok: false, reason: "bad_status" };

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status === status) return { ok: true, changed: false, order };

  await db.transaction(async (tx) => {
    await tx.update(ordersTable).set({ status, updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
    await tx.insert(orderStatusHistoryTable).values({ orderId, status, note });
    const items = await tx
      .select({ bookId: orderItemsTable.bookId, quantity: orderItemsTable.quantity })
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId));

    // Restock ONLY on a real non-cancelled → cancelled transition (the prior
    // status guard prevents restocking an already-cancelled order twice).
    if (status === "cancelled" && order.status !== "cancelled") {
      for (const it of items) {
        if (it.bookId) {
          await tx
            .update(booksTable)
            .set({ stockQuantity: sql`${booksTable.stockQuantity} + ${it.quantity}` })
            .where(eq(booksTable.id, it.bookId));
        }
      }
    } else if (order.status === "cancelled" && status !== "cancelled") {
      // Reviving a cancelled order → take the stock back out.
      for (const it of items) {
        if (it.bookId) {
          await tx
            .update(booksTable)
            .set({ stockQuantity: sql`greatest(0, ${booksTable.stockQuantity} - ${it.quantity})` })
            .where(eq(booksTable.id, it.bookId));
        }
      }
    }
  });

  // Loyalty points are credited once, only when the order is actually DELIVERED
  // (a settled, non-reversible state) — idempotent per order via sourceKey, so a
  // duplicate webhook can't mint a second batch.
  if (status === "delivered") {
    const { getStoreSettings } = await import("./store-settings");
    const settings = await getStoreSettings();
    const unit = settings.pointsPerEgpUnit > 0 ? settings.pointsPerEgpUnit : 10;
    const points = Math.floor(order.subtotalEgp / unit);
    if (points > 0) {
      await awardPoints({
        userId: order.userId,
        type: "book_purchase",
        amount: points,
        description: `شراء كتب (طلب ${order.orderNumber ?? order.id})`,
        sourceKey: `order:${order.id}`,
      }).catch(() => 0);
    }
  }

  if (options.notify !== false) {
    const { notifyOrderStatus } = await import("./order-notifications");
    await notifyOrderStatus(order.userId, { id: order.id, orderNumber: order.orderNumber }, status).catch(() => undefined);
  }

  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  return { ok: true, changed: true, order: updated ?? order };
}
