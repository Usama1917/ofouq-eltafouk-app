import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  ChevronLeft,
  Clock,
  GraduationCap,
  ImagePlus,
  Layers,
  Play,
  PlayCircle,
  Send,
  User,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import CustomVideoPlayer from "@/components/custom-video-player";

interface AcademicYear {
  id: number;
  name: string;
  description: string;
}

interface Subject {
  id: number;
  name: string;
  icon: string;
  description: string;
}

interface Unit {
  id: number;
  name: string;
  description: string;
}

interface Lesson {
  id: number;
  title: string;
  description: string;
  video?: {
    id: number;
    title: string;
    videoUrl: string;
    thumbnailUrl?: string;
    duration: number;
    instructor: string;
    videoType: "youtube" | "upload";
    publishStatus: "draft" | "published";
  } | null;
}

interface StudentSubscriptionRequest {
  id: number;
  code: string;
  codeImageUrl?: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string;
  submittedAt: string;
  reviewedAt?: string | null;
  year: {
    id: number;
    name: string;
  };
  subject: {
    id: number;
    name: string;
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type") && options?.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = localStorage.getItem("ofouq_token");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new Error("تعذر الوصول إلى الخادم، تأكد من تشغيل الخدمة.");
  }

  if (res.status === 204) return undefined as T;

  const raw = await res.text();
  const payload = raw
    ? (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })()
    : null;

  if (!res.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? String((payload as any).error) : `API error ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -14 }}
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
      {subtitle ? <p className="text-sm text-muted-foreground mr-13">{subtitle}</p> : null}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card p-10 text-center text-muted-foreground">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3 opacity-40">{icon}</div>
      <p>{message}</p>
    </div>
  );
}

function RequestStatusBadge({ status }: { status: StudentSubscriptionRequest["status"] }) {
  const styles =
    status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : status === "rejected"
      ? "bg-rose-100 text-rose-700"
      : "bg-amber-100 text-amber-700";

  const label = status === "approved" ? "مقبول" : status === "rejected" ? "مرفوض" : "قيد المراجعة";

  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${styles}`}>{label}</span>;
}

export function AcademicYearsPage() {
  const { data: years = [], isLoading, isError, error, refetch, isFetching } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/academic/years"),
  });

  return (
    <PageWrapper>
      <SectionTitle icon={<GraduationCap className="w-5 h-5" />} title="المحتوى الأكاديمي" subtitle="اختر السنة الدراسية" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {isError ? (
        <div className="glass-card p-6 text-center space-y-3">
          <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "تعذر تحميل السنوات الدراسية"}</p>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/15 transition-all disabled:opacity-60"
          >
            {isFetching ? "جاري إعادة المحاولة..." : "إعادة المحاولة"}
          </button>
        </div>
      ) : null}
      {!isLoading && years.length === 0 ? <EmptyState icon={<GraduationCap className="w-8 h-8" />} message="لا توجد سنوات منشورة بعد" /> : null}

      <div className="space-y-3">
        {years.map((year) => (
          <Link key={year.id} href={`/videos/years/${year.id}`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-5 cursor-pointer hover:border-primary/30 transition-all flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground">{year.name}</h3>
                {year.description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{year.description}</p> : null}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

export function AcademicSubjectsPage() {
  const [, params] = useRoute("/videos/years/:yearId");
  const yearId = Number.parseInt(params?.yearId ?? "0", 10);

  const { data: years = [] } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/academic/years"),
  });
  const year = years.find((item) => item.id === yearId);

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
    enabled: Number.isFinite(yearId) && yearId > 0,
  });

  return (
    <PageWrapper>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/videos">
          <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors">
            <ArrowLeft className="w-4 h-4 rotate-180" /> السنوات
          </button>
        </Link>
        <Link href={`/videos/years/${yearId}/subscribe`}>
          <button className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/15 transition-all whitespace-nowrap">
            الاشتراك في مادة جديدة
          </button>
        </Link>
      </div>

      <SectionTitle icon={<BookOpen className="w-5 h-5" />} title={year?.name ?? "المواد"} subtitle="اختر المادة" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {!isLoading && subjects.length === 0 ? <EmptyState icon={<BookOpen className="w-8 h-8" />} message="لا توجد مواد منشورة" /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {subjects.map((subject) => (
          <Link key={subject.id} href={`/videos/years/${yearId}/subjects/${subject.id}/units`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-5 cursor-pointer hover:border-primary/30 transition-all flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center text-2xl">{subject.icon || "📚"}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground">{subject.name}</h3>
                {subject.description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{subject.description}</p> : null}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

export function AcademicSubscriptionRequestPage() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/videos/years/:yearId/subscribe");
  const yearId = Number.parseInt(params?.yearId ?? "0", 10);

  const [subjectId, setSubjectId] = useState<number>(0);
  const [code, setCode] = useState("");
  const [codeImage, setCodeImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, setLocation]);

  const { data: years = [] } = useQuery<AcademicYear[]>({
    queryKey: ["academic", "years"],
    queryFn: () => apiFetch("/academic/years"),
  });
  const year = years.find((item) => item.id === yearId);

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
    enabled: Number.isFinite(yearId) && yearId > 0,
  });

  const { data: requests = [], isLoading: requestsLoading, refetch: refetchRequests } = useQuery<StudentSubscriptionRequest[]>({
    queryKey: ["academic", "subscription-requests", "me"],
    queryFn: () => apiFetch("/academic/subscription-requests/me"),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!subjectId && subjects.length > 0) {
      setSubjectId(subjects[0].id);
    }
  }, [subjectId, subjects]);

  async function handleSubmit() {
    const finalCode = code.trim();
    if (!subjectId) {
      setErrorMessage("اختر المادة أولًا");
      return;
    }
    if (!finalCode) {
      setErrorMessage("اكتب كود الكتاب أولًا");
      return;
    }
    if (!codeImage) {
      setErrorMessage("صورة الكود مطلوبة");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      let codeImageUrl: string | null = null;

      if (codeImage) {
        const fd = new FormData();
        fd.append("image", codeImage);
        const uploadResult = await apiFetch<{ url: string }>("/academic/subscription-requests/upload-code-image", {
          method: "POST",
          body: fd,
        });
        codeImageUrl = uploadResult.url;
      }

      const result = await apiFetch<{ message?: string }>("/academic/subscription-requests", {
        method: "POST",
        body: JSON.stringify({
          yearId,
          subjectId,
          code: finalCode,
          codeImageUrl,
        }),
      });

      setSuccessMessage(
        result.message ??
          "تم إرسال طلبك بنجاح وهو الآن قيد المراجعة. سيتم مراجعته خلال يوم عمل واحد كحد أقصى. سيقوم المشرف بالتحقق من الكود وبياناتك ثم قبول الطلب أو رفضه.",
      );
      setCode("");
      setCodeImage(null);
      await refetchRequests();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> المواد
        </button>
      </Link>

      <SectionTitle
        icon={<BookOpen className="w-5 h-5" />}
        title={year ? `اشتراك مادة جديدة - ${year.name}` : "اشتراك مادة جديدة"}
        subtitle="أدخل كود الكتاب وارفع صورة الكود لإرسال الطلب"
      />

      <div className="glass-card p-5 md:p-6 space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground">السنة الدراسية</label>
            <input
              value={year?.name ?? ""}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-muted/30 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-muted-foreground">المادة</label>
            <select
              value={subjectId || ""}
              onChange={(event) => setSubjectId(Number.parseInt(event.target.value, 10) || 0)}
              className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/70 text-sm outline-none focus:border-primary/50"
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-muted-foreground">كود الكتاب</label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="مثال: 1106092724"
            className="w-full px-3 py-2.5 rounded-xl border border-white/60 bg-white/70 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-muted-foreground">صورة الكود <span className="text-rose-600">*</span></label>
          <label className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/10 transition-all">
            <ImagePlus className="w-4 h-4" />
            {codeImage ? codeImage.name : "ارفع الصورة أو التقطها من الكاميرا"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => setCodeImage(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {errorMessage ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</div> : null}

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700 leading-relaxed">
            <div className="font-bold flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              تم إرسال الطلب
            </div>
            {successMessage}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || subjectsLoading || !yearId}
          className="btn-primary py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {submitting ? "جاري إرسال الطلب..." : "إرسال طلب الاشتراك"}
        </button>
      </div>

      <div className="glass-card p-5 space-y-3">
        <h3 className="font-bold text-foreground text-sm">طلباتك السابقة</h3>
        {requestsLoading ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : null}
        {!requestsLoading && requests.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد طلبات حتى الآن.</p> : null}
        <div className="space-y-2">
          {requests.map((request) => (
            <div key={request.id} className="rounded-xl border border-white/50 bg-white/50 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{request.subject.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {request.year.name} · {new Date(request.submittedAt).toLocaleDateString("ar-EG")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">الكود: {request.code}</p>
              </div>
              <RequestStatusBadge status={request.status} />
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}

export function AcademicUnitsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/units");
  const yearId = params?.yearId ?? "0";
  const subjectId = Number.parseInt(params?.subjectId ?? "0", 10);

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["academic", "subjects", yearId],
    queryFn: () => apiFetch(`/academic/years/${yearId}/subjects`),
    enabled: !!yearId,
  });
  const subject = subjects.find((item) => item.id === subjectId);

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ["academic", "units", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/units`),
    enabled: Number.isFinite(subjectId) && subjectId > 0,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {subject?.name ?? "المواد"}
        </button>
      </Link>

      <SectionTitle icon={<Layers className="w-5 h-5" />} title={subject?.name ?? "الوحدات"} subtitle="اختر الوحدة / الفصل / الباب" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {!isLoading && units.length === 0 ? <EmptyState icon={<Layers className="w-8 h-8" />} message="لا توجد وحدات منشورة" /> : null}

      <div className="space-y-2">
        {units.map((unit) => (
          <Link key={unit.id} href={`/videos/years/${yearId}/subjects/${subjectId}/units/${unit.id}/lessons`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{unit.name}</h3>
                {unit.description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{unit.description}</p> : null}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

export function AcademicLessonsPage() {
  const [, params] = useRoute("/videos/years/:yearId/subjects/:subjectId/units/:unitId/lessons");
  const yearId = params?.yearId ?? "0";
  const subjectId = params?.subjectId ?? "0";
  const unitId = Number.parseInt(params?.unitId ?? "0", 10);

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["academic", "units", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/units`),
    enabled: !!subjectId,
  });
  const unit = units.find((item) => item.id === unitId);

  const { data: lessons = [], isLoading } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId],
    queryFn: () => apiFetch(`/academic/units/${unitId}/lessons`),
    enabled: Number.isFinite(unitId) && unitId > 0,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}/subjects/${subjectId}/units`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {unit?.name ?? "الوحدات"}
        </button>
      </Link>

      <SectionTitle icon={<PlayCircle className="w-5 h-5" />} title={unit?.name ?? "الدروس"} subtitle="اختر الدرس" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {!isLoading && lessons.length === 0 ? <EmptyState icon={<PlayCircle className="w-8 h-8" />} message="لا توجد دروس منشورة" /> : null}

      <div className="space-y-2">
        {lessons.map((lesson) => (
          <Link key={lesson.id} href={`/videos/years/${yearId}/subjects/${subjectId}/units/${unitId}/lessons/${lesson.id}`}>
            <motion.div whileHover={{ y: -2 }} className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-all flex items-center gap-3">
              {lesson.video?.thumbnailUrl ? (
                <div className="w-16 h-12 rounded-xl overflow-hidden flex-shrink-0">
                  <img src={lesson.video.thumbnailUrl} alt={lesson.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                  <PlayCircle className="w-7 h-7 text-sky-400" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">{lesson.title}</h3>
                {lesson.video ? (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User className="w-3 h-3" /> {lesson.video.instructor}
                    <Clock className="w-3 h-3 mr-1" /> {lesson.video.duration} دقيقة
                  </div>
                ) : null}
              </div>

              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <Play className="w-4 h-4 text-white" />
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </PageWrapper>
  );
}

export function AcademicLessonPage() {
  const { user } = useAuth();
  const [location] = useLocation();

  const lessonId = (() => {
    const match = location.match(/\/lessons\/(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  })();

  const backPath = location.replace(/\/lessons\/\d+$/, "/lessons");

  const { data: lesson, isLoading } = useQuery<Lesson>({
    queryKey: ["academic", "lesson", lessonId],
    queryFn: () => apiFetch(`/academic/lessons/${lessonId}`),
    enabled: lessonId > 0,
  });

  return (
    <PageWrapper>
      <Link href={backPath}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> الدروس
        </button>
      </Link>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}

      {lesson ? (
        <div className="space-y-6" dir="rtl">
          <div>
            <h1 className="font-display font-black text-2xl text-foreground mb-2">{lesson.title}</h1>
            {lesson.description ? <p className="text-muted-foreground">{lesson.description}</p> : null}
          </div>

          {lesson.video ? (
            <div className="space-y-4">
              <CustomVideoPlayer
                videoUrl={lesson.video.videoUrl}
                videoType={lesson.video.videoType}
                title={lesson.video.title || lesson.title}
                posterUrl={lesson.video.thumbnailUrl ?? null}
                watermarkText={user ? `${user.name} - ${user.email}` : undefined}
              />

              <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{lesson.video.title}</p>
                  <p className="text-xs text-muted-foreground">{lesson.video.instructor} · {lesson.video.duration} دقيقة</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon={<PlayCircle className="w-8 h-8" />} message="لا يوجد فيديو مرتبط بهذا الدرس" />
          )}
        </div>
      ) : null}
    </PageWrapper>
  );
}

export default AcademicYearsPage;
