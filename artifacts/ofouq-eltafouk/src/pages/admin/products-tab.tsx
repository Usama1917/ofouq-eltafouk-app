import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Save, Trash2, X, Upload, Settings, ImagePlus, TicketPercent, Eye } from "lucide-react";
import ShippingTab from "./shipping-tab";
import StoreLayoutDialog from "./store-layout-dialog";

const dateFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium" });

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const imgSrc = (url: string | null) => (!url ? "" : url.startsWith("http") ? url : apiPath(url));

type Book = {
  id: number;
  title: string;
  author: string;
  description: string;
  subject: string;
  category: string;
  coverUrl: string | null;
  coverPortraitUrl: string | null;
  coverLandscapeUrl: string | null;
  coverPortraitDarkUrl: string | null;
  coverLandscapeDarkUrl: string | null;
  priceEgp: number;
  originalPriceEgp: number | null;
  stockQuantity: number;
  imageUrls: string[] | null;
  weightGrams: number | null;
  unlocksSubjectId: number | null;
  freeShipping: boolean;
  available: boolean;
};
type Subject = { id: number; name: string; yearName: string };
type Settings = { freeShippingThresholdEgp: number | null; pointsPerEgpUnit: number; lowStockThreshold: number };
type Coupon = { id: number; code: string; discountType: string; discountValue: number; discountPercent: number; usageLimit: number | null; usedCount: number; expiresAt: string | null; active: boolean };
const COUPON_TYPES = [
  { value: "percent", label: "خصم نسبة %" },
  { value: "amount", label: "خصم مبلغ (ج)" },
  { value: "free_shipping", label: "شحن مجاني" },
] as const;
function couponEffectLabel(c: { discountType: string; discountPercent: number; discountValue: number }): string {
  if (c.discountType === "free_shipping") return "شحن مجاني";
  if (c.discountType === "amount") return `${c.discountValue} ج`;
  return `${c.discountPercent}%`;
}
type Form = {
  title: string; subject: string; description: string;
  priceEgp: string; originalPriceEgp: string; stockQuantity: string; weightGrams: string;
  unlocksSubjectId: string; coverUrl: string | null; imageUrls: string[];
  coverPortraitUrl: string | null; coverLandscapeUrl: string | null;
  coverPortraitDarkUrl: string | null; coverLandscapeDarkUrl: string | null;
  available: boolean; freeShipping: boolean;
};

const emptyForm: Form = {
  title: "", subject: "", description: "", priceEgp: "", originalPriceEgp: "",
  stockQuantity: "0", weightGrams: "", unlocksSubjectId: "", coverUrl: null, imageUrls: [],
  coverPortraitUrl: null, coverLandscapeUrl: null, coverPortraitDarkUrl: null, coverLandscapeDarkUrl: null,
  available: true, freeShipping: false,
};

export default function ProductsTab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showImgInfo, setShowImgInfo] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [nc, setNc] = useState({ code: "", type: "percent", value: "", usageLimit: "", expiresAt: "" });
  const [addingCoupon, setAddingCoupon] = useState(false);
  const [view, setView] = useState<"products" | "settings" | "shipping">("products");
  const [showLayout, setShowLayout] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [b, s, st, c] = await Promise.all([
        fetch(apiPath("/api/admin/books"), { headers: authHeader() }),
        fetch(apiPath("/api/admin/store/subjects"), { headers: authHeader() }),
        fetch(apiPath("/api/admin/store/settings"), { headers: authHeader() }),
        fetch(apiPath("/api/admin/store/coupons"), { headers: authHeader() }),
      ]);
      if (!b.ok) throw new Error("تعذّر تحميل المنتجات");
      setBooks(await b.json());
      if (s.ok) setSubjects(await s.json());
      if (st.ok) setSettings(await st.json());
      if (c.ok) setCoupons(await c.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function openNew() { setEditing({ id: null, form: { ...emptyForm } }); }
  function openEdit(b: Book) {
    setEditing({
      id: b.id,
      form: {
        title: b.title, subject: b.subject ?? b.category ?? "", description: b.description ?? "",
        priceEgp: String(b.priceEgp ?? 0), originalPriceEgp: b.originalPriceEgp ? String(b.originalPriceEgp) : "",
        stockQuantity: String(b.stockQuantity ?? 0), weightGrams: b.weightGrams ? String(b.weightGrams) : "",
        unlocksSubjectId: b.unlocksSubjectId ? String(b.unlocksSubjectId) : "", coverUrl: b.coverUrl,
        coverPortraitUrl: b.coverPortraitUrl, coverLandscapeUrl: b.coverLandscapeUrl,
        coverPortraitDarkUrl: b.coverPortraitDarkUrl, coverLandscapeDarkUrl: b.coverLandscapeDarkUrl,
        imageUrls: b.imageUrls ?? [], available: b.available, freeShipping: b.freeShipping,
      },
    });
  }
  function patch(fields: Partial<Form>) { setEditing((p) => (p ? { ...p, form: { ...p.form, ...fields } } : p)); }

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("cover", file);
    const res = await fetch(apiPath("/api/admin/books/upload-cover"), { method: "POST", headers: authHeader(), body: fd });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  }
  async function onPickField(
    field: "coverPortraitUrl" | "coverLandscapeUrl" | "coverPortraitDarkUrl" | "coverLandscapeDarkUrl",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) patch({ [field]: url } as Partial<Form>);
    } finally { setUploading(false); e.target.value = ""; }
  }
  async function onPickGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files) { const u = await uploadImage(f); if (u) urls.push(u); }
      patch({ imageUrls: [...(editing?.form.imageUrls ?? []), ...urls] });
    } finally { setUploading(false); e.target.value = ""; }
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    if (!f.title.trim()) { setError("اكتب اسم الكتاب"); return; }
    if (!f.coverLandscapeUrl || !f.coverPortraitUrl) { setError("لازم ترفع الصورتين: العرضية (لوحده) والطولية (في الشبكة)"); return; }
    setSaving(true);
    setError("");
    try {
      const body = {
        title: f.title.trim(), subject: f.subject.trim() || "علوم",
        description: f.description, coverUrl: f.coverPortraitUrl ?? f.coverUrl,
        coverPortraitUrl: f.coverPortraitUrl, coverLandscapeUrl: f.coverLandscapeUrl,
        coverPortraitDarkUrl: f.coverPortraitDarkUrl, coverLandscapeDarkUrl: f.coverLandscapeDarkUrl,
        priceEgp: Number(f.priceEgp) || 0, originalPriceEgp: f.originalPriceEgp ? Number(f.originalPriceEgp) : Number(f.priceEgp) || 0,
        stockQuantity: Number(f.stockQuantity) || 0, weightGrams: f.weightGrams ? Number(f.weightGrams) : null,
        unlocksSubjectId: f.unlocksSubjectId ? Number(f.unlocksSubjectId) : null, imageUrls: f.imageUrls,
        available: f.available, freeShipping: f.freeShipping,
      };
      const res = editing.id
        ? await fetch(apiPath(`/api/admin/books/${editing.id}`), { method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(body) })
        : await fetch(apiPath("/api/admin/books"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("تعذّر حفظ المنتج");
      setEditing(null);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!window.confirm("متأكد إنك عايز تحذف الكتاب ده؟")) return;
    try {
      const res = await fetch(apiPath(`/api/admin/books/${id}`), { method: "DELETE", headers: authHeader() });
      if (!res.ok && res.status !== 204) throw new Error("تعذّر الحذف");
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "حدث خطأ"); }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const res = await fetch(apiPath("/api/admin/store/settings"), {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(settings),
      });
      if (res.ok) setSettings(await res.json());
    } finally { setSavingSettings(false); }
  }

  async function addCoupon() {
    if (!nc.code.trim()) { setError("اكتب الكود"); return; }
    setAddingCoupon(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/store/coupons"), {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          code: nc.code.trim(),
          discountType: nc.type,
          discountValue: Number(nc.value) || 0,
          usageLimit: nc.usageLimit ? Number(nc.usageLimit) : null,
          expiresAt: nc.expiresAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "تعذّر إنشاء الكود");
      setNc({ code: "", type: "percent", value: "", usageLimit: "", expiresAt: "" });
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "حدث خطأ"); }
    finally { setAddingCoupon(false); }
  }
  async function toggleCoupon(c: Coupon) {
    try {
      await fetch(apiPath(`/api/admin/store/coupons/${c.id}`), { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeader() }, body: JSON.stringify({ active: !c.active }) });
      await load(true);
    } catch { /* ignore */ }
  }
  async function deleteCoupon(id: number) {
    if (!window.confirm("متأكد إنك عايز تحذف الكود ده؟")) return;
    try {
      await fetch(apiPath(`/api/admin/store/coupons/${id}`), { method: "DELETE", headers: authHeader() });
      await load(true);
    } catch { /* ignore */ }
  }

  if (loading) return <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="font-display text-2xl font-black flex items-center gap-2"><BookOpen className="w-6 h-6 text-primary" /> المنتجات والشحن</h1>
        <p className="text-sm text-muted-foreground mt-1">كتب المتجر والشحن والإعدادات</p>
      </div>

      {/* Sub-tabs with a sliding highlight pill */}
      <div className="flex gap-1.5 rounded-2xl bg-muted p-1.5 w-fit">
        {([["products", "الكتب"], ["settings", "الإعدادات"], ["shipping", "الشحن"]] as const).map(([id, label]) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`relative rounded-xl px-5 py-2 text-sm font-bold transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {active && (
                <motion.span
                  layoutId="products-subtab-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-white shadow dark:bg-white/10"
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {/* Store settings */}
      {view === "settings" && settings ? (
        <div className="glass-card p-5 space-y-3 border-primary/20">
          <h3 className="font-display font-bold text-base flex items-center gap-2 text-primary"><Settings className="w-4 h-4" /> إعدادات المتجر</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">شحن مجاني فوق (جنيه) — فاضي = مقفول</span>
              <input type="number" min={0} dir="ltr" value={settings.freeShippingThresholdEgp ?? ""} onChange={(e) => setSettings({ ...settings, freeShippingThresholdEgp: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center" />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">نقطة لكل كام جنيه شراء</span>
              <input type="number" min={1} dir="ltr" value={settings.pointsPerEgpUnit} onChange={(e) => setSettings({ ...settings, pointsPerEgpUnit: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center" />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-muted-foreground">حد تنبيه المخزون القليل</span>
              <input type="number" min={0} dir="ltr" value={settings.lowStockThreshold} onChange={(e) => setSettings({ ...settings, lowStockThreshold: Math.max(0, Number(e.target.value) || 0) })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center" />
            </label>
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 disabled:opacity-60"><Save className="w-3.5 h-3.5" /> {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}</button>
        </div>
      ) : null}

      {/* Discount codes */}
      {view === "settings" ? (
      <div className="glass-card p-5 space-y-4 border-primary/20">
        <div>
          <h3 className="font-display font-bold text-base flex items-center gap-2 text-primary"><TicketPercent className="w-4 h-4" /> أكواد الخصم</h3>
          <p className="text-[12px] text-muted-foreground mt-1">اعمل كود خصم بنسبة مئوية، وحدّد صلاحيته لحد تاريخ و/أو عدد مرات استخدام. سيبهم فاضيين = بدون حد.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-6 items-end">
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-muted-foreground">الكود</span>
            <input value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} dir="ltr" placeholder="SAVE20" className={`${inputCls} uppercase`} />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-muted-foreground">نوع الكوبون</span>
            <select value={nc.type} onChange={(e) => setNc({ ...nc, type: e.target.value, value: "" })} className={inputCls}>
              {COUPON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-muted-foreground">{nc.type === "amount" ? "المبلغ (ج)" : nc.type === "free_shipping" ? "القيمة" : "الخصم %"}</span>
            <input type="number" min={1} max={nc.type === "percent" ? 100 : undefined} disabled={nc.type === "free_shipping"} dir="ltr" value={nc.type === "free_shipping" ? "" : nc.value} onChange={(e) => setNc({ ...nc, value: e.target.value })} className={`${inputCls} text-center disabled:opacity-40`} placeholder={nc.type === "free_shipping" ? "—" : nc.type === "amount" ? "50" : "20"} />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-muted-foreground">عدد مرات الاستخدام</span>
            <input type="number" min={1} dir="ltr" value={nc.usageLimit} onChange={(e) => setNc({ ...nc, usageLimit: e.target.value })} className={`${inputCls} text-center`} placeholder="بدون حد" />
          </label>
          <label className="space-y-1 block">
            <span className="text-[11px] font-bold text-muted-foreground">ينتهي في</span>
            <input type="date" dir="ltr" value={nc.expiresAt} onChange={(e) => setNc({ ...nc, expiresAt: e.target.value })} className={inputCls} />
          </label>
          <button onClick={addCoupon} disabled={addingCoupon} className="btn-primary text-sm py-2 px-4 flex items-center justify-center gap-1.5 disabled:opacity-60"><Plus className="w-4 h-4" /> {addingCoupon ? "..." : "إضافة"}</button>
        </div>

        {coupons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th className="text-right font-bold px-3 py-2">الكود</th>
                  <th className="text-right font-bold px-3 py-2">الخصم</th>
                  <th className="text-right font-bold px-3 py-2">الاستخدام</th>
                  <th className="text-right font-bold px-3 py-2">ينتهي</th>
                  <th className="text-right font-bold px-3 py-2">الحالة</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => {
                  const expired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
                  const usedUp = c.usageLimit != null && c.usedCount >= c.usageLimit;
                  return (
                    <tr key={c.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-bold" dir="ltr">{c.code}</td>
                      <td className="px-3 py-2 font-bold text-primary">{couponEffectLabel(c)}</td>
                      <td className="px-3 py-2" dir="ltr">{c.usedCount} / {c.usageLimit ?? "∞"}</td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{c.expiresAt ? dateFmt.format(new Date(c.expiresAt)) : "—"}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => toggleCoupon(c)} className={`text-[11px] font-bold px-2 py-1 rounded-full ${!c.active || expired || usedUp ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                          {expired ? "منتهي" : usedUp ? "خلص" : c.active ? "مفعّل" : "موقوف"}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-left">
                        <button onClick={() => deleteCoupon(c.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      ) : null}

      {/* Shipping (embedded as a tab) */}
      {view === "shipping" ? <ShippingTab /> : null}

      {/* Products */}
      {view === "products" ? (
      <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button onClick={() => setShowLayout(true)} className="text-sm py-2 px-4 rounded-2xl border border-primary/40 bg-primary/5 text-primary font-bold flex items-center gap-1.5 hover:bg-primary/10 transition"><Eye className="w-4 h-4" /> العرض</button>
        <button onClick={openNew} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5"><Plus className="w-4 h-4" /> كتاب جديد</button>
      </div>
      {showLayout ? <StoreLayoutDialog onClose={() => setShowLayout(false)} /> : null}
      {books.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm font-bold text-muted-foreground"><BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" /> مفيش كتب — أضف أول كتاب</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <div key={b.id} className="glass-card p-4 flex gap-3 border-primary/10">
              <div className="w-16 h-20 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                {b.coverUrl ? <img src={imgSrc(b.coverUrl)} alt="" className="w-full h-full object-cover" /> : <BookOpen className="w-6 h-6 text-primary/50" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{b.title}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-primary font-bold text-sm" dir="ltr">{b.priceEgp} ج</span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${b.stockQuantity <= 0 ? "bg-red-100 text-red-700" : b.stockQuantity <= (settings?.lowStockThreshold ?? 5) ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>مخزون {b.stockQuantity}</span>
                  {!b.available ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">مخفي</span> : null}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={() => openEdit(b)} className="text-xs font-bold text-primary">تعديل</button>
                  <button onClick={() => del(b.id)} className="text-xs font-bold text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      ) : null}

      {/* Editor modal */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div dir="rtl" onClick={(e) => e.stopPropagation()} className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl bg-background p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-black">{editing.id ? "تعديل كتاب" : "كتاب جديد"}</h2>
              <button onClick={() => setEditing(null)} className="p-2 rounded-xl hover:bg-foreground/5"><X className="w-5 h-5" /></button>
            </div>

            {/* Cover art: landscape (full-width) + portrait (grid) — both required; dark variants optional */}
            <div className="space-y-3 rounded-2xl border border-border p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">صور الكتاب</span>
                <div className="relative">
                  <button type="button" onClick={() => setShowImgInfo((v) => !v)} className="w-5 h-5 rounded-full border border-primary/40 text-primary text-xs font-black flex items-center justify-center hover:bg-primary/10" title="نسب الصور">i</button>
                  {showImgInfo ? (
                    <div className="absolute z-10 top-6 right-0 w-72 rounded-xl border border-border bg-background p-3 text-xs shadow-xl space-y-1.5">
                      <p className="font-bold">نسب الصور المطلوبة:</p>
                      <p>• <b>عرضية</b> — نسبة <b dir="ltr">16:9</b> (مثال <span dir="ltr">1280×720</span>). بتظهر لما الكتاب يكون لوحده في السطر وياخد العرض الكامل.</p>
                      <p>• <b>طولية</b> — نسبة <b dir="ltr">3:4</b> (مثال <span dir="ltr">1080×1440</span>). بتظهر لما الكتاب يكون جنب كتاب تاني في شبكة عمودين.</p>
                      <p className="text-muted-foreground pt-1">صور الوضع الداكن اختيارية — لو مرفعتهاش بيستخدم نفس الصورة العادية.</p>
                    </div>
                  ) : null}
                </div>
              </div>
              {/* column captions: light (right) · dark (left) — desktop only */}
              <div className="hidden md:flex gap-4 text-xs font-bold text-muted-foreground pt-1">
                <span className="flex-1">الوضع الفاتح</span>
                <span className="flex-1">الوضع الداكن (اختياري)</span>
              </div>
              {/* Landscape: light + its dark variant on one row */}
              <div className="flex flex-col md:flex-row gap-4">
                <ImageSlot label="عرضية (لوحده)" hint="نسبة 16:9 — بالعرض الكامل" url={editing.form.coverLandscapeUrl} aspect="landscape" required uploading={uploading} onPick={(e) => onPickField("coverLandscapeUrl", e)} onClear={() => patch({ coverLandscapeUrl: null })} />
                <ImageSlot label="عرضية — داكن" hint="نفس النسبة — اختياري" url={editing.form.coverLandscapeDarkUrl} aspect="landscape" uploading={uploading} onPick={(e) => onPickField("coverLandscapeDarkUrl", e)} onClear={() => patch({ coverLandscapeDarkUrl: null })} />
              </div>
              {/* Portrait: light + its dark variant on one row */}
              <div className="flex flex-col md:flex-row gap-4">
                <ImageSlot label="طولية (في الشبكة)" hint="نسبة 3:4 — جنب كتاب تاني" url={editing.form.coverPortraitUrl} aspect="portrait" required uploading={uploading} onPick={(e) => onPickField("coverPortraitUrl", e)} onClear={() => patch({ coverPortraitUrl: null })} />
                <ImageSlot label="طولية — داكن" hint="نفس النسبة — اختياري" url={editing.form.coverPortraitDarkUrl} aspect="portrait" uploading={uploading} onPick={(e) => onPickField("coverPortraitDarkUrl", e)} onClear={() => patch({ coverPortraitDarkUrl: null })} />
              </div>
            </div>

            <Field label="اسم الكتاب"><input value={editing.form.title} onChange={(e) => patch({ title: e.target.value })} dir="rtl" className={inputCls} /></Field>
            <Field label="التصنيف/المادة"><input value={editing.form.subject} onChange={(e) => patch({ subject: e.target.value })} dir="rtl" className={inputCls} placeholder="فيزياء" /></Field>
            <Field label="الوصف"><textarea value={editing.form.description} onChange={(e) => patch({ description: e.target.value })} dir="rtl" className={`${inputCls} min-h-[70px] resize-y`} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="السعر (ج)"><input type="number" min={0} dir="ltr" value={editing.form.priceEgp} onChange={(e) => patch({ priceEgp: e.target.value })} className={`${inputCls} text-center`} /></Field>
              <Field label="السعر قبل الخصم"><input type="number" min={0} dir="ltr" value={editing.form.originalPriceEgp} onChange={(e) => patch({ originalPriceEgp: e.target.value })} className={`${inputCls} text-center`} /></Field>
              <Field label="المخزون"><input type="number" min={0} dir="ltr" value={editing.form.stockQuantity} onChange={(e) => patch({ stockQuantity: e.target.value })} className={`${inputCls} text-center`} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الوزن (جرام)"><input type="number" min={0} dir="ltr" value={editing.form.weightGrams} onChange={(e) => patch({ weightGrams: e.target.value })} className={`${inputCls} text-center`} placeholder="500" /></Field>
              <Field label="بيفتح مادة (اختياري)">
                <select value={editing.form.unlocksSubjectId} onChange={(e) => patch({ unlocksSubjectId: e.target.value })} className={inputCls}>
                  <option value="">— لا شيء —</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.yearName}</option>)}
                </select>
              </Field>
            </div>

            {/* Gallery */}
            <Field label="صور إضافية">
              <div className="flex items-center gap-2 flex-wrap">
                {editing.form.imageUrls.map((u, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden">
                    <img src={imgSrc(u)} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => patch({ imageUrls: editing.form.imageUrls.filter((_, j) => j !== i) })} className="absolute top-0 left-0 bg-black/60 rounded-br-lg p-0.5"><X className="w-3 h-3 text-white" /></button>
                  </div>
                ))}
                <label className="w-14 h-14 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer text-muted-foreground hover:border-primary">
                  <Plus className="w-5 h-5" />
                  <input type="file" accept="image/*" multiple hidden onChange={onPickGallery} />
                </label>
              </div>
            </Field>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editing.form.available} onChange={(e) => patch({ available: e.target.checked })} className="h-5 w-5 accent-primary" /><span className="text-sm font-bold">ظاهر في المتجر</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editing.form.freeShipping} onChange={(e) => patch({ freeShipping: e.target.checked })} className="h-5 w-5 accent-primary" /><span className="text-sm font-bold">شحن مجاني</span></label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "حفظ"}</button>
              <button onClick={() => setEditing(null)} className="text-sm py-2.5 px-5 rounded-2xl border border-border font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// One upload slot. Preview box mirrors the target aspect (portrait 3:4 / landscape 16:9)
// so the owner can eyeball whether their image fits before saving.
function ImageSlot({
  label, hint, url, aspect, required, uploading, onPick, onClear,
}: {
  label: string; hint?: string; url: string | null; aspect: "portrait" | "landscape";
  required?: boolean; uploading: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void;
}) {
  const box = aspect === "portrait" ? "w-[84px] h-28" : "w-40 h-[90px]";
  const missing = Boolean(required) && !url;
  return (
    <div className="flex-1 min-w-0 flex items-center gap-3">
      <div className={`${box} rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 relative border ${missing ? "border-red-400/70" : "border-transparent"}`}>
        {url ? <img src={imgSrc(url)} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-6 h-6 text-primary/50" />}
        {url ? <button type="button" onClick={onClear} className="absolute top-0 left-0 bg-black/60 rounded-br-lg p-0.5"><X className="w-3 h-3 text-white" /></button> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold flex items-center gap-1">
          {label}
          {required ? <span className="text-red-500">*</span> : <span className="text-xs text-muted-foreground font-semibold">(اختياري)</span>}
        </div>
        {hint ? <div className="text-xs text-muted-foreground mt-0.5">{hint}</div> : null}
        <label className="mt-1.5 inline-flex text-xs py-1.5 px-3 rounded-xl border border-primary/30 bg-primary/5 font-bold text-primary items-center gap-1.5 cursor-pointer hover:bg-primary/10">
          <Upload className="w-3.5 h-3.5" /> {uploading ? "جاري الرفع..." : url ? "تغيير الصورة" : "رفع صورة"}
          <input type="file" accept="image/*" hidden onChange={onPick} />
        </label>
      </div>
    </div>
  );
}
