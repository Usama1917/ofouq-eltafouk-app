// ── ERPNext (Frappe v15) integration ─────────────────────────────────────────
// Server-to-server only. The API key/secret live in the API server's environment
// and MUST never reach a browser or the mobile app — the admin dashboard talks to
// the ERP exclusively through our own proxied endpoints.
//
// Auth is Frappe's token scheme: `Authorization: token <key>:<secret>`.
// Docs live at <erp>/api/method/… ; resources at <erp>/api/resource/<DocType>.

const ERP_URL = (process.env.ERP_URL ?? "").trim().replace(/\/+$/, "");
const ERP_API_KEY = (process.env.ERP_API_KEY ?? "").trim();
const ERP_API_SECRET = (process.env.ERP_API_SECRET ?? "").trim();
// Which ERPNext company/warehouse the app's orders belong to. Optional: when
// blank ERPNext falls back to its own defaults.
const ERP_COMPANY = (process.env.ERP_COMPANY ?? "").trim();
const ERP_WAREHOUSE = (process.env.ERP_WAREHOUSE ?? "").trim();
// Custom field on Sales Invoice that carries OUR order number. Configurable
// because the owner names it when they add it in the ERP.
const ERP_ORDER_REF_FIELD = (process.env.ERP_ORDER_REF_FIELD ?? "custom_app_order_no").trim();

const REQUEST_TIMEOUT_MS = 15_000;

/** The integration only runs when it has somewhere to talk to and a key to use. */
export function isErpConfigured(): boolean {
  return Boolean(ERP_URL && ERP_API_KEY && ERP_API_SECRET);
}

export function erpOrderRefField(): string {
  return ERP_ORDER_REF_FIELD;
}

export class ErpError extends Error {
  readonly status: number;
  /** True when retrying later could plausibly succeed (ERP down, timeout, 5xx). */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "ErpError";
    this.status = status;
    this.retryable = retryable;
  }
}

type ErpRequest = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
};

async function erpFetch<T>({ method = "GET", path, query, body }: ErpRequest): Promise<T> {
  if (!isErpConfigured()) {
    throw new ErpError("ERP integration is not configured", 0, false);
  }

  const url = new URL(`${ERP_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  // AbortSignal.timeout: a hung ERP must not hold one of our request handlers
  // (or a worker tick) open indefinitely.
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${ERP_API_KEY}:${ERP_API_SECRET}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure / DNS / timeout — always worth retrying.
    throw new ErpError(err instanceof Error ? err.message : "network error", 0, true);
  }

  const text = await res.text();
  if (!res.ok) {
    // 4xx = we sent something wrong (bad item code, missing field): retrying the
    // identical payload will fail identically, so don't spin on it. 5xx / 429 =
    // the ERP is unwell; back off and try again.
    const retryable = res.status >= 500 || res.status === 429;
    throw new ErpError(`ERP ${res.status}: ${extractErpMessage(text) || text.slice(0, 400)}`, res.status, retryable);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ErpError("ERP returned a non-JSON response", res.status, false);
  }
}

/** Frappe buries the useful message inside `_server_messages` / `exception`. */
function extractErpMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { exception?: string; _server_messages?: string; message?: unknown };
    if (typeof parsed.exception === "string" && parsed.exception) return parsed.exception;
    if (typeof parsed._server_messages === "string") {
      const msgs = JSON.parse(parsed._server_messages) as string[];
      const first = msgs?.[0];
      if (typeof first === "string") {
        try {
          return String((JSON.parse(first) as { message?: string }).message ?? first);
        } catch {
          return first;
        }
      }
    }
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // fall through to the raw body
  }
  return "";
}

// ── Items ────────────────────────────────────────────────────────────────────
export type ErpItem = {
  itemCode: string;
  itemName: string;
  stockUom: string | null;
};

/**
 * Searchable item list for the admin's book picker. Matches on code OR name so
 * the owner can type either.
 */
export async function listErpItems(search: string, limit = 20): Promise<ErpItem[]> {
  const q = search.trim();
  // `is_sales_item = 1` is NOT optional. The ERP team measured 67 items on the
  // site of which only 26 are sellable; picking one of the other 41 doesn't fail
  // here — it fails later at invoice creation with "لم يتم وضع علامة على البند
  // … كعنصر sales", i.e. an order that looks fine until it silently can't sync.
  const filters: unknown[] = [["disabled", "=", 0], ["is_sales_item", "=", 1]];
  if (q) filters.push(["item_name", "like", `%${q}%`]);

  const data = await erpFetch<{ data: { item_code: string; item_name: string; stock_uom?: string }[] }>({
    path: "/api/resource/Item",
    query: {
      fields: JSON.stringify(["item_code", "item_name", "stock_uom"]),
      filters: JSON.stringify(filters),
      limit_page_length: String(Math.min(Math.max(limit, 1), 50)),
      order_by: "modified desc",
    },
  });

  const rows = data.data ?? [];
  // A code-only match wouldn't survive the name filter above, so when the owner
  // types something that looks like a code, ask again by code and merge.
  if (q && rows.length === 0) {
    const byCode = await erpFetch<{ data: { item_code: string; item_name: string; stock_uom?: string }[] }>({
      path: "/api/resource/Item",
      query: {
        fields: JSON.stringify(["item_code", "item_name", "stock_uom"]),
        filters: JSON.stringify([["disabled", "=", 0], ["is_sales_item", "=", 1], ["item_code", "like", `%${q}%`]]),
        limit_page_length: String(limit),
      },
    });
    rows.push(...(byCode.data ?? []));
  }

  return rows.map((r) => ({ itemCode: r.item_code, itemName: r.item_name, stockUom: r.stock_uom ?? null }));
}

/**
 * Live *sellable* stock for the given item codes.
 *
 * Uses `projected_qty`, NOT `actual_qty`. On this site reservations are large —
 * the ERP team measured item QRR 1 at actual_qty 468 but projected_qty 73,
 * because 395 are already committed elsewhere. Selling against `actual_qty`
 * would promise stock that is spoken for, i.e. oversell by design.
 *
 * Summed across warehouses, or restricted to ERP_WAREHOUSE when one is pinned.
 * An item with no Bin row simply has no entry, which callers read as "unknown",
 * NOT zero — note that Product Bundles never have a Bin row at all.
 */
export async function fetchErpStock(itemCodes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const codes = [...new Set(itemCodes.filter(Boolean))];
  if (codes.length === 0) return out;

  // Chunked: a long `in` filter would blow past URL length limits.
  const CHUNK = 40;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK);
    const filters: unknown[] = [["item_code", "in", slice]];
    if (ERP_WAREHOUSE) filters.push(["warehouse", "=", ERP_WAREHOUSE]);

    const data = await erpFetch<{ data: { item_code: string; projected_qty: number; actual_qty: number }[] }>({
      path: "/api/resource/Bin",
      query: {
        fields: JSON.stringify(["item_code", "projected_qty", "actual_qty"]),
        filters: JSON.stringify(filters),
        limit_page_length: "0", // 0 = no limit in Frappe
      },
    });

    for (const row of data.data ?? []) {
      // projected_qty can legitimately be negative (over-committed); clamping is
      // left to the caller so it can tell "0 sellable" from "no data".
      const qty = Number(row.projected_qty ?? row.actual_qty) || 0;
      out.set(row.item_code, (out.get(row.item_code) ?? 0) + qty);
    }
  }
  return out;
}

// ── Order status (poll) ──────────────────────────────────────────────────────
// This — NOT a webhook — is how shipment status reaches us.
//
// The ERP team proved empirically that both signals a student cares about are
// written with `frappe.db.set_value` (shipping_calculator/api.py:406 and
// page/shipping_collection/shipping_collection.py:524). That writes straight to
// the table: no document is loaded, no doc event runs, so Frappe never queues a
// webhook. Their test showed a document save delivering 1 webhook and the two
// raw writes delivering 0 while the values changed. A webhook-only design would
// leave every student stuck on "processing" forever.
//
// `db.set_value` does bump the child row's `modified`, so their endpoint's
// watermark still advances — which is exactly what makes polling reliable here.

export type ErpStatusUpdate = {
  orderNo: string;
  invoiceName: string;
  /** First/primary waybill, or null when none is assigned yet. */
  shippingNumber: string | null;
  /** Every waybill on the invoice — an order can be split across packages. */
  shippingNumbers: string[];
  /** COD collected, summed across all shipping lines. > 0 means delivered. */
  collectedAmount: number;
  isReturn: boolean;
  changedAt: string;
};

export type ErpStatusBatch = {
  updates: ErpStatusUpdate[];
  cursor: string | null;
  hasMore: boolean;
};

type RawUpdate = {
  order_no?: string;
  name?: string;
  shipping_number?: string | null;
  shipping_numbers?: string[] | null;
  collected_amount?: number | string | null;
  is_return?: number | boolean | string | null;
  changed_at?: string;
};

function normalizeUpdate(raw: RawUpdate): ErpStatusUpdate | null {
  const orderNo = String(raw.order_no ?? "").trim();
  if (!orderNo) return null;
  const list = (raw.shipping_numbers ?? []).map((s) => String(s).trim()).filter(Boolean);
  const primary = String(raw.shipping_number ?? "").trim() || list[0] || null;
  return {
    orderNo,
    invoiceName: String(raw.name ?? "").trim(),
    shippingNumber: primary,
    shippingNumbers: list.length > 0 ? list : primary ? [primary] : [],
    collectedAmount: Number(raw.collected_amount ?? 0) || 0,
    isReturn: raw.is_return === 1 || raw.is_return === true || raw.is_return === "1",
    changedAt: String(raw.changed_at ?? ""),
  };
}

/**
 * Fetch everything that changed since `cursor`. Passing null asks for the current
 * state of every app order (the first-run case).
 */
export async function fetchErpStatusUpdates(cursor: string | null, limit = 200): Promise<ErpStatusBatch> {
  // Frappe whitelisted methods wrap their return value in `message`.
  const res = await erpFetch<{
    message?: { updates?: RawUpdate[]; cursor?: string | null; has_more?: boolean };
  }>({
    path: "/api/method/custom_addons.api.app_orders.get_order_status_updates",
    query: { since: cursor ?? undefined, limit: String(limit) },
  });

  const payload = res.message ?? {};
  return {
    updates: (payload.updates ?? []).map(normalizeUpdate).filter((u): u is ErpStatusUpdate => u !== null),
    cursor: payload.cursor ?? null,
    hasMore: Boolean(payload.has_more),
  };
}

// ── Customers ────────────────────────────────────────────────────────────────
/**
 * Find-or-create the ERP Customer for a student. Matched on our own stable key
 * (`app-user-<id>`) written into the customer's name, so repeat orders from the
 * same student never spawn duplicate customers.
 */
export async function ensureErpCustomer(input: { userId: number; name: string; phone: string }): Promise<string> {
  const customerName = `${input.name} (app-${input.userId})`;

  const existing = await erpFetch<{ data: { name: string }[] }>({
    path: "/api/resource/Customer",
    query: {
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([["customer_name", "=", customerName]]),
      limit_page_length: "1",
    },
  });
  const found = existing.data?.[0]?.name;
  if (found) return found;

  const created = await erpFetch<{ data: { name: string } }>({
    method: "POST",
    path: "/api/resource/Customer",
    body: {
      customer_name: customerName,
      customer_type: "Individual",
      // MANDATORY on this site (reqd=1). Allowed: Library / Teacher / Student /
      // Center / Other — "Student" is what the site's existing student records
      // carry. Omitting it is rejected with MandatoryError.
      custom_customer_classification: "Student",
      mobile_no: input.phone,
    },
  });
  return created.data.name;
}

// ── Sales Invoice ────────────────────────────────────────────────────────────
export type ErpInvoiceInput = {
  orderNumber: string;
  customer: string;
  items: { itemCode: string; qty: number; rateEgp: number; description?: string }[];
  shippingEgp: number;
  discountEgp: number;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  notes?: string | null;
};

/**
 * Look up an invoice previously created for this order number. Called before
 * creating one so a retry after an ambiguous failure (e.g. the ERP committed but
 * the response never reached us) adopts the existing invoice instead of
 * duplicating it.
 */
export async function findInvoiceByOrderNumber(orderNumber: string): Promise<string | null> {
  const res = await erpFetch<{ data: { name: string }[] }>({
    path: "/api/resource/Sales Invoice",
    query: {
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([[ERP_ORDER_REF_FIELD, "=", orderNumber]]),
      limit_page_length: "1",
    },
  });
  return res.data?.[0]?.name ?? null;
}

/** Creates the Sales Invoice (left as a draft — the owner submits in the ERP). */
export async function createErpSalesInvoice(input: ErpInvoiceInput): Promise<string> {
  const address = [input.street, input.city, input.governorate].filter(Boolean).join("، ");
  const res = await erpFetch<{ data: { name: string } }>({
    method: "POST",
    path: "/api/resource/Sales Invoice",
    body: {
      [ERP_ORDER_REF_FIELD]: input.orderNumber,
      customer: input.customer,
      ...(ERP_COMPANY ? { company: ERP_COMPANY } : {}),
      due_date: new Date().toISOString().slice(0, 10),
      // MANDATORY, header level. The per-item `warehouse` below does NOT satisfy
      // it — a Property Setter marks this "Source Warehouse" field reqd=1.
      ...(ERP_WAREHOUSE ? { set_warehouse: ERP_WAREHOUSE } : {}),
      // MANDATORY. It's a Select whose options are filled by a browser Client
      // Script, and Client Scripts never run for REST calls — so nothing fills
      // it for us. Its server-side option list is empty, which means any
      // non-empty string is accepted; the delivery address is the useful one.
      custom_selected_address_for_shipping: address,
      custom_selected_shipping_address_value: address,
      items: input.items.map((it) => ({
        item_code: it.itemCode,
        qty: it.qty,
        rate: it.rateEgp,
        ...(ERP_WAREHOUSE ? { warehouse: ERP_WAREHOUSE } : {}),
        ...(it.description ? { description: it.description } : {}),
      })),
      // Shipping and coupon discounts ride along as invoice-level charges so the
      // ERP total matches what the student was actually charged.
      ...(input.shippingEgp > 0
        ? {
            taxes: [
              {
                charge_type: "Actual",
                description: "شحن",
                tax_amount: input.shippingEgp,
                // Account head is required by ERPNext; left to the ERP's default
                // when unset, which the owner configures once.
                ...(process.env.ERP_SHIPPING_ACCOUNT ? { account_head: process.env.ERP_SHIPPING_ACCOUNT } : {}),
              },
            ],
          }
        : {}),
      ...(input.discountEgp > 0 ? { discount_amount: input.discountEgp } : {}),
      po_no: input.orderNumber,
      contact_display: input.recipientName,
      contact_mobile: input.phone,
      customer_address: undefined,
      remarks: [`طلب من التطبيق: ${input.orderNumber}`, `المستلم: ${input.recipientName} — ${input.phone}`, `العنوان: ${address}`, input.notes ?? ""]
        .filter(Boolean)
        .join("\n"),
    },
  });
  return res.data.name;
}
