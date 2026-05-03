import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { GraduationCap, BookOpen, Users, ChevronRight, ChevronLeft, Check, Upload, Camera } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/contexts/auth-context";
import { isSupportedProfileImageFile, uploadProfilePhoto } from "@/lib/media";
import { toEnglishDigits } from "@/lib/format";

type Role = "student" | "teacher" | "parent";

const STEPS_STUDENT = ["الدور", "البيانات الأساسية", "معلومات الطالب", "إتمام التسجيل"];
const STEPS_TEACHER = ["الدور", "البيانات الأساسية", "معلومات المعلم", "إتمام التسجيل"];
const STEPS_PARENT = ["الدور", "البيانات الأساسية", "إتمام التسجيل"];

const GOVERNORATES = ["القاهرة","الإسكندرية","الجيزة","الشرقية","الدقهلية","البحيرة","الغربية","المنوفية","القليوبية","الفيوم","بني سويف","المنيا","أسيوط","سوهاج","قنا","الأقصر","أسوان","مطروح","شمال سيناء","جنوب سيناء","البحر الأحمر","الوادي الجديد","كفر الشيخ","دمياط","الإسماعيلية","السويس","بورسعيد"];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i < step ? "bg-primary" : i === step ? "bg-primary/40" : "bg-muted"}`} />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="w-full px-4 py-3 rounded-2xl bg-white/70 backdrop-blur border border-white/70 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all font-medium text-sm" />
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select {...props}
      className="w-full px-4 py-3 rounded-2xl bg-white/70 backdrop-blur border border-white/70 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all font-medium text-sm">
      {children}
    </select>
  );
}

export default function Register() {
  const { register } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", email: "", password: "",
    phone: "", age: "", parentPhone: "", address: "", governorate: "", howDidYouHear: "",
    specialty: "", qualifications: "", supportNeeded: "",
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: toEnglishDigits(v) }));

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const steps = role === "teacher" ? STEPS_TEACHER : role === "parent" ? STEPS_PARENT : STEPS_STUDENT;
  const totalSteps = steps.length;

  const next = () => { setError(""); setStep(s => Math.min(s + 1, totalSteps - 1)); };
  const prev = () => { setError(""); setStep(s => Math.max(s - 1, 0)); };

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try {
      const avatarUrl = avatarFile ? await uploadProfilePhoto(avatarFile) : undefined;
      await register({ ...form, role, age: form.age ? parseInt(form.age) : undefined, avatarUrl });
      setStep(totalSteps - 1);
      setTimeout(() => setLocation("/"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const slide = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <div className="mesh-bg" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="glass-float p-8 space-y-6">
          <div className="flex items-center justify-between">
            <Logo size={36} showText={false} />
            <p className="text-sm font-semibold text-muted-foreground">{steps[step]}</p>
          </div>

          <ProgressBar step={step} total={totalSteps} />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* STEP 0: Role Selection */}
            {step === 0 && (
              <motion.div key="role" {...slide} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-display font-black text-foreground">من أنت؟</h2>
                  <p className="text-muted-foreground text-sm mt-1">اختر دورك على المنصة</p>
                </div>
                <div className="space-y-3">
                  {[
                    { val: "student" as Role, label: "طالب", desc: "ابدأ التعلم من الدروس المرئية", icon: GraduationCap, color: "from-blue-500 to-indigo-600", glow: "shadow-blue-500/20" },
                    { val: "teacher" as Role, label: "معلم", desc: "شارك خبرتك وادعم الطلاب", icon: BookOpen, color: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/20" },
                    { val: "parent" as Role, label: "ولي أمر", desc: "تابع تقدم أبنائك وأشجعهم", icon: Users, color: "from-amber-500 to-orange-600", glow: "shadow-amber-500/20" },
                  ].map(r => (
                    <button key={r.val} onClick={() => { setRole(r.val); next(); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-right transition-all hover:shadow-md ${role === r.val ? "border-primary bg-primary/5" : "border-white/60 bg-white/40 hover:border-primary/30"}`}>
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${r.color} flex items-center justify-center text-white shadow-lg ${r.glow} flex-shrink-0`}>
                        <r.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{r.label}</p>
                        <p className="text-xs text-muted-foreground">{r.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  لديك حساب؟{" "}
                  <button onClick={() => setLocation("/login")} className="text-primary font-bold hover:underline">تسجيل الدخول</button>
                </p>
              </motion.div>
            )}

            {/* STEP 1: Basic Info */}
            {step === 1 && (
              <motion.div key="basic" {...slide} className="space-y-4">
                <h2 className="text-2xl font-display font-black text-foreground">البيانات الأساسية</h2>
                <Field label="الصورة الشخصية">
                  <label className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white/55 p-4 transition-all hover:bg-white/75 cursor-pointer">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="الصورة الشخصية" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-7 w-7" />
                      )}
                      <span className="absolute bottom-0 left-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white">
                        <Upload className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">
                        {avatarFile ? "تغيير الصورة" : "اختيار صورة شخصية"}
                      </p>
                      <p className="text-xs text-muted-foreground">اختياري ويمكن تغييره لاحقًا</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) return;
                        if (!isSupportedProfileImageFile(file)) {
                          setError("اختر صورة بصيغة JPG أو PNG أو WebP أو HEIC.");
                          return;
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          setError("اختر صورة بحجم أقل من 5MB.");
                          return;
                        }
                        setError("");
                        setAvatarFile(file);
                      }}
                    />
                  </label>
                </Field>
                <Field label="الاسم الكامل"><Input placeholder="أحمد محمد" value={form.name} onChange={e => set("name", e.target.value)} required /></Field>
                <Field label="البريد الإلكتروني"><Input type="email" placeholder="example@email.com" value={form.email} onChange={e => set("email", e.target.value)} required /></Field>
                <Field label="كلمة المرور"><Input type="password" placeholder="••••••••" value={form.password} onChange={e => set("password", e.target.value)} required /></Field>
              </motion.div>
            )}

            {/* STEP 2: Role-specific */}
            {step === 2 && role === "student" && (
              <motion.div key="student" {...slide} className="space-y-4">
                <h2 className="text-2xl font-display font-black text-foreground">معلومات الطالب</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="العمر"><Input type="number" placeholder="16" min="5" max="100" value={toEnglishDigits(form.age)} onChange={e => set("age", toEnglishDigits(e.target.value))} /></Field>
                  <Field label="رقم الهاتف"><Input placeholder="01000000000" value={form.phone} onChange={e => set("phone", e.target.value)} /></Field>
                </div>
                <Field label="هاتف ولي الأمر"><Input placeholder="01000000000" value={form.parentPhone} onChange={e => set("parentPhone", e.target.value)} /></Field>
                <Field label="العنوان"><Input placeholder="المدينة، الشارع" value={form.address} onChange={e => set("address", e.target.value)} /></Field>
                <Field label="المحافظة">
                  <Select value={form.governorate} onChange={e => set("governorate", e.target.value)}>
                    <option value="">اختر المحافظة</option>
                    {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </Field>
                <Field label="كيف عرفت عن المنصة؟">
                  <Select value={form.howDidYouHear} onChange={e => set("howDidYouHear", e.target.value)}>
                    <option value="">اختر</option>
                    {["صديق أو معرفة", "وسائل التواصل الاجتماعي", "محرك البحث", "إعلان", "أخرى"].map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
              </motion.div>
            )}

            {step === 2 && role === "teacher" && (
              <motion.div key="teacher" {...slide} className="space-y-4">
                <h2 className="text-2xl font-display font-black text-foreground">معلومات المعلم</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="العمر"><Input type="number" placeholder="30" value={toEnglishDigits(form.age)} onChange={e => set("age", toEnglishDigits(e.target.value))} /></Field>
                  <Field label="رقم الهاتف"><Input placeholder="01000000000" value={form.phone} onChange={e => set("phone", e.target.value)} /></Field>
                </div>
                <Field label="العنوان"><Input placeholder="المدينة، الشارع" value={form.address} onChange={e => set("address", e.target.value)} /></Field>
                <Field label="التخصص الأكاديمي"><Input placeholder="الرياضيات، الفيزياء..." value={form.specialty} onChange={e => set("specialty", e.target.value)} /></Field>
                <Field label="المؤهلات العلمية"><Input placeholder="بكالوريوس تربية..." value={form.qualifications} onChange={e => set("qualifications", e.target.value)} /></Field>
                <Field label="كيف تريد أن تدعمك أفق التفوق؟">
                  <Select value={form.supportNeeded} onChange={e => set("supportNeeded", e.target.value)}>
                    <option value="">اختر</option>
                    {["نشر المحتوى التعليمي", "التواصل مع الطلاب", "بناء قاعدة طلاب", "الحصول على دخل إضافي", "أخرى"].map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
                <Field label="رفع السيرة الذاتية">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/50 border border-white/70 border-dashed cursor-pointer hover:bg-white/70 transition-all">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground font-medium">اضغط لرفع ملف PDF أو Word</span>
                  </div>
                </Field>
              </motion.div>
            )}

            {step === 2 && role === "parent" && (
              <motion.div key="parent-final" {...slide} className="space-y-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto text-white shadow-xl shadow-amber-500/30">
                  <Users className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-black text-foreground">هل أنت جاهز؟</h2>
                  <p className="text-muted-foreground text-sm mt-2">سيتم إنشاء حسابك كولي أمر. يمكنك لاحقاً تخصيص ملفك الشخصي ومتابعة أبنائك.</p>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">{error}</div>}
                <button onClick={handleSubmit} disabled={loading}
                  className="w-full btn-primary justify-center py-4 text-base disabled:opacity-70">
                  {loading ? "جاري التسجيل..." : "إنشاء الحساب"}
                </button>
              </motion.div>
            )}

            {/* FINAL STEP */}
            {step === totalSteps - 1 && role !== "parent" && (
              <motion.div key="final" {...slide} className="space-y-6 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mx-auto text-white shadow-xl shadow-emerald-500/30">
                  <Check className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-black text-foreground">هل أنت جاهز؟</h2>
                  <p className="text-muted-foreground text-sm mt-2">راجع بياناتك ثم اضغط إنشاء الحساب.</p>
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">{error}</div>}
                <button onClick={handleSubmit} disabled={loading}
                  className="w-full btn-primary justify-center py-4 text-base disabled:opacity-70">
                  {loading ? "جاري التسجيل..." : "إنشاء الحساب"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          {step > 0 && step < totalSteps - 1 && (
            <div className="flex gap-3 pt-2">
              <button onClick={prev} className="flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-white/60 border border-white/70 text-foreground font-semibold text-sm hover:bg-white/90 transition-all">
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <button onClick={next} className="flex-1 btn-primary justify-center py-3 text-sm">
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
