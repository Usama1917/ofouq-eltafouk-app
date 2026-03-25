import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, BookOpen, Users, Layers, PlayCircle,
  Plus, ChevronLeft, Trash2,
  Eye, EyeOff, Check, X, ArrowUp, ArrowDown
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface AcademicYear { id: number; name: string; description: string; orderIndex: number; isPublished: boolean; }
interface Subject { id: number; yearId: number; name: string; icon: string; description: string; hasProviders: boolean; orderIndex: number; isPublished: boolean; }
interface ContentProvider { id: number; subjectId: number; name: string; description: string; logoUrl?: string; orderIndex: number; isPublished: boolean; }
interface Unit { id: number; subjectId?: number; providerId?: number; name: string; description: string; orderIndex: number; isPublished: boolean; }
interface Lesson { id: number; unitId: number; title: string; description: string; videoId?: number; orderIndex: number; isPublished: boolean; video?: { id: number; title: string; videoUrl: string; thumbnailUrl?: string; duration: number; instructor: string; } | null; }
interface Video { id: number; title: string; instructor: string; subject: string; duration: number; }

type Level = "years" | "subjects" | "providers" | "units" | "lessons";

interface Breadcrumb {
  label: string;
  level: Level;
  yearId?: number;
  subjectId?: number;
  providerId?: number;
  unitId?: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

function useAcademicYears() {
  return useQuery<AcademicYear[]>({
    queryKey: ["admin", "academic", "years"],
    queryFn: () => apiFetch("/admin/academic/years"),
  });
}

function useSubjects(yearId?: number) {
  return useQuery<Subject[]>({
    queryKey: ["admin", "academic", "subjects", yearId],
    queryFn: () => apiFetch(`/admin/academic/years/${yearId}/subjects`),
    enabled: !!yearId,
  });
}

function useProviders(subjectId?: number) {
  return useQuery<ContentProvider[]>({
    queryKey: ["admin", "academic", "providers", subjectId],
    queryFn: () => apiFetch(`/admin/academic/subjects/${subjectId}/providers`),
    enabled: !!subjectId,
  });
}

function useSubjectUnits(subjectId?: number) {
  return useQuery<Unit[]>({
    queryKey: ["admin", "academic", "units", "subject", subjectId],
    queryFn: () => apiFetch(`/admin/academic/subjects/${subjectId}/units`),
    enabled: !!subjectId,
  });
}

function useProviderUnits(providerId?: number) {
  return useQuery<Unit[]>({
    queryKey: ["admin", "academic", "units", "provider", providerId],
    queryFn: () => apiFetch(`/admin/academic/providers/${providerId}/units`),
    enabled: !!providerId,
  });
}

function useLessons(unitId?: number) {
  return useQuery<Lesson[]>({
    queryKey: ["admin", "academic", "lessons", unitId],
    queryFn: () => apiFetch(`/admin/academic/units/${unitId}/lessons`),
    enabled: !!unitId,
  });
}

function useVideos() {
  return useQuery<Video[]>({
    queryKey: ["admin", "videos"],
    queryFn: () => apiFetch("/admin/videos"),
  });
}

function InlineEdit({ value, onSave, className = "" }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(val); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onSave(val); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        className={`border border-primary/40 rounded-lg px-2 py-1 text-sm outline-none bg-white/80 ${className}`}
      />
    );
  }
  return (
    <span onClick={() => setEditing(true)} className={`cursor-pointer hover:text-primary transition-colors ${className}`} title="انقر للتعديل">
      {value}
    </span>
  );
}

function ItemCard({
  name,
  description,
  isPublished,
  onNameSave,
  onTogglePublish,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDrillDown,
  badge,
  icon,
  children,
}: {
  name: string;
  description?: string;
  isPublished: boolean;
  onNameSave: (v: string) => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDrillDown?: () => void;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`glass-card p-4 flex items-center gap-3 ${!isPublished ? "opacity-70" : ""}`}>
      {icon && <div className="text-2xl flex-shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <InlineEdit value={name} onSave={onNameSave} className="font-semibold text-foreground" />
          {badge}
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isPublished ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
            {isPublished ? "منشور" : "مسودة"}
          </span>
        </div>
        {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
        {children}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onMoveUp && (
          <button onClick={onMoveUp} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-all" title="تحريك لأعلى">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}
        {onMoveDown && (
          <button onClick={onMoveDown} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-all" title="تحريك لأسفل">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onTogglePublish} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isPublished ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`} title={isPublished ? "إخفاء" : "نشر"}>
          {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { if (confirm("هل أنت متأكد من الحذف؟")) onDelete(); }} className="w-7 h-7 rounded-lg bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition-all" title="حذف">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {onDrillDown && (
          <button onClick={onDrillDown} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-all" title="فتح">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AddForm({ fields, onSubmit, onCancel }: {
  fields: { key: string; label: string; type?: string; options?: { value: string; label: string }[] }[];
  onSubmit: (data: Record<string, string | boolean>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  return (
    <div className="glass-card p-4 space-y-3 border-primary/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm text-muted-foreground">تفعيل</span>
              </label>
            ) : f.options ? (
              <select
                value={String(form[f.key] ?? "")}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
              >
                <option value="">-- اختر --</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={f.type ?? "text"}
                value={String(form[f.key] ?? "")}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(form)} className="btn-primary text-sm py-2 px-5">
          <Check className="w-4 h-4" /> إضافة
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
      </div>
    </div>
  );
}

export function AcademicTab() {
  const qc = useQueryClient();
  const [crumbs, setCrumbs] = useState<Breadcrumb[]>([{ label: "السنوات الدراسية", level: "years" }]);
  const [adding, setAdding] = useState(false);
  const [previewMode, setPreviewMode] = useState<"student" | "teacher" | null>(null);

  const current = crumbs[crumbs.length - 1];

  const yearsQ = useAcademicYears();
  const subjectsQ = useSubjects(current.yearId);
  const providersQ = useProviders(current.subjectId);
  const subjectUnitsQ = useSubjectUnits(current.level === "units" && !current.providerId ? current.subjectId : undefined);
  const providerUnitsQ = useProviderUnits(current.level === "units" && current.providerId ? current.providerId : undefined);
  const lessonsQ = useLessons(current.unitId);
  const videosQ = useVideos();

  const units = current.providerId ? providerUnitsQ.data ?? [] : subjectUnitsQ.data ?? [];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "academic"] });
  }

  function drillDown(crumb: Breadcrumb) {
    setCrumbs(prev => [...prev, crumb]);
    setAdding(false);
  }

  function navigateTo(index: number) {
    setCrumbs(prev => prev.slice(0, index + 1));
    setAdding(false);
  }

  async function reorderItems<T extends { id: number; orderIndex: number }>(
    items: T[],
    index: number,
    direction: "up" | "down",
    endpoint: string,
  ) {
    const arr = [...items];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    const reordered = arr.map((item, i) => ({ id: item.id, orderIndex: i }));
    await apiFetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: reordered }),
    });
    invalidate();
  }

  const years = yearsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];
  const providers = providersQ.data ?? [];
  const lessons = lessonsQ.data ?? [];
  const videos = videosQ.data ?? [];

  const currentSubject = subjects.find(s => s.id === current.subjectId) ?? null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            المحتوى الأكاديمي
          </h2>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mt-2 flex-wrap">
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />}
                <button
                  onClick={() => navigateTo(i)}
                  className={`text-sm font-semibold transition-colors ${i === crumbs.length - 1 ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPreviewMode("student")} className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200/50 text-blue-600 font-semibold text-sm hover:bg-blue-100 transition-all">
            <Eye className="w-4 h-4" /> معاينة طالب
          </button>
          <button onClick={() => setPreviewMode("teacher")} className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200/50 text-emerald-600 font-semibold text-sm hover:bg-emerald-100 transition-all">
            <Eye className="w-4 h-4" /> معاينة معلم
          </button>
          <button onClick={() => setAdding(a => !a)} className="btn-primary text-sm py-2 px-4">
            <Plus className="w-4 h-4" /> إضافة
          </button>
        </div>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {current.level === "years" && (
              <AddForm
                fields={[
                  { key: "name", label: "اسم السنة الدراسية" },
                  { key: "description", label: "الوصف" },
                ]}
                onSubmit={async data => {
                  await apiFetch("/admin/academic/years", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                  invalidate(); setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
            {current.level === "subjects" && current.yearId && (
              <AddForm
                fields={[
                  { key: "name", label: "اسم المادة" },
                  { key: "icon", label: "أيقونة (إيموجي)" },
                  { key: "description", label: "الوصف" },
                  { key: "hasProviders", label: "لها جهات تعليمية", type: "checkbox" },
                ]}
                onSubmit={async data => {
                  await apiFetch(`/admin/academic/years/${current.yearId}/subjects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                  invalidate(); setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
            {current.level === "providers" && current.subjectId && (
              <AddForm
                fields={[
                  { key: "name", label: "اسم الجهة التعليمية" },
                  { key: "description", label: "الوصف" },
                ]}
                onSubmit={async data => {
                  await apiFetch(`/admin/academic/subjects/${current.subjectId}/providers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
                  invalidate(); setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
            {current.level === "units" && (
              <AddForm
                fields={[
                  { key: "name", label: "اسم الوحدة/الفصل" },
                  { key: "description", label: "الوصف" },
                ]}
                onSubmit={async data => {
                  const body = current.providerId
                    ? { ...data, providerId: current.providerId }
                    : { ...data, subjectId: current.subjectId };
                  await apiFetch("/admin/academic/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                  invalidate(); setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
            {current.level === "lessons" && current.unitId && (
              <AddForm
                fields={[
                  { key: "title", label: "عنوان الدرس" },
                  { key: "description", label: "الوصف" },
                  {
                    key: "videoId",
                    label: "الفيديو المرتبط",
                    options: videos.map(v => ({ value: String(v.id), label: `${v.title} — ${v.instructor}` })),
                  },
                ]}
                onSubmit={async data => {
                  const body = { ...data, videoId: data.videoId ? parseInt(String(data.videoId)) : undefined };
                  await apiFetch(`/admin/academic/units/${current.unitId}/lessons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                  invalidate(); setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Items list */}
      <div className="space-y-2">
        {/* YEARS */}
        {current.level === "years" && (
          years.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا توجد سنوات دراسية بعد. أضف سنة جديدة للبدء.</p>
            </div>
          ) : years.map((year, i) => (
            <ItemCard
              key={year.id}
              name={year.name}
              description={year.description}
              isPublished={year.isPublished}
              icon={<GraduationCap className="w-6 h-6 text-primary/60" />}
              onNameSave={async v => {
                await apiFetch(`/admin/academic/years/${year.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
                invalidate();
              }}
              onTogglePublish={async () => {
                await apiFetch(`/admin/academic/years/${year.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !year.isPublished }) });
                invalidate();
              }}
              onDelete={async () => {
                await apiFetch(`/admin/academic/years/${year.id}`, { method: "DELETE" });
                invalidate();
              }}
              onMoveUp={i > 0 ? () => reorderItems(years, i, "up", "/admin/academic/years/reorder") : undefined}
              onMoveDown={i < years.length - 1 ? () => reorderItems(years, i, "down", "/admin/academic/years/reorder") : undefined}
              onDrillDown={() => drillDown({ label: year.name, level: "subjects", yearId: year.id })}
            />
          ))
        )}

        {/* SUBJECTS */}
        {current.level === "subjects" && (
          subjects.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا توجد مواد بعد.</p>
            </div>
          ) : subjects.map((subject, i) => (
            <ItemCard
              key={subject.id}
              name={subject.name}
              description={subject.description}
              isPublished={subject.isPublished}
              icon={<span className="text-2xl">{subject.icon}</span>}
              badge={
                <button
                  onClick={async () => {
                    await apiFetch(`/admin/academic/subjects/${subject.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hasProviders: !subject.hasProviders }) });
                    invalidate();
                  }}
                  className={`text-xs px-2 py-0.5 rounded-full font-bold border transition-all ${subject.hasProviders ? "bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-200" : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"}`}
                  title={subject.hasProviders ? "إيقاف الجهات التعليمية" : "تفعيل الجهات التعليمية"}
                >
                  {subject.hasProviders ? "لها جهات ✓" : "بدون جهات"}
                </button>
              }
              onNameSave={async v => {
                await apiFetch(`/admin/academic/subjects/${subject.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
                invalidate();
              }}
              onTogglePublish={async () => {
                await apiFetch(`/admin/academic/subjects/${subject.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !subject.isPublished }) });
                invalidate();
              }}
              onDelete={async () => {
                await apiFetch(`/admin/academic/subjects/${subject.id}`, { method: "DELETE" });
                invalidate();
              }}
              onMoveUp={i > 0 ? () => reorderItems(subjects, i, "up", "/admin/academic/subjects/reorder") : undefined}
              onMoveDown={i < subjects.length - 1 ? () => reorderItems(subjects, i, "down", "/admin/academic/subjects/reorder") : undefined}
              onDrillDown={() => {
                if (subject.hasProviders) {
                  drillDown({ label: subject.name, level: "providers", yearId: current.yearId, subjectId: subject.id });
                } else {
                  drillDown({ label: subject.name, level: "units", yearId: current.yearId, subjectId: subject.id });
                }
              }}
            />
          ))
        )}

        {/* PROVIDERS */}
        {current.level === "providers" && (
          providers.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا توجد جهات تعليمية بعد.</p>
            </div>
          ) : providers.map((provider, i) => (
            <ItemCard
              key={provider.id}
              name={provider.name}
              description={provider.description}
              isPublished={provider.isPublished}
              icon={<Users className="w-6 h-6 text-violet-500/60" />}
              onNameSave={async v => {
                await apiFetch(`/admin/academic/providers/${provider.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
                invalidate();
              }}
              onTogglePublish={async () => {
                await apiFetch(`/admin/academic/providers/${provider.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !provider.isPublished }) });
                invalidate();
              }}
              onDelete={async () => {
                await apiFetch(`/admin/academic/providers/${provider.id}`, { method: "DELETE" });
                invalidate();
              }}
              onMoveUp={i > 0 ? () => reorderItems(providers, i, "up", "/admin/academic/providers/reorder") : undefined}
              onMoveDown={i < providers.length - 1 ? () => reorderItems(providers, i, "down", "/admin/academic/providers/reorder") : undefined}
              onDrillDown={() => drillDown({ label: provider.name, level: "units", yearId: current.yearId, subjectId: current.subjectId, providerId: provider.id })}
            />
          ))
        )}

        {/* UNITS */}
        {current.level === "units" && (
          units.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا توجد وحدات بعد.</p>
            </div>
          ) : units.map((unit, i) => (
            <ItemCard
              key={unit.id}
              name={unit.name}
              description={unit.description}
              isPublished={unit.isPublished}
              icon={<Layers className="w-6 h-6 text-sky-500/60" />}
              onNameSave={async v => {
                await apiFetch(`/admin/academic/units/${unit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) });
                invalidate();
              }}
              onTogglePublish={async () => {
                await apiFetch(`/admin/academic/units/${unit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !unit.isPublished }) });
                invalidate();
              }}
              onDelete={async () => {
                await apiFetch(`/admin/academic/units/${unit.id}`, { method: "DELETE" });
                invalidate();
              }}
              onMoveUp={i > 0 ? () => reorderItems(units, i, "up", "/admin/academic/units/reorder") : undefined}
              onMoveDown={i < units.length - 1 ? () => reorderItems(units, i, "down", "/admin/academic/units/reorder") : undefined}
              onDrillDown={() => drillDown({ label: unit.name, level: "lessons", yearId: current.yearId, subjectId: current.subjectId, providerId: current.providerId, unitId: unit.id })}
            />
          ))
        )}

        {/* LESSONS */}
        {current.level === "lessons" && (
          lessons.length === 0 ? (
            <div className="glass-card p-8 text-center text-muted-foreground">
              <PlayCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا توجد دروس بعد.</p>
            </div>
          ) : lessons.map((lesson, i) => (
            <ItemCard
              key={lesson.id}
              name={lesson.title}
              description={lesson.description}
              isPublished={lesson.isPublished}
              icon={<PlayCircle className="w-6 h-6 text-emerald-500/60" />}
              badge={lesson.video ? <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold truncate max-w-[120px]">{lesson.video.title}</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">بلا فيديو</span>}
              onNameSave={async v => {
                await apiFetch(`/admin/academic/lessons/${lesson.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: v }) });
                invalidate();
              }}
              onTogglePublish={async () => {
                await apiFetch(`/admin/academic/lessons/${lesson.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !lesson.isPublished }) });
                invalidate();
              }}
              onDelete={async () => {
                await apiFetch(`/admin/academic/lessons/${lesson.id}`, { method: "DELETE" });
                invalidate();
              }}
              onMoveUp={i > 0 ? () => reorderItems(lessons, i, "up", "/admin/academic/lessons/reorder") : undefined}
              onMoveDown={i < lessons.length - 1 ? () => reorderItems(lessons, i, "down", "/admin/academic/lessons/reorder") : undefined}
            >
              {lesson.video && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PlayCircle className="w-3.5 h-3.5" />
                  {lesson.video.instructor} · {lesson.video.duration} دقيقة
                </div>
              )}
            </ItemCard>
          ))
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewMode && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewMode(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b flex items-center justify-between bg-muted/20">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  معاينة كـ {previewMode === "student" ? "طالب" : "معلم"}
                </h3>
                <button onClick={() => setPreviewMode(null)} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3" dir="rtl">
                <p className="text-xs text-muted-foreground font-medium">
                  {previewMode === "student" ? "تدفق الاستعراض للطالب:" : "ما يراه المعلم:"}
                </p>
                <div className="space-y-2">
                  {crumbs.map((c, i) => (
                    <div key={i} className={`flex items-center gap-2 p-3 rounded-2xl ${i === crumbs.length - 1 ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}>
                      <span className="text-xs font-bold text-muted-foreground">{i + 1}.</span>
                      <span className="text-sm font-semibold text-foreground">{c.label}</span>
                      {i < crumbs.length - 1 && <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground mr-auto" />}
                    </div>
                  ))}
                </div>
                {previewMode === "teacher" && (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-xs text-emerald-700 font-semibold">المعلم يرى كامل الهيكل بما في ذلك المواد غير المنشورة.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
