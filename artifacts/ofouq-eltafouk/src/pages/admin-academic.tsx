import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Eye,
  EyeOff,
  GraduationCap,
  Layers,
  PlayCircle,
  Plus,
  Trash2,
  Upload,
  Video,
  Youtube,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

type Level = "years" | "subjects" | "units" | "lessons";

type Breadcrumb = {
  level: Level;
  label: string;
  yearId?: number;
  subjectId?: number;
  unitId?: number;
};

interface AcademicYear {
  id: number;
  name: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Subject {
  id: number;
  yearId: number;
  name: string;
  icon: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Unit {
  id: number;
  subjectId: number;
  name: string;
  description: string;
  orderIndex: number;
  isPublished: boolean;
}

interface Lesson {
  id: number;
  unitId: number;
  title: string;
  description: string;
  videoId?: number;
  orderIndex: number;
  isPublished: boolean;
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

type UploadKind = "video" | "thumbnail";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const YEAR_ITEM_TONES = [
  {
    top: "bg-blue-500/80",
    iconWrapper: "bg-blue-50 border-blue-200/70 text-blue-600",
  },
  {
    top: "bg-emerald-500/80",
    iconWrapper: "bg-emerald-50 border-emerald-200/70 text-emerald-600",
  },
  {
    top: "bg-amber-500/80",
    iconWrapper: "bg-amber-50 border-amber-200/70 text-amber-600",
  },
  {
    top: "bg-violet-500/80",
    iconWrapper: "bg-violet-50 border-violet-200/70 text-violet-600",
  },
] as const;

function yearItemTone(index: number) {
  return YEAR_ITEM_TONES[index % YEAR_ITEM_TONES.length];
}

async function apiFetch<T>(token: string | null, path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type") && options?.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers,
  });

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

function ItemCard({
  icon,
  title,
  description,
  isPublished,
  badge,
  onOpen,
  onRename,
  onTogglePublish,
  onDelete,
  onMoveUp,
  onMoveDown,
  containerClassName,
  iconWrapperClassName,
  topAccentClassName,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  isPublished: boolean;
  badge?: React.ReactNode;
  onOpen?: () => void;
  onRename: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  containerClassName?: string;
  iconWrapperClassName?: string;
  topAccentClassName?: string;
}) {
  return (
    <div className={`glass-card no-lift relative overflow-hidden p-4 min-h-[92px] flex items-center gap-3 ${!isPublished ? "opacity-75" : ""} ${containerClassName ?? ""}`}>
      {topAccentClassName ? <div className={`absolute inset-x-0 top-0 h-1 ${topAccentClassName}`} /> : null}
      <div className={`w-10 h-10 rounded-xl border bg-muted/50 flex items-center justify-center flex-shrink-0 ${iconWrapperClassName ?? ""}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-foreground truncate">{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isPublished ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {isPublished ? "منشور" : "مسودة"}
          </span>
          {badge}
        </div>
        {description ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p> : null}
      </div>
      <div className="flex items-center gap-1.5">
        {onMoveUp ? (
          <button onClick={onMoveUp} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        ) : null}
        {onMoveDown ? (
          <button onClick={onMoveDown} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <button onClick={onRename} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button onClick={onTogglePublish} className={`w-7 h-7 rounded-lg flex items-center justify-center ${isPublished ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => {
            if (confirm("هل أنت متأكد من الحذف؟")) onDelete();
          }}
          className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {onOpen ? (
          <button onClick={onOpen} className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:opacity-90">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function useSorted<T extends { orderIndex: number; id: number }>(items: T[]) {
  return useMemo(() => {
    return [...items].sort((a, b) => (a.orderIndex - b.orderIndex) || (a.id - b.id));
  }, [items]);
}

export function AcademicTab() {
  const qc = useQueryClient();
  const { token } = useAuth();

  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ level: "years", label: "السنوات الدراسية" }]);
  const [showAdd, setShowAdd] = useState(false);

  const [yearForm, setYearForm] = useState({ name: "", description: "" });
  const [subjectForm, setSubjectForm] = useState({ name: "", icon: "📚", description: "" });
  const [unitForm, setUnitForm] = useState({ name: "", description: "" });
  const [lessonForm, setLessonForm] = useState({
    title: "",
    description: "",
    isPublished: true,
    videoType: "youtube" as "youtube" | "upload",
    videoUrl: "",
    videoTitle: "",
    videoDescription: "",
    instructor: "",
    duration: "",
    publishStatus: "published" as "draft" | "published",
    thumbnailUrl: "",
  });
  const [lessonVideoFile, setLessonVideoFile] = useState<File | null>(null);
  const [lessonThumbnailFile, setLessonThumbnailFile] = useState<File | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);

  const current = crumbs[crumbs.length - 1];

  const yearsQ = useQuery<AcademicYear[]>({
    queryKey: ["admin", "academic", "years"],
    queryFn: () => apiFetch(token, "/admin/academic/years"),
    enabled: !!token,
  });

  const subjectsQ = useQuery<Subject[]>({
    queryKey: ["admin", "academic", "subjects", current.yearId],
    queryFn: () => apiFetch(token, `/admin/academic/years/${current.yearId}/subjects`),
    enabled: !!token && !!current.yearId,
  });

  const unitsQ = useQuery<Unit[]>({
    queryKey: ["admin", "academic", "units", current.subjectId],
    queryFn: () => apiFetch(token, `/admin/academic/subjects/${current.subjectId}/units`),
    enabled: !!token && !!current.subjectId,
  });

  const lessonsQ = useQuery<Lesson[]>({
    queryKey: ["admin", "academic", "lessons", current.unitId],
    queryFn: () => apiFetch(token, `/admin/academic/units/${current.unitId}/lessons`),
    enabled: !!token && !!current.unitId,
  });

  const years = useSorted(yearsQ.data ?? []);
  const subjects = useSorted(subjectsQ.data ?? []);
  const units = useSorted(unitsQ.data ?? []);
  const lessons = useSorted(lessonsQ.data ?? []);

  function invalidateAcademic() {
    qc.invalidateQueries({ queryKey: ["admin", "academic"] });
  }

  async function uploadMedia(file: File, kind: UploadKind) {
    const fd = new FormData();
    fd.append(kind, file);
    const endpoint = kind === "video" ? "/admin/academic/media/upload-video" : "/admin/academic/media/upload-thumbnail";
    const response = await apiFetch<{ url: string }>(token, endpoint, {
      method: "POST",
      body: fd,
    });
    return response.url;
  }

  async function moveItem<T extends { id: number; orderIndex: number }>(
    items: T[],
    index: number,
    direction: "up" | "down",
    reorderPath: string,
  ) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;

    const clone = [...items];
    [clone[index], clone[target]] = [clone[target], clone[index]];

    await apiFetch(token, reorderPath, {
      method: "PATCH",
      body: JSON.stringify({
        items: clone.map((item, idx) => ({ id: item.id, orderIndex: idx })),
      }),
    });

    invalidateAcademic();
  }

  function resetLessonForm() {
    setLessonForm({
      title: "",
      description: "",
      isPublished: true,
      videoType: "youtube",
      videoUrl: "",
      videoTitle: "",
      videoDescription: "",
      instructor: "",
      duration: "",
      publishStatus: "published",
      thumbnailUrl: "",
    });
    setLessonVideoFile(null);
    setLessonThumbnailFile(null);
  }

  async function submitLesson() {
    if (!current.unitId) return;
    if (!lessonForm.title.trim()) {
      alert("عنوان الدرس مطلوب");
      return;
    }

    setIsSavingLesson(true);
    try {
      let videoUrl = lessonForm.videoUrl.trim();
      let thumbnailUrl = lessonForm.thumbnailUrl.trim();

      if (lessonForm.videoType === "upload" && !videoUrl) {
        if (!lessonVideoFile) {
          throw new Error("اختر ملف الفيديو أولًا");
        }
        videoUrl = await uploadMedia(lessonVideoFile, "video");
      }

      if (lessonThumbnailFile) {
        thumbnailUrl = await uploadMedia(lessonThumbnailFile, "thumbnail");
      }

      if (lessonForm.videoType === "youtube" && !videoUrl) {
        throw new Error("رابط YouTube مطلوب");
      }

      await apiFetch(token, `/admin/academic/units/${current.unitId}/lessons`, {
        method: "POST",
        body: JSON.stringify({
          title: lessonForm.title.trim(),
          description: lessonForm.description.trim(),
          isPublished: lessonForm.isPublished,
          orderIndex: lessons.length,
          video: {
            title: lessonForm.videoTitle.trim() || lessonForm.title.trim(),
            description: lessonForm.videoDescription.trim() || lessonForm.description.trim(),
            videoType: lessonForm.videoType,
            videoUrl,
            thumbnailUrl: thumbnailUrl || undefined,
            instructor: lessonForm.instructor.trim() || "غير محدد",
            duration: Number.parseInt(lessonForm.duration || "0", 10) || 0,
            publishStatus: lessonForm.publishStatus,
          },
        }),
      });

      invalidateAcademic();
      resetLessonForm();
      setShowAdd(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "تعذّر حفظ الدرس");
    } finally {
      setIsSavingLesson(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            إدارة المحتوى الأكاديمي
          </h2>
          <nav className="flex items-center gap-1.5 mt-2 flex-wrap">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.level}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" /> : null}
                <button
                  onClick={() => {
                    setCrumbs((prev) => prev.slice(0, i + 1));
                    setShowAdd(false);
                  }}
                  className={`text-sm font-semibold ${i === crumbs.length - 1 ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <button onClick={() => setShowAdd((v) => !v)} className="btn-primary text-sm py-2 px-4">
          <Plus className="w-4 h-4" />
          {showAdd ? "إغلاق" : "إضافة"}
        </button>
      </div>

      <AnimatePresence>
        {showAdd ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-card p-4 space-y-3 border-primary/20"
          >
            {current.level === "years" ? (
              <>
                <h3 className="font-bold text-foreground">إضافة سنة جديدة</h3>
                <input
                  value={yearForm.name}
                  onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم السنة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={yearForm.description}
                  onChange={(e) => setYearForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!yearForm.name.trim()) return alert("اسم السنة مطلوب");
                    await apiFetch(token, "/admin/academic/years", {
                      method: "POST",
                      body: JSON.stringify({
                        name: yearForm.name.trim(),
                        description: yearForm.description.trim(),
                        isPublished: false,
                      }),
                    });
                    setYearForm({ name: "", description: "" });
                    setShowAdd(false);
                    invalidateAcademic();
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ السنة
                </button>
              </>
            ) : null}

            {current.level === "subjects" && current.yearId ? (
              <>
                <h3 className="font-bold text-foreground">إضافة مادة داخل السنة</h3>
                <input
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم المادة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.icon}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, icon: e.target.value }))}
                  placeholder="أيقونة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={subjectForm.description}
                  onChange={(e) => setSubjectForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!subjectForm.name.trim()) return alert("اسم المادة مطلوب");
                    try {
                      await apiFetch(token, `/admin/academic/years/${current.yearId}/subjects`, {
                        method: "POST",
                        body: JSON.stringify({
                          name: subjectForm.name.trim(),
                          icon: subjectForm.icon.trim() || "📚",
                          description: subjectForm.description.trim(),
                          isPublished: false,
                        }),
                      });
                      setSubjectForm({ name: "", icon: "📚", description: "" });
                      setShowAdd(false);
                      invalidateAcademic();
                    } catch (err) {
                      const message = err instanceof Error ? err.message : "تعذر حفظ المادة";
                      alert(message);
                    }
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ المادة
                </button>
              </>
            ) : null}

            {current.level === "units" && current.subjectId ? (
              <>
                <h3 className="font-bold text-foreground">إضافة وحدة/فصل داخل المادة</h3>
                <input
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="اسم الوحدة"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <input
                  value={unitForm.description}
                  onChange={(e) => setUnitForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="الوصف"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />
                <button
                  onClick={async () => {
                    if (!unitForm.name.trim()) return alert("اسم الوحدة مطلوب");
                    await apiFetch(token, `/admin/academic/subjects/${current.subjectId}/units`, {
                      method: "POST",
                      body: JSON.stringify({
                        name: unitForm.name.trim(),
                        description: unitForm.description.trim(),
                        isPublished: false,
                      }),
                    });
                    setUnitForm({ name: "", description: "" });
                    setShowAdd(false);
                    invalidateAcademic();
                  }}
                  className="btn-primary text-sm py-2 px-5"
                >
                  حفظ الوحدة
                </button>
              </>
            ) : null}

            {current.level === "lessons" && current.unitId ? (
              <>
                <h3 className="font-bold text-foreground">إضافة درس + فيديو (داخل السياق الأكاديمي)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={lessonForm.title}
                    onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="عنوان الدرس"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.description}
                    onChange={(e) => setLessonForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="وصف الدرس"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLessonForm((p) => ({ ...p, videoType: "youtube" }))}
                    className={`py-2 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 ${lessonForm.videoType === "youtube" ? "bg-primary text-white border-primary" : "bg-white/70 border-white/70"}`}
                  >
                    <Youtube className="w-4 h-4" /> YouTube
                  </button>
                  <button
                    onClick={() => setLessonForm((p) => ({ ...p, videoType: "upload" }))}
                    className={`py-2 rounded-xl border text-sm font-bold flex items-center justify-center gap-1.5 ${lessonForm.videoType === "upload" ? "bg-primary text-white border-primary" : "bg-white/70 border-white/70"}`}
                  >
                    <Upload className="w-4 h-4" /> رفع ملف
                  </button>
                </div>

                {lessonForm.videoType === "youtube" ? (
                  <input
                    value={lessonForm.videoUrl}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoUrl: e.target.value }))}
                    placeholder="رابط YouTube"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                ) : (
                  <label className="w-full px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                    <span>{lessonVideoFile ? lessonVideoFile.name : "اختر ملف فيديو"}</span>
                    <Video className="w-4 h-4 text-primary" />
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => setLessonVideoFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={lessonForm.videoTitle}
                    onChange={(e) => setLessonForm((p) => ({ ...p, videoTitle: e.target.value }))}
                    placeholder="عنوان الفيديو (اختياري)"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.instructor}
                    onChange={(e) => setLessonForm((p) => ({ ...p, instructor: e.target.value }))}
                    placeholder="اسم المدرس"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <input
                    value={lessonForm.duration}
                    onChange={(e) => setLessonForm((p) => ({ ...p, duration: e.target.value }))}
                    placeholder="المدة بالدقائق"
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  />
                  <select
                    value={lessonForm.publishStatus}
                    onChange={(e) => setLessonForm((p) => ({ ...p, publishStatus: e.target.value as "draft" | "published" }))}
                    className="px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                  >
                    <option value="published">الفيديو منشور</option>
                    <option value="draft">الفيديو مسودة</option>
                  </select>
                </div>

                <textarea
                  value={lessonForm.videoDescription}
                  onChange={(e) => setLessonForm((p) => ({ ...p, videoDescription: e.target.value }))}
                  placeholder="وصف الفيديو"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none min-h-[90px]"
                />

                <input
                  value={lessonForm.thumbnailUrl}
                  onChange={(e) => setLessonForm((p) => ({ ...p, thumbnailUrl: e.target.value }))}
                  placeholder="رابط الصورة المصغرة (اختياري)"
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none"
                />

                <label className="w-full px-3 py-3 rounded-xl bg-white/70 border border-white/70 text-sm flex items-center justify-between cursor-pointer">
                  <span>{lessonThumbnailFile ? lessonThumbnailFile.name : "رفع صورة مصغرة (اختياري)"}</span>
                  <Upload className="w-4 h-4 text-primary" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setLessonThumbnailFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-xs text-muted-foreground -mt-1">
                  يمكنك إدخال رابط صورة أو رفع ملف. في حال اختيار ملف، سيتم استخدام الملف تلقائيًا.
                </p>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={lessonForm.isPublished}
                    onChange={(e) => setLessonForm((p) => ({ ...p, isPublished: e.target.checked }))}
                    className="accent-primary"
                  />
                  نشر الدرس مباشرة
                </label>

                <button
                  onClick={submitLesson}
                  disabled={isSavingLesson}
                  className="btn-primary text-sm py-2 px-5 disabled:opacity-60"
                >
                  {isSavingLesson ? "جاري الحفظ..." : "حفظ الدرس والفيديو"}
                </button>
              </>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="space-y-3">
        {current.level === "years" ? (
          years.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد سنوات دراسية بعد.</div>
          ) : (
            years.map((year, index) => {
              const tone = yearItemTone(index);
              return (
                <ItemCard
                  key={year.id}
                  icon={<GraduationCap className="w-5 h-5" />}
                  title={year.name}
                  description={year.description}
                  isPublished={year.isPublished}
                  containerClassName="border-white/70"
                  iconWrapperClassName={tone.iconWrapper}
                  topAccentClassName={tone.top}
                  onRename={async () => {
                    const name = prompt("اسم السنة", year.name);
                    if (name === null) return;
                    await apiFetch(token, `/admin/academic/years/${year.id}`, {
                      method: "PUT",
                      body: JSON.stringify({ name: name.trim() || year.name }),
                    });
                    invalidateAcademic();
                  }}
                  onTogglePublish={async () => {
                    await apiFetch(token, `/admin/academic/years/${year.id}`, {
                      method: "PUT",
                      body: JSON.stringify({ isPublished: !year.isPublished }),
                    });
                    invalidateAcademic();
                  }}
                  onDelete={async () => {
                    await apiFetch(token, `/admin/academic/years/${year.id}`, { method: "DELETE" });
                    invalidateAcademic();
                  }}
                  onMoveUp={index > 0 ? () => moveItem(years, index, "up", "/admin/academic/years/reorder") : undefined}
                  onMoveDown={index < years.length - 1 ? () => moveItem(years, index, "down", "/admin/academic/years/reorder") : undefined}
                  onOpen={() => {
                    setCrumbs((prev) => [...prev, { level: "subjects", label: year.name, yearId: year.id }]);
                    setShowAdd(false);
                  }}
                />
              );
            })
          )
        ) : null}

        {current.level === "subjects" ? (
          subjects.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد مواد داخل هذه السنة.</div>
          ) : (
            subjects.map((subject, index) => (
              <ItemCard
                key={subject.id}
                icon={<span className="text-xl">{subject.icon || "📚"}</span>}
                title={subject.name}
                description={subject.description}
                isPublished={subject.isPublished}
                onRename={async () => {
                  const name = prompt("اسم المادة", subject.name);
                  if (name === null) return;
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ name: name.trim() || subject.name }),
                  });
                  invalidateAcademic();
                }}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !subject.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/subjects/${subject.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(subjects, index, "up", "/admin/academic/subjects/reorder") : undefined}
                onMoveDown={index < subjects.length - 1 ? () => moveItem(subjects, index, "down", "/admin/academic/subjects/reorder") : undefined}
                onOpen={() => {
                  setCrumbs((prev) => [...prev, { level: "units", label: subject.name, yearId: current.yearId, subjectId: subject.id }]);
                  setShowAdd(false);
                }}
              />
            ))
          )
        ) : null}

        {current.level === "units" ? (
          units.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد وحدات داخل هذه المادة.</div>
          ) : (
            units.map((unit, index) => (
              <ItemCard
                key={unit.id}
                icon={<Layers className="w-5 h-5 text-sky-500" />}
                title={unit.name}
                description={unit.description}
                isPublished={unit.isPublished}
                onRename={async () => {
                  const name = prompt("اسم الوحدة", unit.name);
                  if (name === null) return;
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ name: name.trim() || unit.name }),
                  });
                  invalidateAcademic();
                }}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !unit.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/units/${unit.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(units, index, "up", "/admin/academic/units/reorder") : undefined}
                onMoveDown={index < units.length - 1 ? () => moveItem(units, index, "down", "/admin/academic/units/reorder") : undefined}
                onOpen={() => {
                  setCrumbs((prev) => [...prev, { level: "lessons", label: unit.name, yearId: current.yearId, subjectId: current.subjectId, unitId: unit.id }]);
                  setShowAdd(false);
                }}
              />
            ))
          )
        ) : null}

        {current.level === "lessons" ? (
          lessons.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">لا توجد دروس داخل هذه الوحدة.</div>
          ) : (
            lessons.map((lesson, index) => (
              <ItemCard
                key={lesson.id}
                icon={<PlayCircle className="w-5 h-5 text-emerald-500" />}
                title={lesson.title}
                description={lesson.description}
                isPublished={lesson.isPublished}
                badge={
                  lesson.video ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold">
                      {lesson.video.videoType === "youtube" ? "YouTube" : "Upload"}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">بلا فيديو</span>
                  )
                }
                onRename={async () => {
                  const title = prompt("عنوان الدرس", lesson.title);
                  if (title === null) return;
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ title: title.trim() || lesson.title }),
                  });
                  invalidateAcademic();
                }}
                onTogglePublish={async () => {
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ isPublished: !lesson.isPublished }),
                  });
                  invalidateAcademic();
                }}
                onDelete={async () => {
                  await apiFetch(token, `/admin/academic/lessons/${lesson.id}`, { method: "DELETE" });
                  invalidateAcademic();
                }}
                onMoveUp={index > 0 ? () => moveItem(lessons, index, "up", "/admin/academic/lessons/reorder") : undefined}
                onMoveDown={index < lessons.length - 1 ? () => moveItem(lessons, index, "down", "/admin/academic/lessons/reorder") : undefined}
              />
            ))
          )
        ) : null}
      </div>
    </div>
  );
}
