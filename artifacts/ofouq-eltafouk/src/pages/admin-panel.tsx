import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, Users, BookOpen, Video, MessageSquare, 
  Flag, Megaphone, Plus, Edit, Trash2, Eye, Check, X, 
  TrendingUp, Coins, Award, FileText, LogOut, Crown, GraduationCap
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import {
  useGetAdminStats, useListAdminUsers, useDeleteAdminUser, useUpdateAdminUser, useCreateAdminUser,
  useListAdminBooks, useCreateAdminBook, useUpdateAdminBook, useDeleteAdminBook,
  useListAdminVideos, useCreateAdminVideo, useUpdateAdminVideo, useDeleteAdminVideo,
  useListModeratorPosts, useDeleteModeratorPost,
  useListAdminReports, useResolveAdminReport,
  useListAdminBanners, useCreateAdminBanner, useUpdateAdminBanner, useDeleteAdminBanner,
} from "@workspace/api-client-react";
import { Logo } from "@/components/logo";
import { AcademicTab } from "./admin-academic";

type Tab = "dashboard" | "users" | "books" | "videos" | "posts" | "reports" | "banners" | "academic";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "users", label: "المستخدمون", icon: Users },
  { id: "academic", label: "المحتوى الأكاديمي", icon: GraduationCap },
  { id: "books", label: "الكتب", icon: BookOpen },
  { id: "videos", label: "الفيديوهات", icon: Video },
  { id: "posts", label: "المنشورات", icon: MessageSquare },
  { id: "reports", label: "التقارير", icon: Flag },
  { id: "banners", label: "البنرات", icon: Megaphone },
];

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
function DashboardTab() {
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
  const { data: books = [], refetch } = useListAdminBooks();
  const createBook = useCreateAdminBook();
  const updateBook = useUpdateAdminBook();
  const deleteBook = useDeleteAdminBook();
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<null | Record<string, string>>(null);
  const [pending, setPending] = useState<null | Record<string, string>>(null);
  const [newBook, setNewBook] = useState({ title: "", author: "", category: "علوم", description: "", pointsPrice: "100", pages: "100" });
  const set = (k: string, v: string) => setNewBook(p => ({ ...p, [k]: v }));

  const handlePreview = () => { setPending({ ...newBook }); setPreview({ ...newBook }); };
  const handleConfirm = () => {
    if (!pending) return;
    createBook.mutate({ data: { ...pending, pointsPrice: parseInt(pending.pointsPrice), pages: parseInt(pending.pages) } as any }, {
      onSuccess: () => { refetch(); setAdding(false); setPreview(null); setPending(null); setNewBook({ title: "", author: "", category: "علوم", description: "", pointsPrice: "100", pages: "100" }); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">الكتب ({books.length})</h2>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-sm py-2.5 px-5"><Plus className="w-4 h-4" /> إضافة كتاب</button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">إضافة كتاب جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان الكتاب"],["author","المؤلف"],["description","الوصف"],["pointsPrice","السعر (نقاط)"],["pages","عدد الصفحات"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k==="description"?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={newBook[k as keyof typeof newBook]} onChange={e => set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">التصنيف</label>
              <select value={newBook.category} onChange={e => set("category",e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {["علوم","رياضيات","لغات","تاريخ","برمجة"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePreview} className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-amber-400/20 text-amber-700 border border-amber-200/50 font-semibold text-sm hover:bg-amber-400/30 transition-all">
              <Eye className="w-4 h-4" /> معاينة قبل النشر
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}
      {preview && (
        <PreviewModal
          title="معاينة الكتاب"
          content={
            <div className="flex gap-4">
              <div className="w-20 h-28 rounded-xl bg-gradient-to-br from-indigo-100 to-primary/20 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-8 h-8 text-primary/40" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-foreground mb-1">{preview.title}</h3>
                <p className="text-muted-foreground text-sm mb-2">{preview.author}</p>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-bold">{preview.category}</span>
                <p className="text-sm text-foreground mt-2">{preview.description}</p>
                <p className="text-amber-500 font-bold mt-2">{preview.pointsPrice} نقطة</p>
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
            {["العنوان","المؤلف","التصنيف","السعر","إجراءات"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {books.map(b => (
              <tr key={b.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-foreground">{b.title}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{b.author}</td>
                <td className="px-5 py-3.5"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">{b.category}</span></td>
                <td className="px-5 py-3.5 font-bold text-amber-500">{b.pointsPrice}</td>
                <td className="px-5 py-3.5">
                  <button onClick={() => { if(confirm("حذف الكتاب؟")) deleteBook.mutate({ id: b.id }, { onSuccess: () => refetch() }); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Videos Tab ────────────────────────────────────────────────────────────
function VideosTab() {
  const { data: videos = [], refetch } = useListAdminVideos();
  const createVideo = useCreateAdminVideo();
  const deleteVideo = useDeleteAdminVideo();
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<null | Record<string, string>>(null);
  const [pending, setPending] = useState<null | Record<string, string>>(null);
  const [form, setForm] = useState({ title: "", instructor: "", subject: "علوم", duration: "30", videoUrl: "", description: "" });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleConfirm = () => {
    if (!pending) return;
    createVideo.mutate({ data: { ...pending, duration: parseInt(pending.duration) } as any }, {
      onSuccess: () => { refetch(); setAdding(false); setPreview(null); setPending(null); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">الفيديوهات ({videos.length})</h2>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-sm py-2.5 px-5"><Plus className="w-4 h-4" /> إضافة فيديو</button>
      </div>
      {adding && (
        <div className="glass-card p-5 space-y-4 border-primary/20">
          <h3 className="font-bold">إضافة فيديو جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["title","عنوان الفيديو"],["instructor","المعلم"],["duration","المدة (دقيقة)"],["videoUrl","رابط الفيديو"],["description","الوصف"]].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${["videoUrl","description"].includes(k)?"sm:col-span-2":""}`}>
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input value={form[k as keyof typeof form]} onChange={e => set(k,e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">المادة</label>
              <select value={form.subject} onChange={e => set("subject",e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                {["علوم","رياضيات","لغة عربية","لغة إنجليزية","تاريخ","برمجة"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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
          title="معاينة الفيديو"
          content={
            <div className="space-y-3">
              <div className="w-full h-32 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center">
                <Video className="w-12 h-12 text-sky-400" />
              </div>
              <h3 className="font-bold text-lg text-foreground">{preview.title}</h3>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs bg-primary text-white px-2 py-1 rounded-full font-bold">{preview.subject}</span>
                <span className="text-xs text-muted-foreground">{preview.instructor} • {preview.duration} دقيقة</span>
              </div>
              <p className="text-sm text-muted-foreground">{preview.description}</p>
            </div>
          }
          onConfirm={handleConfirm}
          onCancel={() => setPreview(null)}
        />
      )}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b border-white/40">
            {["العنوان","المعلم","المادة","المدة","إجراءات"].map(h => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-white/30">
            {videos.map(v => (
              <tr key={v.id} className="hover:bg-white/30 transition-colors">
                <td className="px-5 py-3.5 font-semibold">{v.title}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{v.instructor}</td>
                <td className="px-5 py-3.5"><span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{v.subject}</span></td>
                <td className="px-5 py-3.5 text-muted-foreground">{v.duration} د</td>
                <td className="px-5 py-3.5">
                  <button onClick={() => { if(confirm("حذف الفيديو؟")) deleteVideo.mutate({ id: v.id }, { onSuccess: () => refetch() }); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

// ── Main Admin Panel ──────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    setLocation("/admin-login");
    return null;
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab />,
    users: <UsersTab />,
    academic: <AcademicTab />,
    books: <BooksTab />,
    videos: <VideosTab />,
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
