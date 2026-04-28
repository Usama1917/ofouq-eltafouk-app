import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/contexts/auth-context";
import { getPostLoginRoute } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
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
    <div className="min-h-screen flex" dir="rtl">
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-primary via-blue-600 to-indigo-700 items-center justify-center p-12">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-20 left-20 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative text-white text-center space-y-6 max-w-sm">
          <Logo size={64} className="justify-center" />
          <h2 className="text-3xl font-display font-black">أفق التفوق</h2>
          <p className="text-blue-100 leading-relaxed">ابدأ رحلتك التعليمية من خلال الدروس المرئية المتاحة الآن.</p>
          <div className="flex flex-col gap-3 text-sm font-medium text-blue-100">
            {["✦ دروس مرئية منظمة", "✦ محتوى تعليمي واضح", "✦ تجربة مشاهدة سهلة"].map(f => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex justify-center mb-5">
            <Logo size={50} className="justify-center text-foreground" />
          </div>

          <div>
            <h1 className="text-3xl font-display font-black text-foreground">تسجيل الدخول</h1>
            <p className="text-muted-foreground mt-1 text-sm">أهلاً بعودتك! سجّل دخولك للمتابعة.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">
                {error}
              </div>
            )}

            <div className="space-y-2.5">
              <label className="block pr-1 text-[15px] font-bold text-foreground/90">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pr-11 pl-4 py-3.5 rounded-2xl bg-white/70 backdrop-blur border border-white/70 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all font-medium text-sm"
                  placeholder="example@email.com" />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block pr-1 text-[15px] font-bold text-foreground/90">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pr-11 pl-11 py-3.5 rounded-2xl bg-white/70 backdrop-blur border border-white/70 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all font-medium text-sm"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full btn-primary justify-center py-4 text-base disabled:opacity-70">
              {loading ? "جاري الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            ليس لديك حساب؟{" "}
            <a href={`${BASE}/register`} onClick={e => { e.preventDefault(); window.location.href = `${BASE}/register`; }} className="text-primary font-bold hover:underline">
              إنشاء حساب جديد
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
