import { db, notificationsTable } from "@workspace/db";

import { sendPushNotificationToUser } from "./push-notifications";
import type { OrderStatus } from "./order-status";

// Student-facing copy for each stage of an order. Extracted from routes/store.ts
// so both the admin status handler and the ERPNext webhook send the exact same
// message for a given status.
const STATUS_MSG: Record<OrderStatus, { t: string; b: string }> = {
  placed: { t: "تم استلام طلبك 🛒", b: "طلبك وصلنا وبنراجعه دلوقتي." },
  confirmed: { t: "تم تأكيد طلبك ✅", b: "بنجهّزلك الطلب حالًا." },
  packed: { t: "طلبك بيتجهّز 📦", b: "جهّزنا كتبك وبنحضّرها للشحن." },
  shipped: { t: "طلبك اتشحن 🚚", b: "الطلب في الطريق إليك." },
  out_for_delivery: { t: "طلبك خرج للتوصيل 🛵", b: "المندوب في الطريق ليك النهارده." },
  delivered: { t: "طلبك اتسلّم 🎉", b: "استمتع بكتبك! لو الكتاب بيفتح محتوى رقمي فعّله بالكود." },
  cancelled: { t: "اتلغى طلبك", b: "لو عندك أي استفسار كلّم الدعم." },
};

/**
 * Notify the student that their order moved to `status`.
 *
 * `dedupeKey` makes this idempotent per (order, status): a webhook the ERP
 * retries — or an admin re-picking the same status — can't send the message
 * twice, and only a genuinely new row triggers a push.
 */
export async function notifyOrderStatus(
  userId: number,
  order: { id: number; orderNumber: string | null },
  status: OrderStatus,
) {
  const m = STATUS_MSG[status];
  if (!m) return;
  const data = { route: "order", orderId: order.id, orderNumber: order.orderNumber, status };
  const [created] = await db
    .insert(notificationsTable)
    .values({
      userId,
      type: `order_${status}`,
      title: m.t,
      body: m.b,
      tone: "primary",
      data,
      dedupeKey: `order:${order.id}:status:${status}`,
    })
    .onConflictDoNothing()
    .returning({ id: notificationsTable.id });
  if (created) {
    await sendPushNotificationToUser({
      userId,
      title: m.t,
      body: m.b,
      data: { ...data, type: `order_${status}`, notificationId: created.id },
    }).catch(() => undefined);
  }
}
