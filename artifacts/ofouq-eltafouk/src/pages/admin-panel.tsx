import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, Users, BookOpen, Video, MessageSquare, 
  Flag, Megaphone, Plus, Edit, Trash2, Eye, Check, X, ArrowUp, ArrowDown,
  TrendingUp, Coins, Award, FileText, LogOut, Crown, GraduationCap, ImagePlus, TicketPercent, Truck
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import {
  useGetAdminStats, useListAdminUsers, useDeleteAdminUser, useUpdateAdminUser, useCreateAdminUser,
  useListAdminBooks, useCreateAdminBook, useUpdateAdminBook, useDeleteAdminBook,
  useListModeratorPosts, useDeleteModeratorPost,
  useListAdminReports, useResolveAdminReport,
  useListAdminBanners, useCreateAdminBanner, useUpdateAdminBanner, useDeleteAdminBanner,
} from "@workspace/api-client-react";
import { Logo } from "@/components/logo";
import { AcademicTab } from "./admin-academic";

type Tab = "dashboard" | "users" | "books" | "posts" | "reports" | "banners" | "academic" | "subscriptionRequests" | "materials";
type Material = { id: number; name: string; classification?: string; sortOrder?: number; createdAt?: string };
type SubscriptionRequestItem = {
  id: number;
  code: string;
  codeImageUrl?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string;
  submittedAt: string;
  reviewedAt?: string | null;
  student: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
  };
  year: {
    id: number;
    name: string;
  };
  subject: {
    id: number;
    name: string;
  };
};

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "users", label: "المستخدمون", icon: Users },
  { id: "academic", label: "المحتوى الأكاديمي", icon: GraduationCap },
  { id: "subscriptionRequests", label: "طلبات الاشتراك", icon: TicketPercent },
  { id: "books", label: "الكتب", icon: BookOpen },
  { id: "posts", label: "المنشورات", icon: MessageSquare },
  { id: "reports", label: "التقارير", icon: Flag },
  { id: "banners", label: "البنرات", icon: Megaphone },
];

const DEFAULT_MATERIAL_OPTIONS = ["علوم", "رياضيات", "لغة عربية", "لغة إنجليزية", "تاريخ", "برمجة"];
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;

// ── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ title, content, onConfirm, onCancel }: {
  title: string; content: React.ReactNode; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-muted/20">
          <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" /> معاينة قبل النشر
          </h3>
          <button onClick={onCancel} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-muted/30 rounded-2xl p-4">
            <p className="text-xs font-bold text-muted-foreground mb-3">معاينة المحتوى كما سيظهر للمستخدمين</p>
            {content}
          </div>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 btn-primary justify-center py-3 text-sm">
              <Check className="w-4 h-4" /> تأكيد النشر
            </button>
            <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-border text-foreground font-semibold text-sm hover:bg-muted transition-all">
              <X className="w-4 h-4 inline-block ml-1.5" /> إلغاء
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Stats Card ────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg }: any) {
  return (
    <div className={`glass-card p-5 bg-gradient-to-br ${bg}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <div className={`w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <p className={`font-display font-black text-4xl ${color}`}>{value?.toLocaleString("ar-EG") ?? "—"}</p>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────
function DashboardTab({ onOpenMaterials }: { onOpenMaterials: () => void }) {
  const { data: stats } = useGetAdminStats();
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold">نظرة عامة على المنصة</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="المستخدمون" value={stats?.totalUsers} icon={Users} color="text-primary" bg="from-blue-50/80 to-indigo-50/60" />
        <StatCard label="الكتب" value={stats?.totalBooks} icon={BookOpen} color="text-violet-600" bg="from-violet-50/80 to-purple-50/60" />
        <StatCard label="الفيديوهات" value={stats?.totalVideos} icon={Video} color="text-sky-600" bg="from-sky-50/80 to-cyan-50/60" />
        <StatCard label="المنشورات" value={stats?.totalPosts} icon={MessageSquare} color="text-orange-500" bg="from-orange-50/80 to-amber-50/60" />
        <StatCard label="المسابقات" value={stats?.totalGames} icon={Award} color="text-emerald-600" bg="from-emerald-50/80 to-teal-50/60" />
        <StatCard label="المكافآت" value={stats?.totalRewards} icon={Award} color="text-amber-500" bg="from-amber-50/80 to-yellow-50/60" />
        <StatCard label="النقاط المتداولة" value={stats?.totalPointsCirculating} icon={Coins} color="text-amber-600" bg="from-amber-50/80 to-orange-50/60" />
        <StatCard label="التقارير المعلقة" value={stats?.pendingReports} icon={Flag} color="text-rose-500" bg="from-rose-50/80 to-pink-50/60" />
      </div>
      <div className="glass-card p-5 border-primary/20">
        <button
          onClick={onOpenMaterials}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary font-bold hover:bg-primary/15 transition-all"
        >
          <span className="text-base">إدارة المواد (إضافة / حذف / ترتيب)</span>
          <FileText className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Materials Tab ────────────────────────────────────────────────────────
function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [newMaterialForm, setNewMaterialForm] = useState({ name: "", classification: "" });

  const loadMaterials = async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await fetch(apiPath("/api/admin/materials"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل المواد");
      }
      if (!Array.isArray(data)) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      setMaterials(data);
    } catch (err: any) {
      setLoadError(err?.message || "تعذر تحميل المواد");
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterials();
  }, []);

  const handleCreate = async () => {
    const name = newMaterialForm.name.trim();
    const classification = newMaterialForm.classification.trim();
    if (!name) {
      alert("اكتب اسم المادة أولًا");
      return;
    }
    if (!classification) {
      alert("اكتب التصنيف أولًا");
      return;
    }
    try {
      setCreating(true);
      const res = await fetch(apiPath("/api/admin/materials"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classification }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر إضافة المادة");
      }
      setNewMaterialForm({ name: "", classification: "" });
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر إضافة المادة");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (material: Material) => {
    if (!confirm(`حذف المادة "${material.name}"؟`)) return;
    try {
      const res = await fetch(apiPath(`/api/admin/materials/${material.id}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر حذف المادة");
      }
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر حذف المادة");
    }
  };

  const handleReorderMaterial = async (materialId: number, direction: "up" | "down") => {
    const currentIndex = materials.findIndex((material) => material.id === materialId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= materials.length) return;

    const reordered = [...materials];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    const orderedIds = reordered.map((material) => material.id);

    try {
      setReorderLoadingId(materialId);
      const res = await fetch(apiPath("/api/admin/materials/reorder"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "تعذر حفظ ترتيب المواد");
      }
      await loadMaterials();
    } catch (err: any) {
      alert(err?.message || "تعذر حفظ ترتيب المواد");
    } finally {
      setReorderLoadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">إدارة المواد ({materials.length})</h2>
      </div>

      <div className="glass-card p-5 border-primary/20 space-y-3">
        <h3 className="font-bold text-foreground">إضافة مادة جديدة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">اسم المادة</label>
            <input
              value={newMaterialForm.name}
              onChange={(e) => setNewMaterialForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="مثال: الأحياء الصف الثالث الثانوي"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
            <input
              value={newMaterialForm.classification}
              onChange={(e) => setNewMaterialForm((prev) => ({ ...prev, classification: e.target.value }))}
              placeholder="مثال: الأحياء"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="flex justify-start">
          <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm py-2.5 px-5 disabled:opacity-60">
            {creating ? "جاري الإضافة..." : "إضافة المادة"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">سيتم استخدام التصنيف مباشرة في فلترة الكتب واختيارات مادة الكتب والفيديوهات.</p>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
          فشل تحميل المواد: {loadError}
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-white/40">
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">اسم المادة</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">التصنيف</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">تاريخ الإضافة</th>
              <th className="px-5 py-4 font-bold text-muted-foreground text-xs">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/30">
            {materials.map((material, rowIndex) => (
              <tr key={material.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-foreground">{material.name}</td>
                <td className="px-5 py-3.5">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary whitespace-nowrap">{material.classification || material.name}</span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground">
                  {material.createdAt ? new Date(material.createdAt).toLocaleDateString("ar-EG") : "—"}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReorderMaterial(material.id, "up")}
                      disabled={rowIndex === 0 || reorderLoadingId === material.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorderMaterial(material.id, "down")}
                      disabled={rowIndex === materials.length - 1 || reorderLoadingId === material.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(material)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && materials.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">
                  لا توجد مواد حتى الآن
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users = [], refetch } = useListAdminUsers();
  const deleteUser = useDeleteAdminUser();
  const updateUser = useUpdateAdminUser();
  const createUser = useCreateAdminUser();
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "student" });

  const ROLE_COLORS: Record<string, string> = { student: "bg-blue-100 text-blue-700", teacher: "bg-emerald-100 text-emerald-700", parent: "bg-amber-100 text-amber-700", admin: "bg-violet-100 text-violet-700", owner: "bg-rose-100 text-rose-700" };
  const ROLE_LABELS: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">المستخدمون ({users.length})</h2>
        <button onClick={() => setAdding(true)} className="btn-primary text-sm py-2.5 px-5">
          <Plus className="w-4 h-4" /> مستخدم جديد
        </button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold text-foreground">إضافة مستخدم جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[["name","الاسم","نص"],["email","البريد الإلكتروني","بريد"],].map(([k,l,t]) => (
              <div key={k} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input type={t === "بريد" ? "email" : "text"} value={newUser[k as "name"|"email"]} onChange={e => setNewUser(p => ({...p,[k]:e.target.value}))}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">الدور</label>
              <select value={newUser.role} onChange={e => setNewUser(p => ({...p,role:e.target.value}))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {Object.entries(ROLE_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { createUser.mutate({ data: newUser as any }, { onSuccess: () => { refetch(); setAdding(false); setNewUser({name:"",email:"",role:"student"}); }}); }} className="btn-primary text-sm py-2">
              <Check className="w-4 h-4" /> إضافة
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b border-white/40">
              {["الاسم","البريد","الدور","الحالة","إجراءات"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-white/30">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/30 transition-colors">
                  <td className="px-5 py-3.5 font-semibold text-foreground">{u.name}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{u.status === "active" ? "نشط" : "موقوف"}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2">
                      <button onClick={() => updateUser.mutate({ id: u.id, data: { status: u.status === "active" ? "suspended" : "active" } as any }, { onSuccess: () => refetch() })}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">{u.status === "active" ? "تعليق" : "تفعيل"}</button>
                      <button onClick={() => { if(confirm("هل أنت متأكد؟")) deleteUser.mutate({ id: u.id }, { onSuccess: () => refetch() }); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Books Tab ─────────────────────────────────────────────────────────────
function BooksTab() {
  const { data: booksData = [], refetch } = useListAdminBooks();
  const books = Array.isArray(booksData) ? (booksData as any[]) : [];
  const createBook = useCreateAdminBook();
  const updateBook = useUpdateAdminBook();
  const deleteBook = useDeleteAdminBook();
  const [adding, setAdding] = useState(false);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [preview, setPreview] = useState<null | Record<string, string | boolean>>(null);
  const [pending, setPending] = useState<null | Record<string, string | boolean>>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [voucherForm, setVoucherForm] = useState({
    bookId: "",
    code: "",
    discountType: "percent",
    discountValue: "10",
    usageLimit: "",
    expiresAt: "",
    active: true,
  });
  const [newBook, setNewBook] = useState({
    title: "",
    subject: DEFAULT_MATERIAL_OPTIONS[0],
    description: "",
    priceEgp: "250",
    originalPriceEgp: "300",
    freeShipping: false,
    coverUrl: "",
  });
  const set = (k: string, v: string) => setNewBook((p) => ({ ...p, [k]: v }));
  const setVoucher = (k: string, v: string | boolean) => setVoucherForm((p) => ({ ...p, [k]: v }));
  const materialClassifications =
    materials.length > 0
      ? Array.from(
          new Set(
            materials.map((material) => String(material.classification ?? "").trim() || material.name).filter(Boolean),
          ),
        )
      : DEFAULT_MATERIAL_OPTIONS;
  const materialOptions = materialClassifications.includes(newBook.subject)
    ? materialClassifications
    : [newBook.subject, ...materialClassifications];

  const resetBookEditor = () => {
    setEditingBookId(null);
    setPreview(null);
    setPending(null);
    setCoverUploadProgress(null);
    setNewBook({
      title: "",
      subject: materialClassifications[0] ?? DEFAULT_MATERIAL_OPTIONS[0],
      description: "",
      priceEgp: "250",
      originalPriceEgp: "300",
      freeShipping: false,
      coverUrl: "",
    });
  };

  const buildBookPayload = (bookForm: Record<string, string | boolean>) => ({
    title: bookForm.title,
    description: bookForm.description,
    subject: bookForm.subject,
    category: bookForm.subject,
    priceEgp: parseInt(String(bookForm.priceEgp || 0), 10),
    originalPriceEgp: parseInt(String(bookForm.originalPriceEgp || 0), 10),
    pointsPrice: parseInt(String(bookForm.priceEgp || 0), 10),
    freeShipping: Boolean(bookForm.freeShipping),
    coverUrl: bookForm.coverUrl || undefined,
    author: "غير محدد",
  });

  const loadVouchers = async () => {
    try {
      setVoucherLoading(true);
      const res = await fetch(apiPath("/api/admin/book-vouchers"));
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setVouchers(data);
      }
    } catch {
      // no-op
    } finally {
      setVoucherLoading(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await fetch(apiPath("/api/admin/materials"));
      const data = await res.json().catch(() => []);
      if (res.ok && Array.isArray(data)) {
        setMaterials(data);
      }
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    void loadMaterials();
    void loadVouchers();
  }, []);

  useEffect(() => {
    if (!materialOptions.includes(newBook.subject)) {
      setNewBook((prev) => ({ ...prev, subject: materialOptions[0] ?? DEFAULT_MATERIAL_OPTIONS[0] }));
    }
  }, [materialOptions, newBook.subject]);

  useEffect(() => {
    if (!voucherForm.bookId && books.length > 0) {
      setVoucherForm((p) => ({ ...p, bookId: String(books[0].id) }));
    }
  }, [books, voucherForm.bookId]);

  const handleCoverUpload = (file: File) => {
    const fd = new FormData();
    fd.append("cover", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiPath("/api/admin/books/upload-cover"));
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      setCoverUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setCoverUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        set("coverUrl", data.url);
      } else {
        alert("فشل رفع صورة الغلاف");
      }
    };
    xhr.onerror = () => {
      setCoverUploadProgress(null);
      alert("فشل رفع صورة الغلاف");
    };
    xhr.send(fd);
  };

  const handlePreview = () => {
    if (!newBook.title.trim()) {
      alert("عنوان الكتاب مطلوب");
      return;
    }
    setPending({ ...newBook });
    setPreview({ ...newBook });
  };

  const handleConfirm = () => {
    if (!pending) return;
    const payload = buildBookPayload(pending);

    if (editingBookId !== null) {
      updateBook.mutate({ id: editingBookId, data: payload as any }, {
        onSuccess: () => {
          refetch();
          setAdding(false);
          resetBookEditor();
        },
      });
      return;
    }

    createBook.mutate({ data: payload as any }, {
      onSuccess: () => {
        refetch();
        setAdding(false);
        resetBookEditor();
      },
    });
  };

  const handleEditBook = (book: any) => {
    setEditingBookId(book.id);
    setAdding(true);
    setPreview(null);
    setPending(null);
    setCoverUploadProgress(null);
    setNewBook({
      title: book.title ?? "",
      subject: book.subject ?? book.category ?? "علوم",
      description: book.description ?? "",
      priceEgp: String(book.priceEgp ?? book.pointsPrice ?? 0),
      originalPriceEgp: String(book.originalPriceEgp ?? book.priceEgp ?? book.pointsPrice ?? 0),
      freeShipping: Boolean(book.freeShipping),
      coverUrl: book.coverUrl ?? "",
    });
  };

  const handleCreateVoucher = async () => {
    try {
      if (!voucherForm.bookId) {
        alert("اختر الكتاب أولًا");
        return;
      }
      if (!voucherForm.code.trim()) {
        alert("اكتب كود الخصم");
        return;
      }

      const discountType = String(voucherForm.discountType || "percent");
      let discountValue = Number.parseInt(String(voucherForm.discountValue || "0"), 10) || 0;
      if (discountType === "percent") {
        discountValue = Math.max(1, Math.min(100, discountValue));
      } else if (discountType === "amount") {
        discountValue = Math.max(1, discountValue);
      } else {
        discountValue = 0;
      }

      const res = await fetch(apiPath("/api/admin/book-vouchers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: parseInt(voucherForm.bookId, 10),
          code: voucherForm.code,
          discountType,
          discountValue,
          discountPercent: discountType === "percent" ? discountValue : 0,
          usageLimit: voucherForm.usageLimit ? parseInt(voucherForm.usageLimit, 10) : null,
          expiresAt: voucherForm.expiresAt || null,
          active: voucherForm.active,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل إنشاء الكود");
      setVoucherForm({
        bookId: books.length > 0 ? String(books[0].id) : "",
        code: "",
        discountType: "percent",
        discountValue: "10",
        usageLimit: "",
        expiresAt: "",
        active: true,
      });
      await loadVouchers();
    } catch (err: any) {
      alert(err?.message || "فشل إنشاء كود الخصم");
    }
  };

  const handleDeleteVoucher = async (id: number) => {
    if (!confirm("حذف كود الخصم؟")) return;
    await fetch(apiPath(`/api/admin/book-vouchers/${id}`), { method: "DELETE" });
    await loadVouchers();
  };

  const handleReorderBook = async (bookId: number, direction: "up" | "down") => {
    const currentIndex = books.findIndex((book) => book.id === bookId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= books.length) return;

    const reorderedBooks = [...books];
    const temp = reorderedBooks[currentIndex];
    reorderedBooks[currentIndex] = reorderedBooks[targetIndex];
    reorderedBooks[targetIndex] = temp;
    const orderedIds = reorderedBooks.map((book) => book.id);

    try {
      setReorderLoadingId(bookId);
      const res = await fetch(apiPath("/api/admin/books/reorder"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "فشل حفظ ترتيب الكتب");
      await refetch();
    } catch (err: any) {
      alert(err?.message || "فشل ترتيب الكتب");
    } finally {
      setReorderLoadingId(null);
    }
  };

  const discountLabel = voucherForm.discountType === "amount" ? "الخصم (ج.م)" : voucherForm.discountType === "free_shipping" ? "نوع الخصم" : "الخصم (%)";

  const formatVoucherDiscount = (voucher: any) => {
    const type = String(voucher.discountType ?? "percent");
    const percentFallback = Number(voucher.discountPercent ?? 0);
    const rawValue = Number(voucher.discountValue ?? 0);
    const value = type === "percent" && rawValue <= 0 ? percentFallback : rawValue;
    if (type === "amount") return `${value.toLocaleString("ar-EG")} ج.م`;
    if (type === "free_shipping") return "شحن مجاني";
    return `${value}%`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">الكتب ({books.length})</h2>
        <button
          onClick={() => {
            if (adding) {
              setAdding(false);
              resetBookEditor();
              return;
            }
            resetBookEditor();
            setAdding(true);
          }}
          className="btn-primary text-sm py-2.5 px-5"
        >
          <Plus className="w-4 h-4" /> {adding ? "إغلاق النموذج" : "إضافة كتاب"}
        </button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">{editingBookId !== null ? "تعديل كتاب منشور" : "إضافة كتاب جديد"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان الكتاب"],["description","الوصف"],["priceEgp","سعر البيع (ج.م)"],["originalPriceEgp","السعر قبل الخصم (ج.م)"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k==="description"?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={String(newBook[k as keyof typeof newBook] ?? "")} onChange={e => set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">المادة</label>
              <select value={newBook.subject} onChange={e => set("subject",e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {materialOptions.map((materialName) => <option key={materialName} value={materialName}>{materialName}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">صورة الغلاف</label>
              <label className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 cursor-pointer hover:bg-white transition-all">
                <div className="flex items-center gap-2 text-sm">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span>{newBook.coverUrl ? "تم رفع صورة الغلاف" : "اختر صورة الغلاف"}</span>
                </div>
                {newBook.coverUrl && <img src={newBook.coverUrl} alt="cover" className="w-10 h-14 object-cover rounded-md border border-white/70" />}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCoverUpload(file);
                  }}
                />
              </label>
              {coverUploadProgress !== null && (
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${coverUploadProgress}%` }} />
                </div>
              )}
            </div>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={newBook.freeShipping}
                onChange={e => setNewBook(p => ({ ...p, freeShipping: e.target.checked }))}
                className="w-4 h-4 rounded border-border"
              />
              تفعيل الشحن المجاني لهذا الكتاب
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePreview} className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-amber-400/20 text-amber-700 border border-amber-200/50 font-semibold text-sm hover:bg-amber-400/30 transition-all">
              <Eye className="w-4 h-4" /> {editingBookId !== null ? "معاينة التعديلات" : "معاينة قبل النشر"}
            </button>
            {editingBookId !== null && (
              <button
                onClick={() => resetBookEditor()}
                className="px-4 py-2 rounded-xl border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/5 transition-all"
              >
                بدء إضافة كتاب جديد
              </button>
            )}
            <button
              onClick={() => {
                setAdding(false);
                resetBookEditor();
              }}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewModal
          title="معاينة الكتاب"
          content={
            <div className="flex gap-4">
              {preview.coverUrl ? (
                <img src={String(preview.coverUrl)} alt="preview" className="w-20 h-28 rounded-xl object-cover border border-white/70 flex-shrink-0" />
              ) : (
                <div className="w-20 h-28 rounded-xl bg-gradient-to-br from-indigo-100 to-primary/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-8 h-8 text-primary/40" />
                </div>
              )}
              <div>
                <h3 className="font-bold text-xl text-foreground mb-1">{preview.title}</h3>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-bold">{preview.subject}</span>
                <p className="text-sm text-foreground mt-2">{preview.description}</p>
                <p className="text-muted-foreground line-through text-xs mt-2">{preview.originalPriceEgp} ج.م</p>
                <p className="text-amber-500 font-bold">{preview.priceEgp} ج.م</p>
                {Boolean(preview.freeShipping) && <p className="text-emerald-600 text-xs font-bold mt-1 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> شحن مجاني</p>}
              </div>
            </div>
          }
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b border-white/40">
            {["العنوان","المادة","سعر البيع","قبل الخصم","شحن مجاني","إجراءات"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {books.map((b, rowIndex) => (
              <tr key={b.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-foreground">
                  <div className="flex items-center gap-2">
                    {b.coverUrl ? <img src={b.coverUrl} alt={b.title} className="w-8 h-10 rounded object-cover border border-white/70" /> : null}
                    <span>{b.title}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex max-w-[260px] px-2.5 py-1 rounded-2xl text-xs font-bold bg-primary/10 text-primary leading-relaxed whitespace-normal break-words"
                    title={b.subject || b.category}
                  >
                    {b.subject || b.category}
                  </span>
                </td>
                <td className="px-5 py-3.5 font-bold text-amber-600">{(b.priceEgp ?? b.pointsPrice ?? 0).toLocaleString("ar-EG")} ج.م</td>
                <td className="px-5 py-3.5 text-muted-foreground">{(b.originalPriceEgp ?? b.priceEgp ?? b.pointsPrice ?? 0).toLocaleString("ar-EG")} ج.م</td>
                <td className="px-5 py-3.5">{b.freeShipping ? <span className="text-emerald-600 font-bold text-xs">مفعل</span> : <span className="text-muted-foreground text-xs">غير مفعل</span>}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReorderBook(b.id, "up")}
                      disabled={rowIndex === 0 || reorderLoadingId === b.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleReorderBook(b.id, "down")}
                      disabled={rowIndex === books.length - 1 || reorderLoadingId === b.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditBook(b)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all inline-flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      تعديل
                    </button>
                    <button onClick={() => { if(confirm("حذف الكتاب؟")) deleteBook.mutate({ id: b.id }, { onSuccess: () => refetch() }); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-card p-5 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><TicketPercent className="w-5 h-5 text-primary" /> أكواد الخصم (Voucher)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الكتاب المستهدف</label>
            <select
              value={voucherForm.bookId}
              onChange={e => setVoucher("bookId", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            >
              {books.length === 0 && <option value="">لا توجد كتب</option>}
              {books.map((b) => (
                <option key={b.id} value={String(b.id)}>{b.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الكود</label>
            <input value={voucherForm.code} onChange={e => setVoucher("code", e.target.value)}
              placeholder="SAVE20"
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">نوع الخصم</label>
            <select
              value={voucherForm.discountType}
              onChange={e => setVoucher("discountType", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
            >
              <option value="percent">نسبة مئوية</option>
              <option value="amount">مبلغ ثابت</option>
              <option value="free_shipping">شحن مجاني</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{discountLabel}</label>
            <input
              value={voucherForm.discountType === "free_shipping" ? "" : voucherForm.discountValue}
              onChange={e => setVoucher("discountValue", e.target.value)}
              disabled={voucherForm.discountType === "free_shipping"}
              placeholder={voucherForm.discountType === "amount" ? "مثال: 50" : voucherForm.discountType === "percent" ? "مثال: 20" : "لا يحتاج قيمة"}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">حد الاستخدام (اختياري)</label>
            <input value={voucherForm.usageLimit} onChange={e => setVoucher("usageLimit", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">تاريخ الانتهاء (اختياري)</label>
            <input type="datetime-local" value={voucherForm.expiresAt} onChange={e => setVoucher("expiresAt", e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="flex items-end gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground pb-2">
              <input type="checkbox" checked={voucherForm.active} onChange={e => setVoucher("active", e.target.checked)} />
              مفعل
            </label>
            <button onClick={handleCreateVoucher} className="btn-primary text-sm py-2.5 px-4" disabled={books.length === 0}>إضافة الكود</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/50">
          <table className="w-full text-sm text-right">
            <thead className="bg-white/50">
              <tr>
                {["الكود","الكتاب","الخصم","الاستخدام","ينتهي","الحالة","إجراء"].map(h => <th key={h} className="px-4 py-3 text-xs font-bold text-muted-foreground">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {vouchers.map((v) => (
                <tr key={v.id} className="hover:bg-white/30">
                  <td className="px-4 py-3 font-bold text-foreground">{v.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.bookTitle || `#${v.bookId ?? "-"}`}</td>
                  <td className="px-4 py-3 text-primary font-bold">{formatVoucherDiscount(v)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.usedCount}/{v.usageLimit ?? "∞"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.expiresAt ? new Date(v.expiresAt).toLocaleString("ar-EG") : "غير محدد"}</td>
                  <td className="px-4 py-3">{v.active ? <span className="text-emerald-600 text-xs font-bold">مفعل</span> : <span className="text-rose-600 text-xs font-bold">متوقف</span>}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDeleteVoucher(v.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                  </td>
                </tr>
              ))}
              {!voucherLoading && vouchers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground text-sm">لا توجد أكواد خصم حتى الآن</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Posts Tab ─────────────────────────────────────────────────────────────
function PostsTab() {
  const { data: posts = [], refetch } = useListModeratorPosts();
  const deletePost = useDeleteModeratorPost();
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">إدارة المنشورات ({posts.length})</h2>
      <div className="space-y-3">
        {posts.map(p => (
          <div key={p.id} className="glass-card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {p.authorName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-foreground">{p.authorName}</span>
                <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("ar-EG")}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{p.content}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{p.likesCount} إعجاب</span>
                <span>{p.commentsCount} تعليق</span>
              </div>
            </div>
            <button onClick={() => { if(confirm("حذف المنشور؟")) deletePost.mutate({ id: p.id }, { onSuccess: () => refetch() }); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all flex-shrink-0">حذف</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────
function ReportsTab() {
  const { data: reports = [], refetch } = useListAdminReports();
  const resolveReport = useResolveAdminReport();
  const STATUS_COLORS: Record<string, string> = { pending: "bg-amber-100 text-amber-700", resolved: "bg-emerald-100 text-emerald-700", dismissed: "bg-gray-100 text-gray-600", escalated: "bg-red-100 text-red-700" };
  const STATUS_LABELS: Record<string, string> = { pending: "قيد الانتظار", resolved: "تم الحل", dismissed: "مرفوض", escalated: "مُصعَّد" };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">التقارير ({reports.length})</h2>
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b border-white/40">
            {["النوع","السبب","الحالة","تاريخ الإبلاغ","إجراء"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {reports.map(r => (
              <tr key={r.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold">{r.targetType}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{r.reason}</td>
                <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[r.status]||""}`}>{STATUS_LABELS[r.status]||r.status}</span></td>
                <td className="px-5 py-3.5 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</td>
                <td className="px-5 py-3.5">
                  {r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={() => resolveReport.mutate({ id: r.id, data: { status: "resolved", resolvedBy: "admin" } }, { onSuccess: () => refetch() })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all">حل</button>
                      <button onClick={() => resolveReport.mutate({ id: r.id, data: { status: "dismissed", resolvedBy: "admin" } }, { onSuccess: () => refetch() })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">رفض</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Banners Tab ───────────────────────────────────────────────────────────
function BannersTab() {
  const { data: banners = [], refetch } = useListAdminBanners();
  const createBanner = useCreateAdminBanner();
  const deleteBanner = useDeleteAdminBanner();
  const updateBanner = useUpdateAdminBanner();
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<null|Record<string,string>>(null);
  const [pending, setPending] = useState<null|Record<string,string>>(null);
  const [form, setForm] = useState({ title: "", description: "", linkUrl: "" });
  const set = (k:string,v:string) => setForm(p=>({...p,[k]:v}));

  const handleConfirm = () => {
    if(!pending) return;
    createBanner.mutate({ data: { ...pending, active: true } as any }, {
      onSuccess: () => { refetch(); setAdding(false); setPreview(null); setPending(null); setForm({title:"",description:"",linkUrl:""}); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">البنرات والإعلانات ({banners.length})</h2>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-sm py-2.5 px-5"><Plus className="w-4 h-4" /> إضافة بنر</button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">إضافة بنر جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان البنر"],["description","الوصف"],["linkUrl","رابط الوجهة"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k==="description"?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={form[k as keyof typeof form]} onChange={e=>set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPending({...form}); setPreview({...form}); }}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-amber-400/20 text-amber-700 border border-amber-200/50 font-semibold text-sm hover:bg-amber-400/30 transition-all">
              <Eye className="w-4 h-4" /> معاينة قبل النشر
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewModal
          title="معاينة البنر"
          content={
            <div className="w-full h-24 rounded-2xl bg-gradient-to-r from-primary to-blue-600 flex items-center justify-center text-white p-5">
              <div className="text-center">
                <p className="font-display font-black text-xl">{preview.title}</p>
                <p className="text-sm text-white/80 mt-1">{preview.description}</p>
              </div>
            </div>
          }
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {banners.map(b => (
          <div key={b.id} className={`glass-card p-5 flex items-start gap-4 ${!b.active?"opacity-50":""}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-foreground">{b.title}</h3>
                {!b.active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">غير نشط</span>}
              </div>
              <p className="text-sm text-muted-foreground">{b.description}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => updateBanner.mutate({ id: b.id, data: { active: !b.active } as any }, { onSuccess: () => refetch() })}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">{b.active?"إيقاف":"تفعيل"}</button>
              <button onClick={() => { if(confirm("حذف البنر؟")) deleteBanner.mutate({ id: b.id }, { onSuccess: () => refetch() }); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscriptionRequestsTab({ token }: { token: string | null }) {
  const [requests, setRequests] = useState<SubscriptionRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const loadRequests = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(apiPath("/api/admin/subscription-requests"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحميل طلبات الاشتراك");
      }
      if (!Array.isArray(data)) {
        throw new Error("استجابة غير متوقعة من الخادم");
      }
      setRequests(data);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل طلبات الاشتراك");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [token]);

  const handleReview = async (requestId: number, status: "approved" | "rejected") => {
    if (!token) return;

    let reviewNotes = "";
    if (status === "rejected") {
      reviewNotes = prompt("سبب الرفض (اختياري):")?.trim() ?? "";
    }

    try {
      setProcessingId(requestId);
      const res = await fetch(apiPath(`/api/admin/subscription-requests/${requestId}/status`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reviewNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any)?.error || "تعذر تحديث حالة الطلب");
      }
      await loadRequests();
    } catch (err: any) {
      alert(err?.message || "تعذر تحديث حالة الطلب");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">طلبات الاشتراك ({requests.length})</h2>
        <button onClick={() => void loadRequests()} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-all">
          تحديث
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-medium">
          {error}
        </div>
      ) : null}

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-white/40">
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">الطالب</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">السنة / المادة</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">الكود</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">الصورة</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">الحالة</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">التاريخ</th>
              <th className="px-4 py-3 font-bold text-muted-foreground text-xs">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/30">
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-white/30 transition-colors align-top">
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-foreground">{request.student.name}</p>
                  <p className="text-xs text-muted-foreground">{request.student.email}</p>
                  {request.student.phone ? <p className="text-xs text-muted-foreground">{request.student.phone}</p> : null}
                </td>
                <td className="px-4 py-3.5">
                  <p className="font-semibold text-foreground">{request.year.name}</p>
                  <p className="text-xs text-muted-foreground">{request.subject.name}</p>
                </td>
                <td className="px-4 py-3.5 font-mono text-xs">{request.code}</td>
                <td className="px-4 py-3.5">
                  {request.codeImageUrl ? (
                    <a
                      href={apiPath(request.codeImageUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all inline-flex"
                    >
                      فتح الصورة
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">لا توجد صورة</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      request.status === "approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : request.status === "rejected"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {request.status === "approved" ? "مقبول" : request.status === "rejected" ? "مرفوض" : "قيد المراجعة"}
                  </span>
                  {request.reviewNotes ? <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">{request.reviewNotes}</p> : null}
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(request.submittedAt).toLocaleString("ar-EG")}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-2 min-w-[120px]">
                    <button
                      onClick={() => void handleReview(request.id, "approved")}
                      disabled={processingId === request.id || request.status === "approved"}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all disabled:opacity-50"
                    >
                      اعتماد
                    </button>
                    <button
                      onClick={() => void handleReview(request.id, "rejected")}
                      disabled={processingId === request.id || request.status === "rejected"}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 hover:bg-rose-200 transition-all disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && requests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-7 text-center text-muted-foreground text-sm">
                  لا توجد طلبات اشتراك حالياً
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Admin Panel ──────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, token, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    setLocation("/admin-login");
    return null;
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab onOpenMaterials={() => setTab("materials")} />,
    users: <UsersTab />,
    academic: <AcademicTab />,
    subscriptionRequests: <SubscriptionRequestsTab token={token} />,
    materials: <MaterialsTab />,
    books: <BooksTab />,
    posts: <PostsTab />,
    reports: <ReportsTab />,
    banners: <BannersTab />,
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="mesh-bg" />

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-0 right-0 h-screen w-64 z-40 glass-panel border-l border-white/60">
        <div className="px-6 pt-7 pb-5">
          <Logo size={36} />
          <div className="mt-3 inline-flex items-center gap-1.5 bg-violet-100 text-violet-700 border border-violet-200/60 rounded-full px-3 py-1 text-xs font-bold">
            <Crown className="w-3.5 h-3.5" />
            لوحة تحكم المشرف
          </div>
        </div>
        <div className="mx-5 h-px bg-gradient-to-l from-transparent via-border to-transparent mb-3" />
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto hide-scrollbar">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${tab === t.id ? "bg-primary text-white shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-white/60 hover:text-foreground"}`}>
              <t.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/40">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-muted-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex gap-2">
            {user.role === "owner" && (
              <button onClick={() => setLocation("/owner")} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 transition-all">
                <Crown className="w-3.5 h-3.5" /> لوحة المالك
              </button>
            )}
            <button onClick={() => { logout(); setLocation("/"); }}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-all">
              <LogOut className="w-3.5 h-3.5" /> خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:mr-64 p-5 md:p-8 max-w-full overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {TAB_CONTENT[tab]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
