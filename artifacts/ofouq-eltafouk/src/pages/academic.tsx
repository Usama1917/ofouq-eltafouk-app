import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import {
  GraduationCap, BookOpen, Users, Layers, PlayCircle,
  ChevronLeft, Play, Clock, User, ArrowLeft
} from "lucide-react";

interface AcademicYear { id: number; name: string; description: string; }
interface Subject { id: number; name: string; icon: string; description: string; hasProviders: boolean; }
interface ContentProvider { id: number; name: string; description: string; logoUrl?: string; }
interface Unit { id: number; name: string; description: string; }
interface Lesson {
  id: number; title: string; description: string; videoId?: number;
  video?: { id: number; title: string; videoUrl: string; thumbnailUrl?: string; duration: number; instructor: string; } | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="glass-card p-12 text-center text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4 opacity-40">{icon}</div>
      <p className="font-medium">{message}</p>
    </div>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      dir="rtl"
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
        <h1 className="font-display font-black text-2xl text-foreground">{title}</h1>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground mr-13">{subtitle}</p>}
    </div>
  );
}

// ── Years Page ─────────────────────────────────────────────────────────────
export function AcademicYearsPage() {
  const { data: years = [], isLoading } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/academic/years"),
  });
  return (
    <PageWrapper>
      <SectionTitle icon={<GraduationCap className="w-5 h-5" />} title="السنوات الدراسية" subtitle="اختر السنة الدراسية" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && years.length === 0 && <EmptyState icon={<GraduationCap className="w-8 h-8" />} message="لا توجد سنوات دراسية متاحة بعد" />}
      <div className="space-y-3">
        {years.map(year => (
          <Link key={year.id} href={`/videos/years/${year.id}`}>
            <motion.div whileHover={{ y: -3 }} className="glass-card p-6 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-blue-50 flex items-center justify-center group-hover:from-primary/20 transition-all">
                <GraduationCap className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-bold text-lg text-foreground">{year.name}</h3>
                {year.description && <p className="text-sm text-muted-foreground mt-0.5">{year.description}</p>}
              </div>
              <ChevronLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

// ── Subjects Page ──────────────────────────────────────────────────────────
export function AcademicSubjectsPage() {
  const [, params] = useRoute("/videos/years/:yearId");
  const yearId = parseInt(params?.yearId ?? "0");

  const { data: year } = useQuery<AcademicYear>({
    queryKey: ["academic", "year", yearId],
    queryFn: () => apiFetch(`/academic/years`).then((yrs: AcademicYear[]) => yrs.find(y => y.id === yearId)!),
    enabled: !!yearId,
  });
  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
    enabled: !!yearId,
  });

  return (
    <PageWrapper>
      <Link href="/videos">
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> السنوات الدراسية
        </button>
      </Link>
      <SectionTitle icon={<BookOpen className="w-5 h-5" />} title={year?.name ?? "..."} subtitle="اختر المادة الدراسية" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && subjects.length === 0 && <EmptyState icon={<BookOpen className="w-8 h-8" />} message="لا توجد مواد متاحة" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subjects.map(subject => {
          const href = subject.hasProviders
            ? `/videos/years/${yearId}/subjects/${subject.id}/providers`
            : `/videos/years/${yearId}/subjects/${subject.id}/units`;
          return (
            <Link key={subject.id} href={href}>
              <motion.div whileHover={{ y: -3 }} className="glass-card p-5 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center text-2xl">{subject.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground">{subject.name}</h3>
                  {subject.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subject.description}</p>}
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              </motion.div>
            </Link>
          );
        })}
      </div>
    </PageWrapper>
  );
}

// ── Providers Page ──────────────────────────────────────────────────────────
export function AcademicProvidersPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/providers");
  const yearId = params?.yearId ?? "0";
  const subjectId = parseInt(params?.subjectId ?? "0");

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
  });
  const subject = subjects.find(s => s.id === subjectId);

  const { data: providers = [], isLoading } = useQuery<ContentProvider[]>({
    queryKey: ["academic", "providers", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/providers`),
    enabled: !!subjectId,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {subject?.name ?? "المواد"}
        </button>
      </Link>
      <SectionTitle icon={<Users className="w-5 h-5" />} title={subject?.name ?? "..."} subtitle="اختر الجهة التعليمية" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && providers.length === 0 && <EmptyState icon={<Users className="w-8 h-8" />} message="لا توجد جهات تعليمية متاحة" />}
      <div className="space-y-3">
        {providers.map(provider => (
          <Link key={provider.id} href={`/videos/years/${yearId}/subjects/${subjectId}/providers/${provider.id}/units`}>
            <motion.div whileHover={{ y: -3 }} className="glass-card p-5 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground">{provider.name}</h3>
                {provider.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{provider.description}</p>}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

// ── Units Page (under subject directly) ────────────────────────────────────
export function AcademicSubjectUnitsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/units");
  const yearId = params?.yearId ?? "0";
  const subjectId = parseInt(params?.subjectId ?? "0");

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
  });
  const subject = subjects.find(s => s.id === subjectId);

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ["academic", "units", "subject", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/units`),
    enabled: !!subjectId,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {subject?.name ?? "المواد"}
        </button>
      </Link>
      <SectionTitle icon={<Layers className="w-5 h-5" />} title={subject?.name ?? "..."} subtitle="اختر الوحدة أو الفصل" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && units.length === 0 && <EmptyState icon={<Layers className="w-8 h-8" />} message="لا توجد وحدات متاحة" />}
      <div className="space-y-2">
        {units.map(unit => (
          <Link key={unit.id} href={`/videos/years/${yearId}/subjects/${subjectId}/units/${unit.id}/lessons`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{unit.name}</h3>
                {unit.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{unit.description}</p>}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

// ── Units Page (under provider) ─────────────────────────────────────────────
export function AcademicProviderUnitsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/providers/:providerId/units");
  const yearId = params?.yearId ?? "0";
  const subjectId = parseInt(params?.subjectId ?? "0");
  const providerId = parseInt(params?.providerId ?? "0");

  const { data: providers = [] } = useQuery<ContentProvider[]>({
    queryKey: ["academic", "providers", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/providers`),
  });
  const provider = providers.find(p => p.id === providerId);

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ["academic", "units", "provider", providerId],
    queryFn: () => apiFetch(`/academic/providers/${providerId}/units`),
    enabled: !!providerId,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}/subjects/${subjectId}/providers`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {provider?.name ?? "الجهات التعليمية"}
        </button>
      </Link>
      <SectionTitle icon={<Layers className="w-5 h-5" />} title={provider?.name ?? "..."} subtitle="اختر الوحدة أو الفصل" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && units.length === 0 && <EmptyState icon={<Layers className="w-8 h-8" />} message="لا توجد وحدات متاحة" />}
      <div className="space-y-2">
        {units.map(unit => (
          <Link key={unit.id} href={`/videos/years/${yearId}/subjects/${subjectId}/providers/${providerId}/units/${unit.id}/lessons`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all group flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{unit.name}</h3>
                {unit.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{unit.description}</p>}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

// ── Lessons Page (under subject unit) ──────────────────────────────────────
export function AcademicSubjectLessonsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/units/:unitId/lessons");
  const yearId = params?.yearId ?? "0";
  const subjectId = params?.subjectId ?? "0";
  const unitId = parseInt(params?.unitId ?? "0");

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["academic", "units", "subject", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/units`),
  });
  const unit = units.find(u => u.id === unitId);

  const { data: lessons = [], isLoading } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId],
    queryFn: () => apiFetch(`/academic/units/${unitId}/lessons`),
    enabled: !!unitId,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}/subjects/${subjectId}/units`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {unit?.name ?? "الوحدات"}
        </button>
      </Link>
      <SectionTitle icon={<PlayCircle className="w-5 h-5" />} title={unit?.name ?? "..."} subtitle="اختر الدرس" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && lessons.length === 0 && <EmptyState icon={<PlayCircle className="w-8 h-8" />} message="لا توجد دروس متاحة" />}
      <LessonsList lessons={lessons} basePath={`/videos/years/${yearId}/subjects/${subjectId}/units/${unitId}`} />
    </PageWrapper>
  );
}

// ── Lessons Page (under provider unit) ─────────────────────────────────────
export function AcademicProviderLessonsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/providers/:providerId/units/:unitId/lessons");
  const yearId = params?.yearId ?? "0";
  const subjectId = params?.subjectId ?? "0";
  const providerId = params?.providerId ?? "0";
  const unitId = parseInt(params?.unitId ?? "0");

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["academic", "units", "provider", providerId],
    queryFn: () => apiFetch(`/academic/providers/${providerId}/units`),
  });
  const unit = units.find(u => u.id === unitId);

  const { data: lessons = [], isLoading } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId],
    queryFn: () => apiFetch(`/academic/units/${unitId}/lessons`),
    enabled: !!unitId,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}/subjects/${subjectId}/providers/${providerId}/units`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {unit?.name ?? "الوحدات"}
        </button>
      </Link>
      <SectionTitle icon={<PlayCircle className="w-5 h-5" />} title={unit?.name ?? "..."} subtitle="اختر الدرس" />
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {!isLoading && lessons.length === 0 && <EmptyState icon={<PlayCircle className="w-8 h-8" />} message="لا توجد دروس متاحة" />}
      <LessonsList lessons={lessons} basePath={`/videos/years/${yearId}/subjects/${subjectId}/providers/${providerId}/units/${unitId}`} />
    </PageWrapper>
  );
}

function LessonsList({ lessons, basePath }: { lessons: Lesson[]; basePath: string }) {
  return (
    <div className="space-y-2">
      {lessons.map(lesson => (
        <Link key={lesson.id} href={`${basePath}/lessons/${lesson.id}`}>
          <motion.div whileHover={{ y: -2 }} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all group">
            <div className="flex items-center gap-3">
              {lesson.video?.thumbnailUrl ? (
                <div className="w-16 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={lesson.video.thumbnailUrl} alt={lesson.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-12 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center flex-shrink-0">
                  <PlayCircle className="w-7 h-7 text-sky-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">{lesson.title}</h3>
                {lesson.video && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {lesson.video.instructor}
                    <Clock className="w-3 h-3 mr-1" /> {lesson.video.duration} دقيقة
                  </div>
                )}
              </div>
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-4 h-4 text-white" />
              </div>
            </div>
          </motion.div>
        </Link>
      ))}
    </div>
  );
}

// ── Lesson Detail Page ──────────────────────────────────────────────────────
export function AcademicLessonPage() {
  const [location] = useLocation();

  const lessonId = (() => {
    const match = location.match(/\/lessons\/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  })();

  const backPath = location.replace(/\/lessons\/\d+$/, "/lessons");

  const { data: lesson, isLoading } = useQuery<Lesson>({
    queryKey: ["academic", "lesson", lessonId],
    queryFn: () => apiFetch(`/academic/lessons/${lessonId}`),
    enabled: !!lessonId,
  });

  return (
    <PageWrapper>
      <Link href={backPath}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> الدروس
        </button>
      </Link>
      {isLoading && <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>}
      {lesson && (
        <div className="space-y-6" dir="rtl">
          <div>
            <h1 className="font-display font-black text-2xl text-foreground mb-2">{lesson.title}</h1>
            {lesson.description && <p className="text-muted-foreground">{lesson.description}</p>}
          </div>
          {lesson.video ? (
            <div className="space-y-4">
              <div className="rounded-3xl overflow-hidden bg-black aspect-video">
                <video
                  src={lesson.video.videoUrl}
                  controls
                  className="w-full h-full"
                  poster={lesson.video.thumbnailUrl ?? undefined}
                />
              </div>
              <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-blue-50 flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{lesson.video.title}</p>
                  <p className="text-xs text-muted-foreground">{lesson.video.instructor} · {lesson.video.duration} دقيقة</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-12 text-center text-muted-foreground">
              <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا يوجد فيديو مرتبط بهذا الدرس بعد.</p>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}

// ── Default export: Years page ──────────────────────────────────────────────
export default AcademicYearsPage;
