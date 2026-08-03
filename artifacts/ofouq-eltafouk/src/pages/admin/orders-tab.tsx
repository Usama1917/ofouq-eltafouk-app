import { useEffect, useState } from "react";
import { ShoppingCart, Search, X, Download, AlertTriangle, Package, Phone, MapPin, ChevronLeft, ChevronRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const dateFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

const ORDER_STATUSES = ["placed", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  placed: { label: "تم الطلب", cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
  confirmed: { label: "تم التأكيد", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  packed: { label: "بيتجهّز", cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  shipped: { label: "اتشحن", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  out_for_delivery: { label: "خرج للتوصيل", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  delivered: { label: "اتسلّم", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  cancelled: { label: "ملغي", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};
const payLabel = (m: string) => (m === "cod" ? "عند الاستلام" : m);

type OrderRow = {
  id: number;
  orderNumber: string | null;
  status: OrderStatus;
  recipientName: string;
  phone: string;
  governorate: string;
  totalEgp: number;
  paymentMethod: string;
  createdAt: string;
  itemCount: number;
};
type OrderItem = { id: number; titleSnapshot: string; unitPriceEgp: number; quantity: number };
type TimelineRow = { id: number; status: OrderStatus; note: string | null; createdAt: string };
type OrderDetail = OrderRow & {
  subtotalEgp: number;
  shippingEgp: number;
  discountEgp: number;
  voucherCode: string | null;
  city: string;
  street: string;
  addressNotes: string | null;
  items: OrderItem[];
  timeline: TimelineRow[];
  student: { id: number; name: string | null; email: string } | null;
};
type LowStock = { threshold: number; books: { id: number; title: string; stockQuantity: number }[] };

function StatusBadge({ status }: { status: OrderStatus }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-slate-100 text-slate-700" };
  return <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
}

const PAGE_SIZE = 50;

export default function OrdersTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<LowStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Shared by the table (one page) and the Excel export (everything matching).
  function queryParams(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    return params;
  }

  async function load(silent = false, targetPage = page) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = queryParams({ limit: String(PAGE_SIZE), offset: String(targetPage * PAGE_SIZE) });
      const [oRes, lsRes] = await Promise.all([
        fetch(apiPath(`/api/admin/orders?${params.toString()}`), { headers: authHeader() }),
        fetch(apiPath("/api/admin/store/low-stock"), { headers: authHeader() }),
      ]);
      if (!oRes.ok) throw new Error("تعذّر تحميل الطلبات");
      const data = await oRes.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setStatusCounts(data.statusCounts ?? {});
      if (lsRes.ok) setLowStock(await lsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Changing the filter or the search invalidates the current page number.
  function applyFilters(nextStatus: "" | OrderStatus = statusFilter) {
    setStatusFilter(nextStatus);
    setPage(0);
  }

  useEffect(() => {
    void load(false, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  async function openOrder(id: number) {
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/admin/orders/${id}`), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل الطلب");
      setSelected(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(status: OrderStatus) {
    if (!selected) return;
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/admin/orders/${selected.id}/status`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("تعذّر تغيير الحالة");
      await openOrder(selected.id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setUpdating(false);
    }
  }

  // Exports EVERY order matching the current filter/search — not just the page on
  // screen — so paginating the table never silently shrinks the export.
  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const params = queryParams({ limit: "10000", offset: "0" });
      const res = await fetch(apiPath(`/api/admin/orders?${params.toString()}`), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل الطلبات للتصدير");
      const data = await res.json();
      buildCsv(data.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التصدير");
    } finally {
      setExporting(false);
    }
  }

  function buildCsv(rowsToExport: OrderRow[]) {
    const headers = ["رقم الطلب", "الحالة", "الاسم", "التليفون", "المحافظة", "الإجمالي", "الدفع", "عدد الكتب", "التاريخ"];
    const rows = rowsToExport.map((o) => [
      o.orderNumber ?? String(o.id),
      STATUS_META[o.status]?.label ?? o.status,
      o.recipientName,
      o.phone,
      o.governorate,
      String(o.totalEgp),
      payLabel(o.paymentMethod),
      String(o.itemCount),
      dateFmt.format(new Date(o.createdAt)),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    // UTF-8 BOM so Excel renders Arabic correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastShown = Math.min(total, page * PAGE_SIZE + orders.length);

  if (loading) {
    return <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-black flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" /> الطلبات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">طلبات المتجر — غيّر الحالة عشان الطالب يتابع شحنته.</p>
        </div>
        <button
          onClick={() => void exportCsv()}
          disabled={exporting}
          className="text-xs py-2 px-4 rounded-xl border border-primary/30 bg-primary/5 font-bold text-primary flex items-center gap-1.5 hover:bg-primary/10 transition-colors disabled:opacity-60"
        >
          <Download className="w-4 h-4" /> {exporting ? "جاري التصدير..." : "تصدير Excel"}
        </button>
      </div>

      {lowStock && lowStock.books.length > 0 ? (
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] font-bold text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>مخزون قليل ({lowStock.books.length}): {lowStock.books.map((b) => `${b.title} (${b.stockQuantity})`).join(" · ")}</span>
        </div>
      ) : null}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (page === 0 ? void load() : setPage(0))}
            placeholder="ابحث برقم الطلب / الاسم / التليفون / المحافظة"
            dir="rtl"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button onClick={() => (page === 0 ? void load() : setPage(0))} className="text-xs font-bold text-primary">بحث</button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => applyFilters(e.target.value as "" | OrderStatus)}
          className="rounded-2xl border border-border bg-background px-3 py-2 text-sm font-semibold"
        >
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label} {statusCounts[s] ? `(${statusCounts[s]})` : ""}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {/* Orders table */}
      {orders.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm font-bold text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" /> لا توجد طلبات
        </div>
      ) : (
        <div className="glass-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th className="text-right font-bold px-4 py-3">رقم الطلب</th>
                  <th className="text-right font-bold px-4 py-3">العميل</th>
                  <th className="text-right font-bold px-4 py-3">المحافظة</th>
                  <th className="text-right font-bold px-4 py-3">الإجمالي</th>
                  <th className="text-right font-bold px-4 py-3">الحالة</th>
                  <th className="text-right font-bold px-4 py-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} onClick={() => void openOrder(o.id)} className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-primary/5 transition-colors">
                    <td className="px-4 py-3 font-bold" dir="ltr">{o.orderNumber ?? o.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold">{o.recipientName}</div>
                      <div className="text-[11px] text-muted-foreground" dir="ltr">{o.phone} · {o.itemCount} كتاب</div>
                    </td>
                    <td className="px-4 py-3">{o.governorate}</td>
                    <td className="px-4 py-3 font-bold" dir="ltr">{o.totalEgp} ج</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">{dateFmt.format(new Date(o.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination — hidden while everything fits on one page */}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold text-muted-foreground">
            <span dir="ltr">{firstShown}–{lastShown}</span> من <span dir="ltr">{total}</span> طلب
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs py-2 px-3 rounded-xl border border-border font-bold flex items-center gap-1 hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" /> السابق
            </button>
            <span className="text-xs font-bold text-muted-foreground px-1" dir="ltr">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="text-xs py-2 px-3 rounded-xl border border-border font-bold flex items-center gap-1 hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              التالي <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Detail modal */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl bg-background p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-black" dir="ltr">{selected.orderNumber ?? `#${selected.id}`}</h2>
              <button onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-foreground/5"><X className="w-5 h-5" /></button>
            </div>

            {detailLoading ? <div className="text-center text-sm text-muted-foreground py-4">جاري التحميل...</div> : null}

            {/* Status control */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-muted-foreground">حالة الطلب</span>
                <StatusBadge status={selected.status} />
              </div>
              <select
                value={selected.status}
                disabled={updating}
                onChange={(e) => void changeStatus(e.target.value as OrderStatus)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">تغيير الحالة بيوصل إشعار للطالب فورًا ويتحدّث في شاشة تتبّع طلبه.</p>
            </div>

            {/* Address */}
            <div className="rounded-2xl border border-border p-4 space-y-1.5 text-sm">
              <div className="font-bold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" /> عنوان الشحن</div>
              <div>{selected.recipientName}</div>
              <div className="text-muted-foreground flex items-center gap-1.5" dir="ltr"><Phone className="w-3.5 h-3.5" /> {selected.phone}</div>
              <div className="text-muted-foreground">{[selected.governorate, selected.city, selected.street].filter(Boolean).join("، ")}</div>
              {selected.addressNotes ? <div className="text-[12px] text-muted-foreground">ملاحظات: {selected.addressNotes}</div> : null}
            </div>

            {/* Items */}
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[12px] text-muted-foreground">
                    <th className="text-right font-bold px-4 py-2.5">الكتاب</th>
                    <th className="text-right font-bold px-4 py-2.5">السعر</th>
                    <th className="text-right font-bold px-4 py-2.5">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold">{it.titleSnapshot}</td>
                      <td className="px-4 py-2.5" dir="ltr">{it.unitPriceEgp} ج</td>
                      <td className="px-4 py-2.5" dir="ltr">×{it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Money */}
            <div className="rounded-2xl border border-border p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">المجموع</span><span dir="ltr" className="font-semibold">{selected.subtotalEgp} ج</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الشحن</span><span dir="ltr" className="font-semibold">{selected.shippingEgp} ج</span></div>
              {selected.discountEgp > 0 ? <div className="flex justify-between text-emerald-600"><span>خصم {selected.voucherCode ? `(${selected.voucherCode})` : ""}</span><span dir="ltr" className="font-semibold">−{selected.discountEgp} ج</span></div> : null}
              <div className="flex justify-between border-t border-border pt-1.5 mt-1.5"><span className="font-bold">الإجمالي</span><span dir="ltr" className="font-black text-primary">{selected.totalEgp} ج</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">طريقة الدفع</span><span className="font-semibold">{payLabel(selected.paymentMethod)}</span></div>
            </div>

            {/* Timeline */}
            <div className="rounded-2xl border border-border p-4 space-y-2">
              <div className="font-bold text-sm">سجل الحالة</div>
              {selected.timeline.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2"><StatusBadge status={t.status} /> {t.note}</span>
                  <span className="text-muted-foreground">{dateFmt.format(new Date(t.createdAt))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
