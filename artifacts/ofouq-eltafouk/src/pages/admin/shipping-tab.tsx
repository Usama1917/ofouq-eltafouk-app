import { useEffect, useMemo, useState } from "react";
import { Truck, Save, Plus, Trash2, Info, Package } from "lucide-react";

// Self-contained helpers (mirror the other admin tabs) so this file stands alone.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Zone = {
  id: number;
  name: string;
  basePriceEgp: number;
  perExtraKgEgp: number;
  baseWeightGrams: number;
};
type Gov = { id: number; governorate: string; zoneId: number };

export default function ShippingTab() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [govs, setGovs] = useState<Gov[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busyGov, setBusyGov] = useState<number | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/shipping"), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل إعدادات الشحن");
      const data = await res.json();
      setZones(data.zones ?? []);
      setGovs(data.governorates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  function patchZone(id: number, fields: Partial<Zone>) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...fields } : z)));
    setSavedId(null);
  }

  async function saveZone(zone: Zone) {
    setSavingId(zone.id);
    setSavedId(null);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/admin/shipping/zones/${zone.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          name: zone.name,
          basePriceEgp: zone.basePriceEgp,
          perExtraKgEgp: zone.perExtraKgEgp,
          baseWeightGrams: zone.baseWeightGrams,
        }),
      });
      if (!res.ok) throw new Error("تعذّر حفظ المنطقة");
      setSavedId(zone.id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ");
    } finally {
      setSavingId(null);
    }
  }

  async function addZone() {
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/shipping/zones"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ name: "منطقة جديدة", basePriceEgp: 0, perExtraKgEgp: 7, baseWeightGrams: 2000 }),
      });
      if (!res.ok) throw new Error("تعذّر إضافة المنطقة");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  async function deleteZone(id: number) {
    setError("");
    try {
      const res = await fetch(apiPath(`/api/admin/shipping/zones/${id}`), {
        method: "DELETE",
        headers: authHeader(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "تعذّر حذف المنطقة");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    }
  }

  async function reassignGov(gov: Gov, zoneId: number) {
    setBusyGov(gov.id);
    setGovs((prev) => prev.map((g) => (g.id === gov.id ? { ...g, zoneId } : g)));
    setError("");
    try {
      const res = await fetch(apiPath(`/api/admin/shipping/governorates/${gov.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ zoneId }),
      });
      if (!res.ok) throw new Error("تعذّر تغيير المنطقة");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
      await load(true);
    } finally {
      setBusyGov(null);
    }
  }

  if (loading) {
    return <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="font-display text-2xl font-black flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" /> الشحن
        </h1>
        <p className="text-sm text-muted-foreground mt-1">إعدادات شحن الكتب حسب المحافظة (عن طريق البريد المصري «وصلها»).</p>
      </div>

      {/* How shipping is calculated — explanation */}
      <div className="glass-card p-5 space-y-3 border-primary/20">
        <h3 className="font-display font-bold text-base flex items-center gap-2 text-primary">
          <Info className="w-4 h-4" /> الشحن بيتحسب إزاي؟
        </h3>
        <ul className="space-y-2 text-[13px] leading-7 text-muted-foreground">
          <li>• لكل طلب، بنشوف <b className="text-foreground">محافظة الطالب</b> → بتوديه <b className="text-foreground">منطقته</b> من الجدول تحت → ومنها <b className="text-foreground">السعر الأساسي</b>.</li>
          <li>• السعر الأساسي بيشمل أول <b className="text-foreground">وزن معيّن</b> (افتراضي ٢ كيلو). لو مجموع أوزان الكتب أكبر، بنزوّد <b className="text-foreground">سعر الكيلو الزيادة</b> عن كل كيلو إضافي.</li>
          <li>• الناتج بيظهر للطالب <b className="text-foreground">قبل ما يأكّد الطلب</b>. كل الأرقام دي بتعدّلها من هنا، وبتتطبّق على طول.</li>
        </ul>
        <div className="rounded-2xl border border-amber-300/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[12px] font-bold text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <span>⚠️</span>
          <span>الأرقام الحالية <b>تقديرية</b> من أسعار البريد المنشورة. أول ما تتعاقد مع البريد وتاخد سعرك الحقيقي لكل منطقة، عدّله من كروت المناطق تحت.</span>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {/* Zone cards — editable prices */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" /> مناطق الشحن وأسعارها
          </h3>
          <button
            onClick={() => void addZone()}
            className="text-xs py-1.5 px-3 rounded-xl border border-primary/30 bg-primary/5 font-bold text-primary flex items-center gap-1.5 hover:bg-primary/10"
          >
            <Plus className="w-3.5 h-3.5" /> منطقة جديدة
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {zones.map((zone) => {
            const govCount = govs.filter((g) => g.zoneId === zone.id).length;
            return (
              <div key={zone.id} className="glass-card p-4 space-y-3 border-primary/15">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={zone.name}
                    onChange={(e) => patchZone(zone.id, { name: e.target.value })}
                    dir="rtl"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void deleteZone(zone.id)}
                    disabled={govCount > 0}
                    title={govCount > 0 ? "فيه محافظات في المنطقة دي — غيّرها الأول" : "حذف المنطقة"}
                    className="shrink-0 p-2 rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-muted-foreground">السعر الأساسي (جنيه)</span>
                    <input
                      type="number"
                      min={0}
                      value={zone.basePriceEgp}
                      onChange={(e) => patchZone(zone.id, { basePriceEgp: Math.max(0, Number(e.target.value) || 0) })}
                      dir="ltr"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-muted-foreground">الكيلو الزيادة (جنيه)</span>
                    <input
                      type="number"
                      min={0}
                      value={zone.perExtraKgEgp}
                      onChange={(e) => patchZone(zone.id, { perExtraKgEgp: Math.max(0, Number(e.target.value) || 0) })}
                      dir="ltr"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[11px] font-bold text-muted-foreground">لأول (كيلو)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={zone.baseWeightGrams / 1000}
                      onChange={(e) =>
                        patchZone(zone.id, { baseWeightGrams: Math.max(0, Math.round((Number(e.target.value) || 0) * 1000)) })
                      }
                      dir="ltr"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-center outline-none focus:border-primary"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{govCount} محافظة</span>
                  <div className="flex items-center gap-2">
                    {savedId === zone.id ? <span className="text-xs font-bold text-emerald-600">تم الحفظ ✓</span> : null}
                    <button
                      onClick={() => void saveZone(zone)}
                      disabled={savingId === zone.id}
                      className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingId === zone.id ? "جاري الحفظ..." : "حفظ"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Governorates table — each mapped to a zone */}
      <div className="space-y-3">
        <h3 className="font-display font-bold text-base flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" /> المحافظات وتكلفة شحنها
        </h3>
        <div className="glass-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[12px] text-muted-foreground">
                  <th className="text-right font-bold px-4 py-3">المحافظة</th>
                  <th className="text-right font-bold px-4 py-3">المنطقة</th>
                  <th className="text-right font-bold px-4 py-3">تكلفة الشحن</th>
                </tr>
              </thead>
              <tbody>
                {govs.map((gov) => {
                  const zone = zoneById.get(gov.zoneId);
                  return (
                    <tr key={gov.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-bold">{gov.governorate}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={gov.zoneId}
                          disabled={busyGov === gov.id}
                          onChange={(e) => void reassignGov(gov, Number(e.target.value))}
                          className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary disabled:opacity-60"
                        >
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 font-bold" dir="ltr">
                        {zone ? `${zone.basePriceEgp} ج` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
