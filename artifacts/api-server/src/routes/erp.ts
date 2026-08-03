import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq, isNotNull, sql } from "drizzle-orm";
import { db, booksTable, ordersTable } from "@workspace/db";

import { ErpError, erpOrderRefField, isErpConfigured, listErpItems } from "../lib/erp";
import { pollErpOrderStatus, pushOrderToErp, runErpOutbox, syncErpStock } from "../lib/erp-sync";
import { logger } from "../lib/logger";
import { applyOrderStatusChange } from "../lib/order-status";

// ERPNext integration surface:
//   • /integrations/erp/*  — inbound webhook from the ERP (secret-authenticated,
//     NOT session-authenticated: the caller is a server, not a logged-in user)
//   • /admin/erp/*         — admin tools, gated by the app-level /api/admin check
const router: IRouter = Router();

const WEBHOOK_SECRET = (process.env.ERP_WEBHOOK_SECRET ?? "").trim();

/** Constant-time compare so a wrong secret can't be recovered by timing. */
function secretMatches(provided: string): boolean {
  if (!WEBHOOK_SECRET || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

// ── Inbound: shipment status from the ERP ────────────────────────────────────
// Configured once in ERPNext (Webhook doctype) on Sales Invoice. We derive the
// student-facing status from the same signals the owner's own shipping tooling
// already maintains:
//   waybill assigned            → shipped
//   COD collected amount > 0    → delivered
//   the invoice is a return     → cancelled
router.post("/integrations/erp/order-status", async (req, res) => {
  try {
    if (!WEBHOOK_SECRET) {
      res.status(503).json({ error: "ERP webhook is not configured" });
      return;
    }
    // Frappe sends the configured secret in a header of the owner's choosing;
    // accept the two conventional ones.
    const provided = String(req.header("x-erp-secret") ?? req.header("x-frappe-webhook-signature") ?? "");
    if (!secretMatches(provided)) {
      logger.warn({ ip: req.ip }, "ERP webhook: bad secret");
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    // Match on OUR order number when the ERP sends it, else on the invoice name.
    const orderNumber = String(body.order_no ?? body[erpOrderRefField()] ?? "").trim();
    const invoiceName = String(body.name ?? body.invoice ?? "").trim();
    if (!orderNumber && !invoiceName) {
      res.status(400).json({ error: "order_no or name is required" });
      return;
    }

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(orderNumber ? eq(ordersTable.orderNumber, orderNumber) : eq(ordersTable.erpInvoiceName, invoiceName))
      .limit(1);
    if (!order) {
      // 200, not 404: an unknown invoice is an ERP-side order that didn't come
      // from the app, and Frappe would otherwise retry it forever.
      res.json({ ok: true, ignored: "order not found" });
      return;
    }

    const shippingNumber = String(body.shipping_number ?? "").trim() || null;
    const collected = Number(body.collected_amount ?? 0) || 0;
    const isReturn = body.is_return === 1 || body.is_return === true || body.is_return === "1";

    let nextStatus: string | null = null;
    if (isReturn) nextStatus = "cancelled";
    else if (collected > 0) nextStatus = "delivered";
    else if (shippingNumber) nextStatus = "shipped";

    // Record the waybill even when the status itself doesn't move.
    if (shippingNumber && shippingNumber !== order.shippingNumber) {
      await db.update(ordersTable).set({ shippingNumber }).where(eq(ordersTable.id, order.id));
    }
    if (invoiceName && !order.erpInvoiceName) {
      await db.update(ordersTable).set({ erpInvoiceName: invoiceName, erpSyncState: "sent" }).where(eq(ordersTable.id, order.id));
    }

    if (!nextStatus || nextStatus === order.status) {
      res.json({ ok: true, status: order.status, shippingNumber });
      return;
    }

    // Reuse the admin status pipeline so the student notification, the loyalty
    // points on delivery and the stock restock on cancellation all behave exactly
    // as they do when the status is changed by hand.
    await applyOrderStatusChange(order.id, nextStatus, "تحديث تلقائي من السيستم");

    res.json({ ok: true, status: nextStatus, shippingNumber });
  } catch (err) {
    logger.error({ err }, "ERP webhook error");
    res.status(500).json({ error: "internal error" });
  }
});

// ── Admin: item picker + sync controls ───────────────────────────────────────
router.get("/admin/erp/status", async (_req, res) => {
  const [row] = await db
    .select({ linked: sql<number>`count(*)::int` })
    .from(booksTable)
    .where(isNotNull(booksTable.erpItemCode));
  res.json({ configured: isErpConfigured(), webhookReady: Boolean(WEBHOOK_SECRET), linkedBooks: row?.linked ?? 0 });
});

router.get("/admin/erp/items", async (req, res) => {
  try {
    if (!isErpConfigured()) {
      res.status(503).json({ error: "الربط مع السيستم مش متظبّط لسه" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const items = await listErpItems(q, toInt(req.query.limit, 20));
    res.json(items);
  } catch (err) {
    const message = err instanceof ErpError ? err.message : "تعذّر الوصول للسيستم";
    logger.warn({ err }, "ERP item search failed");
    res.status(502).json({ error: message });
  }
});

/** Manual "push this order now" for an order stuck in failed. */
router.post("/admin/orders/:id/erp-retry", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    // Clear the previous failure so the attempt starts clean.
    await db.update(ordersTable).set({ erpSyncState: "pending", erpSyncError: null }).where(eq(ordersTable.id, id));
    await pushOrderToErp(id);
    const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    res.json({ ok: true, erpSyncState: updated?.erpSyncState, erpInvoiceName: updated?.erpInvoiceName, erpSyncError: updated?.erpSyncError });
  } catch (err) {
    logger.error({ err }, "ERP manual retry failed");
    res.status(500).json({ error: "تعذّرت إعادة الإرسال" });
  }
});

/** Manual "check the ERP for status changes now" — same path the worker runs. */
router.post("/admin/erp/poll-status", async (_req, res) => {
  try {
    const result = await pollErpOrderStatus();
    res.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof ErpError ? err.message : "تعذّر الاتصال بالسيستم";
    logger.warn({ err }, "ERP manual status poll failed");
    res.status(502).json({ error: message });
  }
});

router.post("/admin/erp/sync-stock", async (_req, res) => {
  try {
    const result = await syncErpStock();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ err }, "ERP stock sync failed");
    res.status(502).json({ error: "تعذّر تحديث المخزون من السيستم" });
  }
});

router.post("/admin/erp/run-outbox", async (_req, res) => {
  try {
    const result = await runErpOutbox();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.warn({ err }, "ERP outbox run failed");
    res.status(502).json({ error: "تعذّر إرسال الطلبات المعلّقة" });
  }
});

export default router;
