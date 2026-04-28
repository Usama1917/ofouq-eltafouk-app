import { useState } from "react";
import { motion } from "framer-motion";
import { User, Mail, Phone, MapPin, Edit3, Save, X, Coins, Award, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  getGetPointsHistoryQueryKey,
  getGetPointsQueryKey,
  getListRedemptionsQueryKey,
  useGetPoints,
  useGetPointsHistory,
  useListRedemptions,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { isStudentFeatureVisible } from "@/config/soft-launch";

const ROLE_LABELS: Record<string, string> = {
  student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك",
};
const ROLE_COLORS: Record<string, string> = {
  student: "from-blue-500 to-indigo-600",
  teacher: "from-emerald-500 to-teal-600",
  parent: "from-amber-500 to-orange-600",
  admin: "from-violet-500 to-purple-700",
  owner: "from-rose-500 to-pink-700",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  const { user, logout, updateUser, token, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const showPoints = isStudentFeatureVisible("points");
  const showRewards = isStudentFeatureVisible("rewards");
  const { data: points } = useGetPoints({
    query: { enabled: Boolean(user && showPoints), queryKey: getGetPointsQueryKey() },
  });
  const { data: history = [] } = useGetPointsHistory({
    query: { enabled: Boolean(user && showPoints), queryKey: getGetPointsHistoryQueryKey() },
  });
  const { data: redemptions = [] } = useListRedemptions({
    query: { enabled: Boolean(user && showRewards), queryKey: getListRedemptionsQueryKey() },
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    address: user?.address || "",
    bio: user?.bio || "",
    governorate: user?.governorate || "",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/auth/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        updateUser(updated);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => { logout(); setLocation("/login"); };

  if (isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  if (!user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto" dir="rtl">
        <div className="glass-card p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <User className="h-8 w-8" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-black text-foreground">حسابي</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">سجّل الدخول لإدارة بياناتك ومتابعة رحلتك التعليمية.</p>
          </div>
          <Link href="/login">
            <button className="btn-primary justify-center text-sm">تسجيل الدخول</button>
          </Link>
        </div>
      </motion.div>
    );
  }

  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.student;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header card */}
      <div className="glass-float relative overflow-hidden p-8">
        <div className={`absolute inset-0 bg-gradient-to-br ${roleColor} opacity-5 pointer-events-none`} />
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Avatar */}
          <div className={`w-24 h-24 rounded-3xl bg-gradient-to-br ${roleColor} flex items-center justify-center text-white font-display font-black text-4xl shadow-xl flex-shrink-0`}>
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 text-center sm:text-right space-y-2">
            <h1 className="text-3xl font-display font-black text-foreground">{user.name}</h1>
            <p className="text-muted-foreground text-sm">{user.email}</p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r ${roleColor} text-white shadow-md`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/70 border border-white/70 text-muted-foreground">
                انضم {formatDistanceToNow(new Date(user.joinedAt), { addSuffix: true, locale: ar })}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/60 border border-white/70 text-muted-foreground hover:text-rose-500 hover:border-rose-200 transition-all font-semibold text-sm">
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </div>

      {/* Points summary - hidden during soft launch, preserved for later re-enable. */}
      {showPoints && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "الرصيد", value: points?.balance ?? 0, color: "text-amber-500", bg: "from-amber-50/80 to-orange-50/60" },
            { label: "مكتسبة", value: points?.totalEarned ?? 0, color: "text-emerald-600", bg: "from-emerald-50/80 to-teal-50/60" },
            { label: "مستخدمة", value: points?.totalSpent ?? 0, color: "text-rose-500", bg: "from-rose-50/80 to-pink-50/60" },
          ].map(s => (
            <div key={s.label} className={`glass-card p-4 text-center bg-gradient-to-br ${s.bg}`}>
              <p className={`font-display font-black text-3xl ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Personal info */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            المعلومات الشخصية
          </h2>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
              <Edit3 className="w-4 h-4" />
              تعديل
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" /> إلغاء
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? "جاري..." : "حفظ"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {editing ? (
            <>
              {[
                { k: "name", label: "الاسم الكامل", icon: User },
                { k: "phone", label: "رقم الهاتف", icon: Phone },
                { k: "address", label: "العنوان", icon: MapPin },
                { k: "governorate", label: "المحافظة", icon: MapPin },
              ].map(f => (
                <div key={f.k} className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                  <input value={form[f.k as keyof typeof form]} onChange={e => set(f.k, e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/70 border border-white/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none text-sm font-medium transition-all" />
                </div>
              ))}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">نبذة شخصية</label>
                <textarea rows={3} value={form.bio} onChange={e => set("bio", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/70 border border-white/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none text-sm font-medium resize-none transition-all" />
              </div>
            </>
          ) : (
            [
              { label: "الاسم", value: user.name, icon: User },
              { label: "البريد الإلكتروني", value: user.email, icon: Mail },
              { label: "رقم الهاتف", value: user.phone || "—", icon: Phone },
              { label: "العنوان", value: user.address || "—", icon: MapPin },
              { label: "المحافظة", value: user.governorate || "—", icon: MapPin },
            ].map(f => (
              <div key={f.label} className="flex items-start gap-3 p-3 rounded-xl bg-white/40">
                <f.icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{f.label}</p>
                  <p className="text-sm font-semibold text-foreground">{f.value}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {!editing && user.bio && (
          <div className="p-4 rounded-xl bg-white/40 text-sm text-foreground leading-relaxed">{user.bio}</div>
        )}
      </div>

      {/* Recent activity */}
      {showPoints && history.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            آخر العمليات
          </h2>
          <div className="space-y-2">
            {history.slice(0, 5).map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/40 transition-colors">
                <span className="text-sm font-medium text-foreground">{tx.description}</span>
                <span className={`font-bold text-sm ${tx.type === "spend" ? "text-rose-500" : "text-emerald-600"}`}>
                  {tx.type === "spend" ? "-" : "+"}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redemptions */}
      {showRewards && redemptions.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            المكافآت المستبدلة
          </h2>
          <div className="space-y-2">
            {redemptions.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/40 transition-colors">
                <span className="text-sm font-semibold text-foreground">{r.rewardTitle}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
