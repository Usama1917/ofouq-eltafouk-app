import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, GraduationCap, PlayCircle, Sparkles, Video } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type AcademicYear = {
  id: number;
  name: string;
  description?: string | null;
};

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.08 } } },
  item: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
  },
};

async function fetchAcademicYears() {
  const res = await fetch("/api/academic/years");
  if (!res.ok) throw new Error("تعذر تحميل الدروس المرئية");
  return (await res.json()) as AcademicYear[];
}

function LessonsEmptyState() {
  return (
    <div className="glass-card p-8 md:p-10 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <PlayCircle className="h-8 w-8" />
      </div>
      <h3 className="font-display text-lg font-black text-foreground">لا توجد دروس متاحة حاليًا</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">سيتم إضافة الدروس قريبًا.</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: years = [], isLoading, isError } = useQuery({
    queryKey: ["soft-launch", "academic-years"],
    queryFn: fetchAcademicYears,
  });

  const featuredYears = years.slice(0, 3);

  return (
    <motion.div
      variants={stagger.container}
      initial="initial"
      animate="animate"
      className="space-y-9"
    >
      <motion.section variants={stagger.item} className="glass-float relative overflow-hidden p-7 md:p-10 lg:p-12">
        <div className="absolute inset-0 bg-gradient-to-bl from-primary/7 via-transparent to-sky-400/6 pointer-events-none" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
          <div className="max-w-2xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              منصة تعلم مرئي
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-display font-black leading-tight text-foreground md:text-5xl">
                مرحبًا بك في <span className="text-primary">أفق التفوق</span>
              </h1>
              <p className="text-base font-medium leading-relaxed text-muted-foreground md:text-lg">
                ابدأ رحلتك التعليمية من خلال الدروس المرئية المتاحة الآن.
              </p>
            </div>

            <Link href="/videos">
              <button className="btn-primary text-sm">
                تصفح الدروس المرئية
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/60 p-5 soft-shadow">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Video className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">الدروس المتاحة الآن</p>
            <p className="mt-2 font-display text-4xl font-black text-foreground">
              {isLoading ? "..." : years.length.toLocaleString("ar-EG")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">مسار تعليمي مرئي</p>
          </div>
        </div>
      </motion.section>

      <motion.section variants={stagger.item} className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-black text-foreground">تابع التعلم</h2>
            <p className="mt-1 text-sm text-muted-foreground">اختر مسارك وابدأ مشاهدة الدروس المرئية.</p>
          </div>
          <Link href="/videos">
            <button className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-4 py-2 text-sm font-bold text-primary transition-all hover:bg-primary/10">
              الدروس المتاحة
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="glass-card h-36 animate-pulse bg-white/50" />
            ))}
          </div>
        ) : null}

        {!isLoading && (isError || years.length === 0) ? <LessonsEmptyState /> : null}

        {!isLoading && featuredYears.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {featuredYears.map((year) => (
              <Link key={year.id} href={`/videos/years/${year.id}`}>
                <motion.div
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  className="glass-card flex h-full min-h-[150px] cursor-pointer flex-col justify-between p-5 transition-all hover:border-primary/30"
                >
                  <div>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold leading-snug text-foreground">{year.name}</h3>
                    {year.description ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{year.description}</p>
                    ) : null}
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm font-bold text-primary">
                    <span>ابدأ التعلم</span>
                    <ArrowLeft className="h-4 w-4" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
