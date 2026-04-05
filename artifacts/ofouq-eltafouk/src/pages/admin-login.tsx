import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/contexts/auth-context";
import { getPostLoginRoute } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLogin() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) setLocation(getPostLoginRoute(user.role));
  }, [user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const authenticatedUser = await login(email, password);
      setLocation(getPostLoginRoute(authenticatedUser.role));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-4" dir="rtl">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #6366f1 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-7">
          <div className="text-center">
            <Logo size={52} className="justify-center" />
            <div className="mt-5 inline-flex items-center gap-2 bg-violet-500/20 border border-violet-400/30 text-violet-300 rounded-full px-4 py-1.5 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              لوحة تحكم المشرفين
            </div>
            <h1 className="text-2xl font-display font-black text-white mt-3">دخول المشرف</h1>
            <p className="text-slate-400 text-sm mt-1">هذه البوابة مخصصة للمشرفين المعتمدين فقط</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-500/20 border border-red-400/30 text-red-300 text-sm font-medium px-4 py-3 rounded-2xl">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pr-11 pl-4 py-3.5 rounded-2xl bg-white/10 border border-white/20 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/20 outline-none text-white placeholder-slate-500 font-medium text-sm transition-all"
                  placeholder="admin@example.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-300">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pr-11 pl-11 py-3.5 rounded-2xl bg-white/10 border border-white/20 focus:border-violet-400/60 focus:ring-4 focus:ring-violet-500/20 outline-none text-white placeholder-slate-500 font-medium text-sm transition-all"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-all disabled:opacity-70">
              {loading ? "جاري التحقق..." : "دخول لوحة التحكم"}
            </button>
          </form>

          <div className="text-center">
            <a href={BASE + "/"} className="text-slate-400 hover:text-white text-sm transition-colors">
              العودة للصفحة الرئيسية
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
