import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db, appSettingsTable, booksTable, ordersTable, orderItemsTable, usersTable } from "@workspace/db";

import {
  ErpError,
  createErpSalesInvoice,
  ensureErpCustomer,
  fetchErpStatusUpdates,
  fetchErpStock,
  findInvoiceByOrderNumber,
  isErpConfigured,
} from "./erp";
import { applyOrderStatusChange } from "./order-status";
import { logger } from "./logger";

// Outbox + stock sync for the ERPNext link.
//
// Design rule: the ERP is downstream of the store, never in front of it. A
// student's checkout completes against our own database and the invoice is
// pushed afterwards, so an ERP outage can delay bookkeeping but can never stop a
// sale or lose an order.

const MAX_ATTEMPTS_LOG = 400; // truncation guard for stored error text

/** Push one order. Safe to call repeatedly — it no-ops once the order is sent. */
export async function pushOrderToErp(orderId: number): Promise<void> {
  if (!isErpConfigured()) return;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return;
  if (order.erpInvoiceName) return; // already in the ERP

  try {
    const items = await db
      .select({
        bookId: orderItemsTable.bookId,
        title: orderItemsTable.titleSnapshot,
        qty: orderItemsTable.quantity,
        rate: orderItemsTable.unitPriceEgp,
        erpItemCode: booksTable.erpItemCode,
      })
      .from(orderItemsTable)
      .leftJoin(booksTable, eq(orderItemsTable.bookId, booksTable.id))
      .where(eq(orderItemsTable.orderId, orderId));

    // Every line must map to an ERP item, otherwise the invoice would be wrong
    // rather than merely late — surface it instead of pushing something bogus.
    const unmapped = items.filter((i) => !i.erpItemCode);
    if (unmapped.length > 0) {
      await markFailed(orderId, `كتب من غير كود صنف في السيستم: ${unmapped.map((u) => u.title).join("، ")}`, false);
      return;
    }

    const orderNumber = order.orderNumber ?? `OF-${String(order.id).padStart(5, "0")}`;

    // Adopt an invoice a previous attempt may have created before failing to
    // record it (ERP committed, our response was lost) — never duplicate.
    const existing = await findInvoiceByOrderNumber(orderNumber);
    if (existing) {
      await markSent(orderId, existing);
      return;
    }

    const [student] = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, order.userId))
      .limit(1);

    const customer = await ensureErpCustomer({
      userId: order.userId,
      name: order.recipientName || student?.name || `طالب ${order.userId}`,
      phone: order.phone,
    });

    const invoiceName = await createErpSalesInvoice({
      orderNumber,
      customer,
      items: items.map((i) => ({ itemCode: i.erpItemCode!, qty: i.qty, rateEgp: i.rate, description: i.title })),
      shippingEgp: order.shippingEgp,
      discountEgp: order.discountEgp,
      recipientName: order.recipientName,
      phone: order.phone,
      governorate: order.governorate,
      city: order.city,
      street: order.street,
      notes: order.addressNotes,
    });

    await markSent(orderId, invoiceName);
    logger.info({ orderId, invoiceName }, "ERP: sales invoice created");
  } catch (err) {
    const retryable = err instanceof ErpError ? err.retryable : true;
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(orderId, message, retryable);
    logger.warn({ orderId, err: message, retryable }, "ERP: push failed");
  }
}

async function markSent(orderId: number, invoiceName: string) {
  await db
    .update(ordersTable)
    .set({ erpSyncState: "sent", erpInvoiceName: invoiceName, erpSyncError: null, erpSyncedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
}

async function markFailed(orderId: number, message: string, retryable: boolean) {
  await db
    .update(ordersTable)
    // A non-retryable failure (bad item code, rejected payload) parks the order
    // as "failed" for a human to fix in the admin; the worker keeps retrying the
    // retryable ones on its own.
    .set({ erpSyncState: "failed", erpSyncError: `${retryable ? "" : "[يحتاج تدخل] "}${message}`.slice(0, MAX_ATTEMPTS_LOG) })
    .where(eq(ordersTable.id, orderId));
}

/** Fire-and-forget push used right after checkout. Never rejects. */
export function schedulePushOrderToErp(orderId: number): void {
  if (!isErpConfigured()) return;
  void pushOrderToErp(orderId).catch(() => undefined);
}

/**
 * Retry pass over orders that haven't reached the ERP. Batched so one sweep can
 * never hammer the ERP with hundreds of parallel requests.
 */
export async function runErpOutbox(batchSize = 20): Promise<{ processed: number }> {
  if (!isErpConfigured()) return { processed: 0 };

  const pending = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(isNull(ordersTable.erpInvoiceName), inArray(ordersTable.erpSyncState, ["pending", "failed"])))
    .orderBy(ordersTable.id)
    .limit(batchSize);

  for (const row of pending) {
    await pushOrderToErp(row.id);
  }
  return { processed: pending.length };
}

/**
 * Pull shipment status from the ERP and apply it.
 *
 * This is the PRIMARY status mechanism, not a fallback: the ERP writes waybills
 * and COD collection with raw `db.set_value` calls that fire no document event,
 * so Frappe never emits a webhook for them (proven by the ERP team's own test).
 * Their poll endpoint watermarks on the child rows' `modified`, which those raw
 * writes do bump — so nothing is missed.
 *
 * Drains pages while `has_more` is set, and only advances the stored cursor after
 * a page is fully applied, so a crash mid-page replays rather than skips.
 */
export async function pollErpOrderStatus(maxPages = 10): Promise<{ applied: number; seen: number }> {
  if (!isErpConfigured()) return { applied: 0, seen: 0 };

  const settings = await getAppSettingsRow();
  let cursor = settings?.erpPollCursor ?? null;
  let applied = 0;
  let seen = 0;

  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchErpStatusUpdates(cursor);
    seen += batch.updates.length;

    for (const update of batch.updates) {
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.orderNumber, update.orderNo)).limit(1);
      // An unknown order number is an ERP-side invoice that didn't come from the
      // app — skip quietly.
      if (!order) continue;

      const patch: Partial<typeof ordersTable.$inferInsert> = {};
      if (update.shippingNumber && update.shippingNumber !== order.shippingNumber) {
        patch.shippingNumber = update.shippingNumber;
      }
      if (update.shippingNumbers.length > 0) {
        const current = order.shippingNumbers ?? [];
        if (current.join("|") !== update.shippingNumbers.join("|")) patch.shippingNumbers = update.shippingNumbers;
      }
      if (update.invoiceName && update.invoiceName !== order.erpInvoiceName) {
        patch.erpInvoiceName = update.invoiceName;
        patch.erpSyncState = "sent";
      }
      if (Object.keys(patch).length > 0) {
        await db.update(ordersTable).set(patch).where(eq(ordersTable.id, order.id));
      }

      // Same mapping the admin uses — collected money outranks a waybill,
      // and a return outranks both.
      let next: string | null = null;
      if (update.isReturn) next = "cancelled";
      else if (update.collectedAmount > 0) next = "delivered";
      else if (update.shippingNumber) next = "shipped";

      if (next && next !== order.status) {
        await applyOrderStatusChange(order.id, next, "تحديث تلقائي من السيستم");
        applied += 1;
      }
    }

    // Advance only after the whole page landed.
    if (batch.cursor && batch.cursor !== cursor) {
      cursor = batch.cursor;
      await setErpPollCursor(cursor);
    }
    if (!batch.hasMore) break;
  }

  return { applied, seen };
}

async function getAppSettingsRow() {
  const [row] = await db.select().from(appSettingsTable).orderBy(asc(appSettingsTable.id)).limit(1);
  if (row) return row;
  await db.insert(appSettingsTable).values({}).onConflictDoNothing();
  const [created] = await db.select().from(appSettingsTable).orderBy(asc(appSettingsTable.id)).limit(1);
  return created;
}

async function setErpPollCursor(cursor: string) {
  const row = await getAppSettingsRow();
  if (!row) return;
  await db.update(appSettingsTable).set({ erpPollCursor: cursor }).where(eq(appSettingsTable.id, row.id));
}

/**
 * Refresh the cached stock of every ERP-linked book.
 *
 * GUARD: a book is skipped while any of its orders is still waiting to reach the
 * ERP. Those orders already decremented our local stock but haven't decremented
 * the ERP's yet, so copying the ERP figure over would silently hand the sold
 * copies back to the shelf and allow overselling.
 */
export async function syncErpStock(): Promise<{ updated: number; skipped: number }> {
  if (!isErpConfigured()) return { updated: 0, skipped: 0 };

  const linked = await db
    .select({ id: booksTable.id, code: booksTable.erpItemCode, stock: booksTable.stockQuantity })
    .from(booksTable)
    .where(isNotNull(booksTable.erpItemCode));
  if (linked.length === 0) return { updated: 0, skipped: 0 };

  // Books sitting on an order that hasn't been pushed yet.
  const blockedRows = await db
    .selectDistinct({ bookId: orderItemsTable.bookId })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(isNull(ordersTable.erpInvoiceName), ne(ordersTable.erpSyncState, "skipped")));
  const blocked = new Set(blockedRows.map((r) => r.bookId).filter((id): id is number => id != null));

  const syncable = linked.filter((b) => !blocked.has(b.id));
  const stock = await fetchErpStock(syncable.map((b) => b.code!).filter(Boolean));

  let updated = 0;
  for (const book of syncable) {
    const qty = stock.get(book.code!);
    // No Bin row = the ERP has nothing to say about this item (never stocked).
    // Treat that as "unknown" and leave our number alone rather than zeroing a
    // book the owner can actually still sell.
    if (qty === undefined) continue;
    const next = Math.max(0, Math.floor(qty));
    if (next === book.stock) continue;
    await db.update(booksTable).set({ stockQuantity: next, erpStockSyncedAt: new Date() }).where(eq(booksTable.id, book.id));
    updated += 1;
  }
  return { updated, skipped: linked.length - syncable.length };
}
