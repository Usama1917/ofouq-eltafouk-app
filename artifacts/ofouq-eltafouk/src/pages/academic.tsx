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
  Lock,
  LockOpen,
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
  accessStatus?: "none" | "pending" | "approved" | "rejected";
  isLocked?: boolean;
  canRequestSubscription?: boolean;
  latestRequest?: {
    id: number;
    status: "pending" | "approved" | "rejected";
    submittedAt: string;
    reviewedAt?: string | null;
    reviewNotes: string;
  } | null;
  subscriptionRecord?: {
    id: number;
    status: string;
    updatedAt: string;
  } | null;
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
    posterUrl?: string;
    duration: number;
    instructor: string;
    videoType: "youtube" | "upload";
    publishStatus: "draft" | "published";
    segments?: {
      id: number;
      title: string;
      startSeconds: number;
      segmentType: "questions" | "parts" | "topics";
      orderIndex: number;
      thumbnailUrl?: string;
    }[];
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

function formatVideoDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hh = Math.floor(safe / 3600);
  const mm = Math.floor((safe % 3600) / 60);
  const ss = safe % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
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
    <div className="mb-8 md:mb-10">
      <div className="mb-2 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
        <h1 className="font-display font-black text-2xl text-foreground">{title}</h1>
      </div>
      {subtitle ? <p className="mr-14 text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
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

function subjectAccessLabel(status: Subject["accessStatus"]) {
  if (status === "approved") return "مشترك";
  if (status === "pending") return "قيد المراجعة";
  if (status === "rejected") return "مرفوض";
  return "غير مشترك";
}

function subjectAccessBadgeStyle(status: Subject["accessStatus"]) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

const YEAR_CARD_ACCENTS = [
  {
    icon: "bg-blue-50 border-blue-200/80 text-blue-600",
    arrow: "text-blue-500",
  },
  {
    icon: "bg-emerald-50 border-emerald-200/80 text-emerald-600",
    arrow: "text-emerald-500",
  },
  {
    icon: "bg-amber-50 border-amber-200/80 text-amber-600",
    arrow: "text-amber-500",
  },
  {
    icon: "bg-violet-50 border-violet-200/80 text-violet-600",
    arrow: "text-violet-500",
  },
] as const;

function yearAccent(index: number) {
  return YEAR_CARD_ACCENTS[index % YEAR_CARD_ACCENTS.length];
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

      <div className="grid grid-cols-1 gap-5 md:gap-6 xl:grid-cols-2 items-stretch">
        {years.map((year, index) => {
          const accent = yearAccent(index);
          return (
            <Link key={year.id} href={`/videos/years/${year.id}`} className="block h-full">
              <motion.div
                whileHover={{ scale: 1.01 }}
                className="glass-card no-lift relative overflow-hidden p-6 md:p-7 min-h-[118px] cursor-pointer transition-all flex items-center gap-4 border-white/70 hover:border-white"
              >
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground leading-snug">{year.name}</h3>
                  </div>
                  {year.description ? <p className="text-xs text-muted-foreground truncate">{year.description}</p> : null}
                </div>
                <ChevronLeft className={`w-4 h-4 flex-shrink-0 ${accent.arrow}`} />
              </motion.div>
            </Link>
          );
        })}
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
      <div className="mb-6 flex items-center justify-between gap-3">
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

      <div className="grid grid-cols-1 gap-4 md:gap-5 sm:grid-cols-2">
        {subjects.map((subject) => {
          const status = subject.accessStatus ?? (subject.isLocked ? "none" : "approved");
          const isLocked = Boolean(subject.isLocked);
          const subscribeHref = `/videos/years/${yearId}/subscribe?subjectId=${subject.id}`;

          if (!isLocked) {
            return (
              <Link key={subject.id} href={`/videos/years/${yearId}/subjects/${subject.id}/units`}>
                <motion.div whileHover={{ y: -2 }} className="glass-card p-6 cursor-pointer hover:border-primary/30 transition-all flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 flex items-center justify-center text-2xl">{subject.icon || "📚"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-foreground">{subject.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${subjectAccessBadgeStyle(status)}`}>
                        {subjectAccessLabel(status)}
                      </span>
                    </div>
                    {subject.description ? <p className="text-xs text-muted-foreground mt-1 truncate">{subject.description}</p> : null}
                  </div>
                  <LockOpen className="w-4 h-4 text-emerald-600" />
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              </Link>
            );
          }

          return (
            <motion.div key={subject.id} className="glass-card p-6 border border-amber-200/60 bg-amber-50/40 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-2xl opacity-80">
                {subject.icon || "📚"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-foreground">{subject.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${subjectAccessBadgeStyle(status)}`}>
                    {subjectAccessLabel(status)}
                  </span>
                </div>
                {subject.description ? <p className="text-xs text-muted-foreground mt-1">{subject.description}</p> : null}
                {status === "rejected" && subject.latestRequest?.reviewNotes ? (
                  <p className="text-xs text-rose-700 mt-1">ملاحظة المراجعة: {subject.latestRequest.reviewNotes}</p>
                ) : null}
                <div className="mt-2">
                  <Link href={subscribeHref}>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all">
                      {status === "pending" ? "متابعة الطلب" : status === "rejected" ? "إعادة إرسال الطلب" : "طلب اشتراك"}
                    </button>
                  </Link>
                </div>
              </div>
              <Lock className="w-4 h-4 text-amber-700 mt-1" />
            </motion.div>
          );
        })}
      </div>
    </PageWrapper>
  );
}

export function AcademicSubscriptionRequestPage() {
  const { token } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/videos/years/:yearId/subscribe");
  const yearId = Number.parseInt(params?.yearId ?? "0", 10);
  const preselectedSubjectId = Number.parseInt(new URLSearchParams(location.split("?")[1] ?? "").get("subjectId") ?? "0", 10);

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
    if (subjects.length === 0) {
      if (subjectId !== 0) setSubjectId(0);
      return;
    }

    const currentIsValid = subjects.some((subject) => subject.id === subjectId);
    if (currentIsValid) return;

    const preferred = Number.isFinite(preselectedSubjectId) && preselectedSubjectId > 0
      ? subjects.find((subject) => subject.id === preselectedSubjectId)
      : undefined;

    const firstRequestable = subjects.find((subject) => {
      const status = subject.accessStatus ?? (subject.isLocked ? "none" : "approved");
      return status !== "approved" && status !== "pending";
    });

    setSubjectId(preferred?.id ?? firstRequestable?.id ?? subjects[0].id);
  }, [preselectedSubjectId, subjectId, subjects]);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const selectedSubjectStatus = selectedSubject?.accessStatus ?? (selectedSubject?.isLocked ? "none" : "approved");
  const selectedSubjectStatusLabel = subjectAccessLabel(selectedSubjectStatus);
  const hasRequestableSubjects = subjects.some((subject) => {
    const status = subject.accessStatus ?? (subject.isLocked ? "none" : "approved");
    return status !== "approved" && status !== "pending";
  });

  useEffect(() => {
    if (!selectedSubject && subjects.length > 0) {
      setSubjectId(subjects[0].id);
    }
  }, [selectedSubject, subjects]);

  async function handleSubmit() {
    const finalCode = code.trim();
    if (!selectedSubject) {
      setErrorMessage("اختر المادة أولًا");
      return;
    }
    if (selectedSubjectStatus === "approved") {
      setErrorMessage("أنت مشترك بالفعل في هذه المادة");
      return;
    }
    if (selectedSubjectStatus === "pending") {
      setErrorMessage("لديك طلب اشتراك قيد المراجعة لهذه المادة");
      return;
    }
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
          "تم إرسال طلبك بنجاح وهو الآن قيد المراجعة. سيتم مراجعته خلال يوم عمل واحد كحد أقصى.",
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

      <div className="glass-card p-5 md:p-6 space-y-4 mb-8">
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
                  {subject.name} - {subjectAccessLabel(subject.accessStatus ?? (subject.isLocked ? "none" : "approved"))}
                </option>
              ))}
            </select>
            {selectedSubject ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">حالة المادة:</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${subjectAccessBadgeStyle(selectedSubjectStatus)}`}>
                  {selectedSubjectStatusLabel}
                </span>
              </div>
            ) : null}
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
          disabled={submitting || subjectsLoading || !yearId || !hasRequestableSubjects || selectedSubjectStatus === "approved" || selectedSubjectStatus === "pending"}
          className="btn-primary py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {submitting
            ? "جاري إرسال الطلب..."
            : selectedSubjectStatus === "pending"
            ? "الطلب قيد المراجعة"
            : selectedSubjectStatus === "approved"
            ? "أنت مشترك بالفعل"
            : "إرسال طلب الاشتراك"}
        </button>

        {!hasRequestableSubjects ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            جميع المواد في هذه السنة إما مشترك بها بالفعل أو لديها طلبات قيد المراجعة.
          </div>
        ) : null}
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

  const { data: units = [], isLoading, isError, error } = useQuery<Unit[]>({
    queryKey: ["academic", "units", subjectId],
    queryFn: () => apiFetch(`/academic/subjects/${subjectId}/units`),
    enabled: Number.isFinite(subjectId) && subjectId > 0,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {subject?.name ?? "المواد"}
        </button>
      </Link>

      <SectionTitle icon={<Layers className="w-5 h-5" />} title={subject?.name ?? "الوحدات"} subtitle="اختر الوحدة / الفصل / الباب" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {isError ? (
        <div className="glass-card p-6 text-center space-y-3">
          <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "تعذر تحميل الوحدات"}</p>
          <Link href={`/videos/years/${yearId}/subscribe?subjectId=${subjectId}`}>
            <button className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/15 transition-all">
              طلب اشتراك في المادة
            </button>
          </Link>
        </div>
      ) : null}
      {!isLoading && !isError && units.length === 0 ? <EmptyState icon={<Layers className="w-8 h-8" />} message="لا توجد وحدات منشورة" /> : null}

      <div className={`mt-3 space-y-5 md:space-y-6 ${isError ? "hidden" : ""}`}>
        {units.map((unit) => (
          <Link
            key={unit.id}
            href={`/videos/years/${yearId}/subjects/${subjectId}/units/${unit.id}/lessons`}
            className="block"
          >
            <motion.div
              whileHover={{ y: -1 }}
              className="glass-card p-5 md:p-6 min-h-[106px] cursor-pointer hover:border-primary/30 transition-all flex items-center gap-4"
            >
              <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center">
                <Layers className="w-5 h-5 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground leading-snug">{unit.name}</h3>
                {unit.description ? <p className="text-xs text-muted-foreground mt-1 truncate">{unit.description}</p> : null}
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

  const { data: lessons = [], isLoading, isError, error } = useQuery<Lesson[]>({
    queryKey: ["academic", "lessons", unitId],
    queryFn: () => apiFetch(`/academic/units/${unitId}/lessons`),
    enabled: Number.isFinite(unitId) && unitId > 0,
  });

  return (
    <PageWrapper>
      <Link href={`/videos/years/${yearId}/subjects/${subjectId}/units`}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> {unit?.name ?? "الوحدات"}
        </button>
      </Link>

      <SectionTitle icon={<PlayCircle className="w-5 h-5" />} title={unit?.name ?? "الدروس"} subtitle="اختر الدرس" />

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {isError ? (
        <div className="glass-card p-6 text-center space-y-3">
          <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "تعذر تحميل الدروس"}</p>
          <Link href={`/videos/years/${yearId}/subscribe?subjectId=${subjectId}`}>
            <button className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/15 transition-all">
              طلب اشتراك في المادة
            </button>
          </Link>
        </div>
      ) : null}
      {!isLoading && !isError && lessons.length === 0 ? <EmptyState icon={<PlayCircle className="w-8 h-8" />} message="لا توجد دروس منشورة" /> : null}

      <div className={`mt-3 space-y-5 md:space-y-6 ${isError ? "hidden" : ""}`}>
        {lessons.map((lesson) => (
          <Link
            key={lesson.id}
            href={`/videos/years/${yearId}/subjects/${subjectId}/units/${unitId}/lessons/${lesson.id}`}
            className="block"
          >
            <motion.div
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.995 }}
              className="glass-card group rounded-2xl p-4 md:p-5 min-h-[108px] cursor-pointer border border-white/60 hover:border-primary/35 hover:bg-white/80 transition-all flex items-center gap-4"
            >
              {lesson.video?.thumbnailUrl ? (
                <div className="h-14 w-[92px] rounded-xl overflow-hidden flex-shrink-0 border border-white/70 bg-slate-100">
                  <img
                    src={lesson.video.thumbnailUrl}
                    alt={lesson.title}
                    className="w-full h-full object-cover object-center"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div className="h-14 w-[92px] rounded-xl bg-sky-100/90 border border-sky-200/70 flex items-center justify-center flex-shrink-0">
                  <PlayCircle className="w-6 h-6 text-sky-500" strokeWidth={2.2} />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm leading-snug truncate">{lesson.title}</h3>
                {lesson.video ? (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3.5 h-3.5" strokeWidth={2.1} /> {lesson.video.instructor}
                    <Clock className="w-3.5 h-3.5 mr-1" strokeWidth={2.1} /> {formatVideoDuration(lesson.video.duration)}
                  </div>
                ) : null}
              </div>

              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform self-center">
                <Play className="w-4 h-4 text-white" strokeWidth={2.4} />
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

  const yearId = (() => {
    const match = location.match(/\/videos\/years\/(\d+)\/subjects/);
    return match ? match[1] : "0";
  })();
  const subjectId = (() => {
    const match = location.match(/\/subjects\/(\d+)\/units/);
    return match ? match[1] : "0";
  })();
  const { data: lesson, isLoading, isError, error } = useQuery<Lesson>({
    queryKey: ["academic", "lesson", lessonId],
    queryFn: () => apiFetch(`/academic/lessons/${lessonId}`),
    enabled: lessonId > 0,
  });
  return (
    <PageWrapper>
      <Link href={backPath}>
        <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 rotate-180" /> الدروس
        </button>
      </Link>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div> : null}
      {isError ? (
        <div className="glass-card p-6 text-center space-y-3">
          <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "تعذر تحميل الدرس"}</p>
          <Link href={`/videos/years/${yearId}/subscribe?subjectId=${subjectId}`}>
            <button className="px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/15 transition-all">
              طلب اشتراك في المادة
            </button>
          </Link>
        </div>
      ) : null}

      {lesson ? (
        <div className="space-y-7 md:space-y-8" dir="rtl">
          <div>
            <h1 className="font-display font-black text-2xl text-foreground mb-2.5">{lesson.title}</h1>
            {lesson.description ? <p className="text-muted-foreground leading-relaxed">{lesson.description}</p> : null}
          </div>

          {lesson.video ? (
            <div className="space-y-5">
              <div className="glass-card p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 border border-primary/20 bg-primary/5">
                {lesson.video.thumbnailUrl ? (
                  <div className="h-14 w-[88px] rounded-xl overflow-hidden flex-shrink-0 border border-white/70 bg-slate-100">
                    <img
                      src={lesson.video.thumbnailUrl}
                      alt={lesson.video.title}
                      className="w-full h-full object-cover object-center"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : (
                  <div className="h-14 w-[88px] rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Play className="w-6 h-6 text-primary" strokeWidth={2.2} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground text-sm sm:text-base">{lesson.video.title}</p>
                  <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{lesson.video.instructor} · {formatVideoDuration(lesson.video.duration)}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Play className="w-5 h-5 text-white" strokeWidth={2.3} />
                </div>
              </div>

              <CustomVideoPlayer
                videoUrl={lesson.video.videoUrl}
                videoType={lesson.video.videoType}
                title={lesson.video.title}
                subtitle={lesson.video.instructor || ""}
                posterUrl={lesson.video.posterUrl ?? null}
                segments={lesson.video.segments ?? []}
                watermarkText={user ? `${user.name} - ${user.email}` : undefined}
              />
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
