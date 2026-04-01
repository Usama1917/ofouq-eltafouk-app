import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Users, BookOpen, Video, MessageSquare,
  Flag, Megaphone, Crown, ShieldCheck, TrendingUp, BarChart3,
  Plus, Trash2, Edit, LogOut, UserCheck, Globe
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import {
  useGetAdminStats,
  useListAdminUsers, useUpdateAdminUser, useDeleteAdminUser, useCreateAdminUser,
} from "@workspace/api-client-react";
import { Logo } from "@/components/logo";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "analytics" | "admins" | "users" | "advanced";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "analytics", label: "الإحصائيات", icon: BarChart3 },
  { id: "admins", label: "إدارة المشرفين", icon: ShieldCheck },
  { id: "users", label: "جميع المستخدمين", icon: Users },
  { id: "advanced", label: "تقارير متقدمة", icon: TrendingUp },
];

// ── Recharts Colors ───────────────────────────────────────────────────────
const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];

// ── Demo analytics data ───────────────────────────────────────────────────
const userTrend = [
  { month: "يناير", طلاب: 120, معلمون: 18, أولياء: 34 },
  { month: "فبراير", طلاب: 180, معلمون: 24, أولياء: 52 },
  { month: "مارس", طلاب: 245, معلمون: 29, أولياء: 71 },
  { month: "أبريل", طلاب: 312, معلمون: 35, أولياء: 98 },
  { month: "مايو", طلاب: 398, معلمون: 41, أولياء: 120 },
  { month: "يونيو", طلاب: 476, معلمون: 48, أولياء: 145 },
];

const governorateData = [
  { name: "القاهرة", users: 284 },
  { name: "الإسكندرية", users: 198 },
  { name: "الجيزة", users: 167 },
  { name: "الشرقية", users: 134 },
  { name: "الدقهلية", users: 112 },
  { name: "أخرى", users: 215 },
];

const contentPerformance = [
  { name: "الكتب الأعلى مبيعاً", value: 342 },
  { name: "أكثر الفيديوهات مشاهدة", value: 891 },
  { name: "أكثر الألعاب تفاعلاً", value: 567 },
  { name: "أكثر المكافآت استبدالاً", value: 234 },
];

const pointsFlow = [
  { week: "أسبوع 1", مكتسبة: 4500, مستخدمة: 1200 },
  { week: "أسبوع 2", مكتسبة: 5200, مستخدمة: 1800 },
  { week: "أسبوع 3", مكتسبة: 6100, مستخدمة: 2100 },
  { week: "أسبوع 4", مكتسبة: 7300, مستخدمة: 2900 },
];

// ── Custom Tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-white/60 p-3 text-sm" dir="rtl">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value.toLocaleString("ar-EG")}
        </p>
      ))}
    </div>
  );
};

// ── Analytics Tab ─────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { data: stats } = useGetAdminStats();

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المستخدمين", value: stats?.totalUsers ?? 1110, icon: Users, color: "text-primary", bg: "from-blue-50 to-indigo-50" },
          { label: "إجمالي الكتب", value: stats?.totalBooks ?? 48, icon: BookOpen, color: "text-violet-600", bg: "from-violet-50 to-purple-50" },
          { label: "الفيديوهات", value: stats?.totalVideos ?? 134, icon: Video, color: "text-sky-600", bg: "from-sky-50 to-cyan-50" },
          { label: "نقاط متداولة", value: stats?.totalPointsCirculating ?? 284500, icon: Crown, color: "text-amber-600", bg: "from-amber-50 to-orange-50" },
        ].map(s => (
          <div key={s.label} className={`glass-card p-5 bg-gradient-to-br ${s.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
            </div>
            <p className={`font-display font-black text-3xl ${s.color}`}>{s.value.toLocaleString("ar-EG")}</p>
          </div>
        ))}
      </div>

      {/* User growth chart */}
      <div className="glass-card p-6">
        <h3 className="font-display font-bold text-lg text-foreground mb-5 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          نمو المستخدمين حسب الشهر
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={userTrend}>
            <defs>
              {[["colorStudent","#3B82F6"], ["colorTeacher","#10B981"], ["colorParent","#F59E0B"]].map(([id, color]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: "Cairo" }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 13 }} />
            <Area type="monotone" dataKey="طلاب" stroke="#3B82F6" fill="url(#colorStudent)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="معلمون" stroke="#10B981" fill="url(#colorTeacher)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="أولياء" stroke="#F59E0B" fill="url(#colorParent)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Geographic */}
        <div className="glass-card p-6">
          <h3 className="font-display font-bold text-lg text-foreground mb-5 flex items-center gap-2">
            <Globe className="w-5 h-5 text-sky-500" />
            التوزيع الجغرافي (أعلى 6 محافظات)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={governorateData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fontFamily: "Cairo" }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="users" name="المستخدمون" radius={[0, 6, 6, 0]}>
                {governorateData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Points flow */}
        <div className="glass-card p-6">
          <h3 className="font-display font-bold text-lg text-foreground mb-5 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            تدفق النقاط الأسبوعي
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pointsFlow}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12, fontFamily: "Cairo" }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 13 }} />
              <Bar dataKey="مكتسبة" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="مستخدمة" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Content performance pie */}
      <div className="glass-card p-6">
        <h3 className="font-display font-bold text-lg text-foreground mb-5 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-500" />
          أداء المحتوى
        </h3>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ResponsiveContainer width={220} height={220}>
            <PieChart>
              <Pie data={contentPerformance} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55}>
                {contentPerformance.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3 flex-1">
            {contentPerformance.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between p-3 rounded-xl bg-white/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                  <span className="text-sm font-semibold text-foreground">{d.name}</span>
                </div>
                <span className="font-bold text-sm" style={{ color: COLORS[i] }}>{d.value.toLocaleString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admins Tab ────────────────────────────────────────────────────────────
function AdminsTab() {
  const { data: allUsers = [], refetch } = useListAdminUsers();
  const admins = allUsers.filter((u) => (u.role as unknown as string) === "admin" || (u.role as unknown as string) === "owner");
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const createUser = useCreateAdminUser();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">إدارة المشرفين ({admins.length})</h2>
        <button onClick={() => setAdding(true)} className="btn-primary text-sm py-2.5 px-5">
          <Plus className="w-4 h-4" /> إضافة مشرف
        </button>
      </div>

      {adding && (
        <div className="glass-card p-5 space-y-4 border-amber-200/40">
          <h3 className="font-bold text-foreground">إضافة مشرف / مالك جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["name","الاسم الكامل"],["email","البريد الإلكتروني"],["password","كلمة المرور"]].map(([k,l]) => (
              <div key={k} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{l}</label>
                <input type={k === "password" ? "password" : "text"} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">الدور</label>
              <select value={form.role} onChange={e => set("role", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                <option value="admin">مشرف</option>
                <option value="owner">مالك</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { createUser.mutate({ data: form as any }, { onSuccess: () => { refetch(); setAdding(false); setForm({ name:"", email:"", password:"", role:"admin" }); } }); }}
              className="btn-primary text-sm py-2">إضافة</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {admins.map((u) => {
          const isOwner = (u.role as unknown as string) === "owner";
          return (
          <div key={u.id} className="glass-card p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-display font-black text-lg flex-shrink-0 ${isOwner ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-violet-500 to-purple-600"}`}>
              {u.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground">{u.name}</p>
              <p className="text-sm text-muted-foreground">{u.email}</p>
              <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${isOwner ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                {isOwner ? "مالك" : "مشرف"}
              </span>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              {!isOwner && (
                <button onClick={() => updateUser.mutate({ id: u.id, data: { role: "owner" } as any }, { onSuccess: () => refetch() })}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">ترقية لمالك</button>
              )}
              <button onClick={() => { if(confirm(`إزالة ${u.name} من المشرفين؟`)) updateUser.mutate({ id: u.id, data: { role: "student" } as any }, { onSuccess: () => refetch() }); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">إزالة الصلاحيات</button>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

// ── All Users Tab ─────────────────────────────────────────────────────────
function AllUsersTab() {
  const { data: users = [], refetch } = useListAdminUsers();
  const updateUser = useUpdateAdminUser();
  const [filter, setFilter] = useState("all");

  const ROLE_LABELS: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك" };
  const ROLE_COLORS: Record<string, string> = { student: "bg-blue-100 text-blue-700", teacher: "bg-emerald-100 text-emerald-700", parent: "bg-amber-100 text-amber-700", admin: "bg-violet-100 text-violet-700", owner: "bg-rose-100 text-rose-700" };

  const filtered = filter === "all" ? users : users.filter(u => u.role === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-display font-bold">جميع المستخدمين ({filtered.length})</h2>
        <div className="flex gap-2 flex-wrap">
          {[["all","الكل"],["student","طلاب"],["teacher","معلمون"],["parent","أولياء"],["admin","مشرفون"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${filter === v ? "bg-primary text-white shadow-md" : "bg-white/60 border border-white/70 text-muted-foreground hover:text-foreground"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b border-white/40">
              {["الاسم","البريد","الدور","الحالة","المحافظة","إجراءات"].map(h => (
                <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/30">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-white/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold ${ROLE_COLORS[u.role]?.replace("bg-","bg-gradient-to-br from-").replace(" text-","") || "bg-gray-400"}`}>
                        {u.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{u.status === "active" ? "نشط" : "موقوف"}</span>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{(u as any).governorate || "—"}</td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => updateUser.mutate({ id: u.id, data: { status: u.status === "active" ? "suspended" : "active" } as any }, { onSuccess: () => refetch() })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">
                      {u.status === "active" ? "تعليق" : "تفعيل"}
                    </button>
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

// ── Advanced Reports Tab ──────────────────────────────────────────────────
function AdvancedTab() {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">التقارير المتقدمة</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "معدل الاحتفاظ بالمستخدمين", value: "78%", sub: "مقارنة بالشهر الماضي", change: "+12%", positive: true },
          { label: "متوسط جلسات الطالب يومياً", value: "4.2", sub: "جلسة في اليوم", change: "+0.8", positive: true },
          { label: "معدل استبدال النقاط", value: "34%", sub: "من إجمالي النقاط المكتسبة", change: "-2%", positive: false },
        ].map(s => (
          <div key={s.label} className="glass-card p-5">
            <p className="text-xs font-bold text-muted-foreground mb-2">{s.label}</p>
            <p className="font-display font-black text-4xl text-foreground">{s.value}</p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">{s.sub}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{s.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Book sales vs video views */}
      <div className="glass-card p-6">
        <h3 className="font-display font-bold text-lg text-foreground mb-5">مقارنة أداء المحتوى (آخر 6 أشهر)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={userTrend}>
            <defs>
              <linearGradient id="gradBooks" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradVideos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: "Cairo" }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 13 }} />
            <Area type="monotone" dataKey="طلاب" name="مبيعات الكتب" stroke="#8B5CF6" fill="url(#gradBooks)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="أولياء" name="مشاهدات الفيديو" stroke="#06B6D4" fill="url(#gradVideos)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top content items */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="font-display font-bold text-lg text-foreground">أفضل المحتوى أداءً</h3>
        <div className="space-y-3">
          {[
            { rank: 1, title: "مقدمة في الجبر الخطي", type: "كتاب", value: "284 مبيعة", color: "text-primary" },
            { rank: 2, title: "شرح الفيزياء للثانوية", type: "فيديو", value: "1,240 مشاهدة", color: "text-sky-600" },
            { rank: 3, title: "مسابقة الرياضيات الكبرى", type: "مسابقة", value: "892 مشارك", color: "text-emerald-600" },
            { rank: 4, title: "كيمياء السنة الأولى ثانوي", type: "كتاب", value: "167 مبيعة", color: "text-primary" },
            { rank: 5, title: "تعلم البرمجة بالعربي", type: "فيديو", value: "743 مشاهدة", color: "text-sky-600" },
          ].map(item => (
            <div key={item.rank} className="flex items-center gap-4 p-3.5 rounded-2xl hover:bg-white/40 transition-colors">
              <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-black text-muted-foreground flex-shrink-0">{item.rank}</span>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">{item.title}</p>
                <span className="text-xs text-muted-foreground">{item.type}</span>
              </div>
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Owner Panel ──────────────────────────────────────────────────────
export default function OwnerPanel() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("analytics");

  if (!user || user.role !== "owner") {
    setLocation("/owner-login");
    return null;
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    analytics: <AnalyticsTab />,
    admins: <AdminsTab />,
    users: <AllUsersTab />,
    advanced: <AdvancedTab />,
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      <div className="mesh-bg" />

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-0 right-0 h-screen w-64 z-40 glass-panel border-l border-white/60"
        style={{ borderImage: "linear-gradient(to bottom, rgba(245,158,11,0.3), rgba(255,255,255,0.4)) 1" }}>
        <div className="px-6 pt-7 pb-5">
          <Logo size={36} />
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#d97706" }}>
            <Crown className="w-3.5 h-3.5" />
            لوحة المالك — صلاحيات عليا
          </div>
        </div>
        <div className="mx-5 h-px bg-gradient-to-l from-transparent via-border to-transparent mb-3" />
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto hide-scrollbar">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${tab === t.id ? "text-white shadow-md" : "text-muted-foreground hover:bg-white/60 hover:text-foreground"}`}
              style={tab === t.id ? { background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 4px 15px rgba(245,158,11,0.3)" } : {}}>
              <t.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {t.label}
            </button>
          ))}
          <div className="h-px bg-gradient-to-l from-transparent via-border to-transparent my-2" />
          <button onClick={() => setLocation("/admin")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-muted-foreground hover:bg-violet-50 hover:text-violet-700 transition-all">
            <ShieldCheck className="w-4.5 h-4.5" />
            لوحة المشرف
          </button>
        </nav>
        <div className="p-4 border-t border-white/40">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={() => { logout(); setLocation("/"); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-all">
            <LogOut className="w-4 h-4" /> خروج
          </button>
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
