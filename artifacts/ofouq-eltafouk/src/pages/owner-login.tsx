import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, Crown } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/contexts/auth-context";

export default function OwnerLogin() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("owner@demo.com");
  const [password, setPassword] = useState("owner123");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.role === "owner") setLocation("/owner");
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.role !== "owner") { setError("ليس لديك صلاحية الدخول لهذه اللوحة"); return; }
      setLocation("/owner");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl"
      style={{ background: "linear-gradient(135deg, #0f0a1e 0%, #1a0f3a 50%, #0d1a3a 100%)" }}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 30% 70%, #f59e0b 1px, transparent 1px), radial-gradient(circle at 70% 30%, #a855f7 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="rounded-3xl p-8 shadow-2xl space-y-7" style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(32px)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="text-center">
            <Logo size={52} className="justify-center" />
            <div className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
              <Crown className="w-4 h-4" />
              بوابة الملاك — صلاحيات عليا
            </div>
            <h1 className="text-2xl font-display font-black text-white mt-3">دخول المالك</h1>
            <p className="text-slate-400 text-sm mt-1">هذه البوابة مخصصة لأصحاب المنصة فقط</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm font-medium px-4 py-3 rounded-2xl" style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pr-11 pl-4 py-3.5 rounded-2xl outline-none text-white placeholder-slate-500 font-medium text-sm transition-all"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                  placeholder="owner@example.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pr-11 pl-11 py-3.5 rounded-2xl outline-none text-white placeholder-slate-500 font-medium text-sm transition-all"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 8px 24px rgba(245,158,11,0.35)" }}>
              {loading ? "جاري التحقق..." : "دخول لوحة المالك"}
            </button>
          </form>

          <div className="text-center">
            <a href={import.meta.env.BASE_URL.replace(/\/$/, "") + "/"} className="text-slate-400 hover:text-white text-sm transition-colors">
              العودة للصفحة الرئيسية
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
