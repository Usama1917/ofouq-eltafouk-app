import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Flag, ShieldAlert, User as UserIcon, ImageIcon, ArrowLeft, Ban } from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";

// Self-contained helpers (mirrors admin-panel.tsx) so this tab lives in its own file.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

interface ReviewItem {
  id: number;
  userId: number;
  field: "name" | "avatar";
  proposedValue: string | null;
  previousValue: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  createdAt: string;
  reviewedAt: string | null;
  userName: string;
  userEmail: string;
  userStatus: string;
  reportCount: number;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "بانتظار المراجعة", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "مقبول", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "مرفوض", cls: "bg-rose-100 text-rose-700" },
  superseded: { label: "اتعدّل بعدها", cls: "bg-slate-100 text-slate-500" },
};

function Avatar({ url, onClick }: { url: string | null; onClick?: () => void }) {
  if (!url) {
    return (
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
        <UserIcon className="w-6 h-6" />
      </div>
    );
  }
  return (
    <img
      src={apiPath(url)}
      alt=""
      onClick={onClick}
      title={onClick ? "معاينة الصورة" : undefined}
      className={`w-14 h-14 rounded-xl object-cover border border-border/60 ${onClick ? "cursor-pointer transition-transform hover:scale-105" : ""}`}
    />
  );
}

export default function MoralReviewsTab() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [autoSuspendAt, setAutoSuspendAt] = useState(5);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath(`/api/admin/moral-reviews?status=${filter}`), { headers: authHeader() });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setItems(data.items ?? []);
      if (typeof data.autoSuspendAt === "number") setAutoSuspendAt(data.autoSuspendAt);
    } catch {
      setError("تعذّر تحميل المراجعات");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (item: ReviewItem, action: "approve" | "reject" | "report") => {
    if (busyId) return;
    if (action === "report" && !window.confirm(`تبلّغ عن «${item.userName}»؟ عند وصول ${autoSuspendAt} بلاغات يتعلّق حسابه تلقائيًا.`)) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(apiPath(`/api/admin/moral-reviews/${item.id}/${action}`), { method: "POST", headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "failed");
      if (action === "report") {
        setNotice(
          data.suspended
            ? `تم الإبلاغ — وصل ${data.reportCount} بلاغات فاتعلّق حساب «${item.userName}» تلقائيًا.`
            : `تم الإبلاغ — عدد البلاغات على «${item.userName}» بقى ${data.reportCount}/${autoSuspendAt}.`,
        );
      } else {
        setNotice(action === "approve" ? "تم القبول ✓ التعديل بقى ظاهر للكل." : "تم الرفض — التعديل مش هيظهر لباقي المستخدمين.");
      }
      await load();
    } catch (e) {
      setNotice((e as Error)?.message || "حصل خطأ");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-rose-500" />
          <div>
            <h2 className="font-display font-bold text-lg">مراجعات أخلاقية</h2>
            <p className="text-xs text-muted-foreground">مراجعة الأسماء والصور قبل ما تظهر لباقي المستخدمين. {autoSuspendAt} بلاغات = تعليق تلقائي.</p>
          </div>
        </div>
        <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative px-4 py-1.5 rounded-lg font-bold transition-colors ${filter === f ? "text-primary" : "text-muted-foreground"}`}
            >
              {filter === f && (
                <motion.span
                  layoutId="moral-filter-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-lg bg-white shadow dark:bg-white/10"
                />
              )}
              <span className="relative z-10">{f === "pending" ? "بانتظار المراجعة" : "الكل"}</span>
            </button>
          ))}
        </div>
      </div>

      {notice && <div className="text-sm rounded-xl bg-primary/10 text-primary px-4 py-2 font-semibold">{notice}</div>}

      {loading ? (
        <div className="text-center text-muted-foreground py-12">جارٍ التحميل…</div>
      ) : error ? (
        <div className="text-center text-rose-600 py-12">
          {error}
          <button onClick={() => void load()} className="block mx-auto mt-3 text-primary font-bold">إعادة المحاولة</button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {filter === "pending" ? "مفيش مراجعات منتظرة 🎉" : "مفيش سجل مراجعات لسه."}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isPending = item.status === "pending";
            const st = STATUS_LABEL[item.status] ?? STATUS_LABEL.pending;
            return (
              <div key={item.id} className="glass-card p-4">
                {/* user header */}
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{item.userName}</span>
                    <span className="text-xs text-muted-foreground">{item.userEmail}</span>
                    {item.userStatus === "suspended" && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        <Ban className="w-3 h-3" /> معلّق
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.reportCount > 0 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                      البلاغات: {item.reportCount}/{autoSuspendAt}
                    </span>
                    {!isPending && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}
                  </div>
                </div>

                {/* change preview */}
                <div className="flex items-center gap-2 mb-1 text-sm font-bold text-muted-foreground">
                  {item.field === "avatar" ? <ImageIcon className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                  {item.field === "avatar" ? "تغيير الصورة" : "تغيير الاسم"}
                </div>

                {item.field === "avatar" ? (
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <Avatar url={item.previousValue} onClick={item.previousValue ? () => setLightbox(item.previousValue) : undefined} />
                      <div className="text-[11px] text-muted-foreground mt-1">الحالي</div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    <div className="text-center">
                      <Avatar url={item.proposedValue} onClick={item.proposedValue ? () => setLightbox(item.proposedValue) : undefined} />
                      <div className="text-[11px] text-primary mt-1 font-bold">الجديد</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground line-through max-w-[40%] truncate">{item.previousValue || "—"}</span>
                    <ArrowLeft className="w-5 h-5 text-muted-foreground shrink-0" />
                    <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold max-w-[40%] truncate">{item.proposedValue || "—"}</span>
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground mt-2">{fmtDate(item.createdAt)}</div>

                {/* actions */}
                {isPending && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
                    <button
                      disabled={busyId === item.id}
                      onClick={() => void act(item, "approve")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> قبول
                    </button>
                    <button
                      disabled={busyId === item.id}
                      onClick={() => void act(item, "reject")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-bold hover:bg-muted/70 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> رفض
                    </button>
                    <button
                      disabled={busyId === item.id}
                      onClick={() => void act(item, "report")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200 disabled:opacity-50 mr-auto"
                    >
                      <Flag className="w-4 h-4" /> إبلاغ
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {lightbox ? <ImageLightbox src={apiPath(lightbox)} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
