import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Gift,
  GraduationCap,
  LineChart,
  ListTree,
  PlayCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { toEnglishDigits } from "@/lib/format";
import lessonThumb from "@/assets/lesson-thumb.jpg";

/**
 * Public marketing landing page shown at "/" for signed-out visitors.
 * Editorial, scroll-driven storytelling (Anthropic-style): warm ivory canvas,
 * large type, calm dark buttons, and section-by-section reveals — fully RTL.
 * Signed-in users never see this; they get the in-app Dashboard instead.
 */

type AcademicYear = {
  id: number;
  name: string;
  description?: string | null;
};

async function fetchAcademicYears() {
  const res = await fetch("/api/academic/years");
  if (!res.ok) throw new Error("تعذر تحميل المناهج");
  return (await res.json()) as AcademicYear[];
}

/** Fade-up reveal as each section scrolls into view. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  // Respect the OS "reduce motion" preference: render immediately, no transform.
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const FEATURES = [
  {
    icon: PlayCircle,
    title: "دروس مرئية واضحة",
    body: "شرح مبسّط خطوة بخطوة، بجودة عالية، يخلّي أصعب درس سهل.",
  },
  {
    icon: ListTree,
    title: "منظّمة حسب المنهج",
    body: "كل حاجة مرتّبة: الصف ← المادة ← الوحدة ← الدرس. مفيش تشتيت.",
  },
  {
    icon: Clock,
    title: "ذاكر في وقتك",
    body: "كل الدروس متاحة 24 ساعة. اتفرّج وقت ما يناسبك، وارجع وقت ما تحب.",
  },
  {
    icon: Smartphone,
    title: "معاك على موبايلك",
    body: "التطبيق في جيبك على الأندرويد والآيفون — تعلّم من أي مكان.",
  },
  {
    icon: LineChart,
    title: "تابع تقدّمك",
    body: "سجل مشاهدة يكمّل من حيث وقفت، ويوريك إنت وصلت لفين.",
  },
  {
    icon: ShieldCheck,
    title: "محتوى آمن ومحمي",
    body: "بيئة تعليمية مخصّصة للطلاب، ومحتوى محمي ومنظّم.",
  },
];

const STEPS = [
  { n: "1", title: "اختر صفّك", body: "حدّد صفّك الدراسي من الصفوف المتاحة." },
  { n: "2", title: "فعّل اشتراكك", body: "اشترك في المادة أو الصف اللي محتاجه — أو مجانًا بالكتاب الورقي." },
  { n: "3", title: "ابدأ التعلّم", body: "اتفرّج على الدروس فورًا، وذاكر براحتك." },
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReducedMotion();

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["landing", "academic-years"],
    queryFn: fetchAcademicYears,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scope smooth in-page scrolling AND the warm ivory canvas to this page, so the
  // app's blue/purple body gradient doesn't bleed through on overscroll bounce
  // (iOS/macOS rubber-band). Every override is reverted on unmount.
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const prev = {
      scrollBehavior: html.style.scrollBehavior,
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      overscroll: html.style.overscrollBehavior,
    };
    html.style.scrollBehavior = "smooth";
    html.style.background = "#F4F1E9";
    body.style.background = "#F4F1E9";
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.scrollBehavior = prev.scrollBehavior;
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      html.style.overscrollBehavior = prev.overscroll;
    };
  }, []);

  const featuredYears = years.slice(0, 4);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#F4F1E9] text-neutral-900">
      {/* ─── Top nav ──────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-neutral-900/10 bg-[#F4F1E9]/85 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:h-20 md:px-8">
          <Logo size={34} />

          <div className="hidden items-center gap-8 text-sm font-semibold text-neutral-600 lg:flex">
            <a href="#features" className="transition-colors hover:text-neutral-900">المميزات</a>
            <a href="#how" className="transition-colors hover:text-neutral-900">كيف تبدأ</a>
            <a href="#curricula" className="transition-colors hover:text-neutral-900">المناهج</a>
            <a href="#app" className="transition-colors hover:text-neutral-900">التطبيق</a>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/login">
              <button className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900">
                تسجيل الدخول
              </button>
            </Link>
            <Link href="/register">
              <button className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 hover:shadow-md">
                إنشاء حساب
              </button>
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative px-5 pt-32 pb-20 md:px-8 md:pt-44 md:pb-28">
        {/* soft warm orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-24 h-[34rem] w-[34rem] rounded-full bg-gradient-to-br from-sky-300/30 to-transparent blur-3xl" />
          <div className="absolute -left-32 top-40 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-amber-300/25 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-neutral-900/10 bg-white/70 px-4 py-1.5 text-sm font-semibold text-neutral-700">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                منصة التعلّم المرئي للثانوية
              </span>
            </Reveal>

            <Reveal delay={0.05}>
              <h1 className="arabic-diacritics-safe mt-6 font-display text-5xl font-black leading-[1.45] tracking-tight text-neutral-900 md:text-7xl md:leading-[1.4]">
                طريقك للتفوّق
                <br />
                يبدأ من <span className="text-primary">هنا</span>.
              </h1>
            </Reveal>

            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-600 md:text-xl">
                دروس مرئية مبسّطة، منظّمة حسب المنهج المصري. ذاكر في أي وقت،
                من أي مكان، من موبايلك — وبأسلوب تفهمه فعلًا.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/register">
                  <button className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 hover:shadow-lg">
                    ابدأ الآن
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </Link>
                <Link href="/login">
                  <button className="inline-flex items-center gap-2 rounded-full border border-neutral-900/15 bg-transparent px-7 py-3.5 text-base font-semibold text-neutral-800 transition-all hover:bg-neutral-900/5">
                    <PlayCircle className="h-5 w-5" />
                    شاهد الدروس
                  </button>
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Hero visual — stylized lesson preview */}
          <Reveal delay={0.2} className="hidden lg:block">
            <div className="relative mx-auto w-full max-w-md">
              <motion.div
                initial={{ rotate: -3 }}
                animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
                transition={reduceMotion ? undefined : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-2xl"
              >
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={lessonThumb}
                    alt="معاينة درس مرئي"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/5" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
                      <PlayCircle className="h-9 w-9 text-primary" />
                    </div>
                  </div>
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white">
                    12:45
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <h3 className="line-clamp-2 text-sm font-bold leading-snug text-neutral-900">
                      كتاب التفوق أحياء مراجعة نهائية 2026 | شوامل المنهج | الشامل السابع
                    </h3>
                  </div>
                  <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-neutral-500">
                    يقدم هذا الفيديو مراجعة شاملة للنموذج السابع من كتاب التفوق ....
                  </p>
                </div>
              </motion.div>

              <div className="absolute -bottom-5 -right-5 flex items-center gap-2 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-xl">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-bold text-neutral-800">محتوى للتفوق</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Stats band */}
        <Reveal delay={0.1} className="relative mx-auto mt-20 max-w-6xl">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-neutral-900/10 bg-neutral-900/10 md:grid-cols-4">
            {[
              { value: isLoading ? "…" : years.length > 0 ? `${years.length}+` : "متعددة", label: "صفوف دراسية متاحة" },
              { value: "مرئية", label: "دروس متجددة باستمرار" },
              { value: "24/7", label: "متاح في أي وقت" },
              { value: "آيفون + أندرويد", label: "التطبيق على موبايلك" },
            ].map((s) => (
              <div key={s.label} className="bg-[#F4F1E9] px-5 py-7 text-center">
                <p className="font-display text-2xl font-black text-neutral-900 md:text-3xl">{s.value}</p>
                <p className="mt-1.5 text-sm text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ─── Mission statement ────────────────────────────────── */}
      <section className="px-5 py-20 md:px-8 md:py-28">
        <Reveal className="mx-auto max-w-4xl text-center">
          <h2 className="arabic-diacritics-safe font-display text-3xl font-black leading-[1.35] tracking-tight text-neutral-900 md:text-5xl">
            نؤمن أن كل طالب يستحق
            <span className="text-primary"> شرحًا واضحًا</span>،
            في متناول يده، وقتما يحتاجه.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-600">
            أفق التفوق بنى مكان واحد بسيط ومنظّم، يجمع كل دروسك المرئية في رحلة
            تعليمية واضحة — من غير تعقيد ولا تشتيت.
          </p>
        </Reveal>
      </section>

      {/* ─── Features ─────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-24 px-5 py-12 md:px-8 md:py-16">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-12 max-w-2xl">
            <span className="text-sm font-bold uppercase tracking-wider text-primary">المميزات</span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-neutral-900 md:text-4xl">
              كل اللي تحتاجه عشان تتفوّق
            </h2>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.07}>
                <div className="group h-full rounded-3xl border border-neutral-900/8 bg-white/70 p-7 transition-all hover:-translate-y-1 hover:border-neutral-900/15 hover:bg-white hover:shadow-xl">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-black text-neutral-900">{f.title}</h3>
                  <p className="mt-2.5 leading-relaxed text-neutral-600">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section id="how" className="scroll-mt-24 px-5 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-14 text-center">
            <span className="text-sm font-bold uppercase tracking-wider text-primary">كيف تبدأ</span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-neutral-900 md:text-4xl">
              3 خطوات وتكون بدأت
            </h2>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className="relative h-full rounded-3xl border border-neutral-900/8 bg-white/60 p-8">
                  <span className="font-display text-6xl font-black text-primary/15">{s.n}</span>
                  <h3 className="mt-3 font-display text-xl font-black text-neutral-900">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Free-with-paper-book offer ───────────────────────── */}
      <section className="px-5 py-12 md:px-8 md:py-16">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/15 bg-gradient-to-bl from-primary/10 via-white/70 to-amber-100/50 p-8 md:p-12">
            <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="relative grid items-center gap-7 md:grid-cols-[auto_1fr_auto]">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-white shadow-lg">
                <BookOpen className="h-8 w-8" />
              </div>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-bold text-emerald-700">
                  <Gift className="h-3.5 w-3.5" />
                  عرض مجاني
                </span>
                <h2 className="mt-3 font-display text-2xl font-black leading-snug tracking-tight text-neutral-900 md:text-3xl">
                  معاك نسخة ورقية من الكتاب؟ اشتراكك مجاني بالكامل
                </h2>
                <p className="mt-2 max-w-2xl text-lg leading-relaxed text-neutral-600">
                  لو عندك نسخة ورقية من كتاب أفق التفوق، تقدر تفعّل اشتراكك في كل الدروس
                  المرئية مجانًا — من غير أي رسوم.
                </p>
              </div>
              <Link href="/register">
                <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-neutral-900 px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-neutral-800 hover:shadow-lg">
                  فعّل اشتراكك المجاني
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── Available curricula (live) ───────────────────────── */}
      {(isLoading || featuredYears.length > 0) && (
        <section id="curricula" className="scroll-mt-24 px-5 py-12 md:px-8 md:py-16">
          <div className="mx-auto max-w-6xl">
            <Reveal className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <span className="text-sm font-bold uppercase tracking-wider text-primary">المناهج</span>
                <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-neutral-900 md:text-4xl">
                  المناهج المتاحة الآن
                </h2>
              </div>
              <Link href="/login">
                <button className="inline-flex items-center gap-2 self-start rounded-full border border-neutral-900/15 px-5 py-2.5 text-sm font-semibold text-neutral-800 transition-all hover:bg-neutral-900/5 sm:self-auto">
                  تصفّح الكل
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Link>
            </Reveal>

            {isLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-3xl bg-white/50" />
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {featuredYears.map((year, i) => (
                  <Reveal key={year.id} delay={(i % 4) * 0.06}>
                    <Link href="/login">
                      <div className="group flex h-full cursor-pointer flex-col justify-between rounded-3xl border border-neutral-900/8 bg-white/70 p-6 transition-all hover:-translate-y-1 hover:border-primary/30 hover:bg-white hover:shadow-xl">
                        <div>
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                            <GraduationCap className="h-5 w-5" />
                          </div>
                          <h3 className="font-display text-lg font-black text-neutral-900">
                            {toEnglishDigits(year.name)}
                          </h3>
                          {year.description ? (
                            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-500">
                              {toEnglishDigits(year.description)}
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-6 flex items-center gap-1.5 text-sm font-bold text-primary">
                          <span>ابدأ التعلّم</span>
                          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── Mobile app highlight ─────────────────────────────── */}
      <section id="app" className="scroll-mt-24 px-5 py-20 md:px-8 md:py-28">
        <Reveal className="mx-auto max-w-6xl">
          <div className="grid items-center gap-10 overflow-hidden rounded-[2.5rem] border border-neutral-900/8 bg-white/60 p-9 md:grid-cols-2 md:p-14">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
                <Smartphone className="h-3.5 w-3.5" />
                التطبيق
              </span>
              <h2 className="mt-5 font-display text-3xl font-black tracking-tight text-neutral-900 md:text-4xl">
                دروسك في جيبك
              </h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-neutral-600">
                نزّل تطبيق أفق التفوق على الأندرويد أو الآيفون، وذاكر في أي وقت
                ومن أي مكان — حتى وأنت في الطريق.
              </p>
              <div className="mt-7">
                <Link href="/register">
                  <button className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-neutral-800 hover:shadow-lg">
                    أنشئ حسابك الآن
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </Link>
              </div>
            </div>

            <div className="relative mx-auto h-72 w-44 rounded-[2.2rem] border-4 border-neutral-900 bg-neutral-900 shadow-2xl">
              <div className="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-neutral-700" />
              <div className="flex h-full w-full flex-col overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-primary to-sky-400 p-4 pt-7">
                <div className="flex items-center justify-center">
                  <Logo size={26} />
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="h-16 rounded-2xl bg-white/85" />
                  <div className="h-10 rounded-xl bg-white/30" />
                  <div className="h-10 rounded-xl bg-white/30" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── Closing CTA ──────────────────────────────────────── */}
      <section className="px-5 pb-24 md:px-8">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-neutral-900 px-8 py-16 text-center md:px-16 md:py-24">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="relative">
              <h2 className="arabic-diacritics-safe font-display text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">
                جاهز تبدأ رحلتك نحو التفوّق؟
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-300">
                انضم لآلاف الطلاب وابدأ التعلّم النهارده. الحساب مجاني، والبداية في دقائق.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link href="/register">
                  <button className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-neutral-900 transition-all hover:bg-neutral-100 hover:shadow-xl">
                    إنشاء حساب مجاني
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </Link>
                <Link href="/login">
                  <button className="inline-flex items-center gap-2 rounded-full border border-white/25 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-white/10">
                    عندي حساب بالفعل
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ─── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-neutral-900/10 px-5 py-12 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <Logo size={32} />
            <p className="text-sm text-neutral-500">منصة التعلّم المرئي — طريقك للتفوّق.</p>
          </div>
          <div className="flex items-center gap-6 text-sm font-semibold text-neutral-600">
            <a href="#features" className="transition-colors hover:text-neutral-900">المميزات</a>
            <a href="#how" className="transition-colors hover:text-neutral-900">كيف تبدأ</a>
            <Link href="/login">
              <span className="cursor-pointer transition-colors hover:text-neutral-900">تسجيل الدخول</span>
            </Link>
            <Link href="/register">
              <span className="cursor-pointer transition-colors hover:text-neutral-900">إنشاء حساب</span>
            </Link>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-center text-sm text-neutral-400 md:text-start">
          © 2026 أفق التفوق. جميع الحقوق محفوظة.
        </p>
      </footer>
    </div>
  );
}
