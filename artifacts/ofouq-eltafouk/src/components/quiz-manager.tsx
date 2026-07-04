import { useRef, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Loader2, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";

// v2 Phase 2 — CONTROLLED quiz editor, IMAGE-ONLY. A question is a picture (a screenshot
// from the PDF) and each of the 4 options is a picture too — so every complex formatting
// (equations, tables, sub/superscript…) comes through perfectly as part of the image, with
// no in-app typing. The list is edited in memory and saved together with the lesson.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LETTERS = ["أ", "ب", "ج", "د"] as const;
const OPTIONS_PER_QUESTION = 4;
const DIFFICULTIES = [
  { value: "easy", label: "سهل" },
  { value: "medium", label: "متوسط" },
  { value: "hard", label: "صعب" },
] as const;

// Kept for on-the-wire compatibility with the API/mobile (they still accept the general
// content shape); the editor only ever produces `kind: "image"` options now.
export interface QuizTable {
  headerRow: boolean;
  cells: string[][];
}
export interface OptionContent {
  kind: "text" | "image" | "table";
  text?: string | null;
  imageUrl?: string | null;
  table?: QuizTable | null;
}

// A question held in the lesson form. `id` is the server id (present only for questions
// that already exist when editing a lesson); `localId` is a stable React key.
export interface LocalQuestion {
  localId: string;
  id?: number;
  text: string;
  imageUrl: string | null;
  table: QuizTable | null;
  options: OptionContent[];
  correctIndex: number;
  explanation: string | null;
  difficulty: string;
  isPublished: boolean;
}

let localCounter = 0;
function makeLocalId(): string {
  localCounter += 1;
  return `q-${Date.now()}-${localCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

// Map an API question row → LocalQuestion (used when opening a lesson for edit).
export function apiQuestionToLocal(q: any): LocalQuestion {
  return {
    localId: makeLocalId(),
    id: q.id,
    text: q.text ?? "",
    imageUrl: q.imageUrl ?? null,
    table: q.table ?? null,
    options: Array.isArray(q.options) ? q.options : [],
    correctIndex: q.correctIndex ?? 0,
    explanation: q.explanation ?? null,
    difficulty: q.difficulty ?? "medium",
    isPublished: q.isPublished ?? true,
  };
}

// Map a LocalQuestion → the JSON the sync endpoint expects.
export function localQuestionToPayload(q: LocalQuestion) {
  return {
    id: q.id,
    text: q.text || undefined,
    imageUrl: q.imageUrl || undefined,
    table: q.table || undefined,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation || undefined,
    difficulty: q.difficulty,
    isPublished: q.isPublished,
  };
}

async function uploadQuizImage(token: string | null, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`${BASE}/api/admin/quiz/upload-image`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error ?? "تعذر رفع الصورة");
  return String(payload.url);
}

function difficultyLabel(value: string) {
  return DIFFICULTIES.find((d) => d.value === value)?.label ?? "متوسط";
}

// ── The single-question editor form model (image-only) ────────────────────────────
interface QForm {
  localId: string | null;
  id?: number;
  imageUrl: string | null;
  options: (string | null)[]; // 4 option image URLs
  correctIndex: number;
  difficulty: string;
  isPublished: boolean;
}
function emptyForm(): QForm {
  return { localId: null, imageUrl: null, options: [null, null, null, null], correctIndex: 0, difficulty: "medium", isPublished: true };
}
function toForm(q: LocalQuestion): QForm {
  return {
    localId: q.localId,
    id: q.id,
    imageUrl: q.imageUrl,
    options: [0, 1, 2, 3].map((i) => q.options[i]?.imageUrl ?? null),
    correctIndex: q.correctIndex,
    difficulty: DIFFICULTIES.some((d) => d.value === q.difficulty) ? q.difficulty : "medium",
    isPublished: q.isPublished,
  };
}

// A single image slot: upload / preview / change / remove.
function ImageUploader({
  value,
  onChange,
  token,
  onError,
  previewClass,
  label,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  token: string | null;
  onError: (msg: string) => void;
  previewClass?: string;
  label: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadQuizImage(token, file);
      onChange(url);
    } catch (e: any) {
      onError(e?.message ?? "تعذر رفع الصورة");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {value ? (
        <>
          <img src={resolveMediaUrl(value) ?? ""} alt="" className={`rounded-lg object-contain border border-white/70 bg-white ${previewClass ?? "max-h-24"}`} />
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-white/70 border border-white/70 text-muted-foreground font-bold hover:text-primary disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "تغيير"}
          </button>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-rose-600 font-bold hover:underline">
            حذف
          </button>
        </>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          {label}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,.heic,.heif,.avif,.bmp,.tif,.tiff,.svg,.jfif,.ico,.jp2"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function QuizManager({
  questions,
  onChange,
  quizQuestionCount,
  onCountChange,
  quizLanguage,
  onLanguageChange,
  quizWatchGateEnabled,
  onWatchGateEnabledChange,
  quizWatchGatePercent,
  onWatchGatePercentChange,
  token,
  variant = "lesson",
}: {
  questions: LocalQuestion[];
  onChange: (qs: LocalQuestion[]) => void;
  quizQuestionCount?: number | null;
  onCountChange?: (n: number | null) => void;
  quizLanguage?: "ar" | "en";
  onLanguageChange?: (lang: "ar" | "en") => void;
  quizWatchGateEnabled?: boolean;
  onWatchGateEnabledChange?: (v: boolean) => void;
  quizWatchGatePercent?: number;
  onWatchGatePercentChange?: (n: number) => void;
  token: string | null;
  // "lesson" = a video's quiz (shows count/language/watch-gate settings).
  // "chapter" = a unit exam bank (those settings are managed by the parent instead).
  variant?: "lesson" | "chapter";
}) {
  const [form, setForm] = useState<QForm | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const publishedCount = questions.filter((q) => q.isPublished).length;

  const flash = (tone: "ok" | "err", text: string) => {
    setStatus({ tone, text });
    window.setTimeout(() => setStatus(null), 4500);
  };

  const openNew = () => {
    setForm(emptyForm());
    setStatus(null);
  };
  const openEdit = (q: LocalQuestion) => {
    setForm(toForm(q));
    setStatus(null);
  };

  const validateForm = (f: QForm): string | null => {
    if (!f.imageUrl) return "ارفع صورة السؤال";
    for (let i = 0; i < OPTIONS_PER_QUESTION; i++) {
      if (!f.options[i]) return `اختيار ${LETTERS[i]}: ارفع صورة`;
    }
    return null;
  };

  const saveForm = () => {
    if (!form) return;
    const err = validateForm(form);
    if (err) {
      flash("err", err);
      return;
    }
    const next: LocalQuestion = {
      localId: form.localId ?? makeLocalId(),
      id: form.id,
      text: "",
      imageUrl: form.imageUrl,
      table: null,
      options: form.options.map((url) => ({ kind: "image" as const, imageUrl: url })),
      correctIndex: form.correctIndex,
      explanation: null,
      difficulty: form.difficulty,
      isPublished: form.isPublished,
    };
    if (form.localId == null) onChange([...questions, next]);
    else onChange(questions.map((q) => (q.localId === form.localId ? next : q)));
    setForm(null);
    flash("ok", "تم ✓ (هيتحفظ مع الدرس)");
  };

  const deleteQuestion = (q: LocalQuestion) => {
    if (!window.confirm("متأكد إنك عايز تحذف السؤال ده؟")) return;
    onChange(questions.filter((x) => x.localId !== q.localId));
  };
  const togglePublished = (q: LocalQuestion) => onChange(questions.map((x) => (x.localId === q.localId ? { ...x, isPublished: !x.isPublished } : x)));
  const setOptionImg = (i: number, url: string | null) => setForm((p) => (p ? { ...p, options: p.options.map((o, j) => (j === i ? url : o)) } : p));

  return (
    <div className="w-full rounded-xl border border-white/70 bg-white/55 p-3 space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-foreground">أسئلة الاختبار (صور)</p>
          <p className="text-[11px] text-muted-foreground">
            {questions.length > 0
              ? `${questions.length} سؤال${publishedCount < questions.length ? ` (${publishedCount} منشور)` : ""} — كل سؤال صورة + ٤ اختيارات صور`
              : "كل سؤال = صورة، وكل اختيار = صورة (سكرين‑شوت من الـ PDF)"}
          </p>
        </div>
        <button type="button" onClick={openNew} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> إضافة سؤال
        </button>
      </div>

      {variant === "lesson" ? (
      <div className="flex items-center gap-2 flex-wrap rounded-lg bg-white/60 border border-white/70 px-3 py-2">
        <label className="text-xs font-bold text-foreground">عدد الأسئلة اللي تتعرض للطالب:</label>
        <input
          value={quizQuestionCount == null ? "" : String(quizQuestionCount)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
            onCountChange?.(v === "" ? null : Number(v));
          }}
          placeholder="كل الأسئلة"
          inputMode="numeric"
          className="w-24 px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none"
        />
        <span className="text-[11px] text-muted-foreground">سيبه فاضي = كل الأسئلة · الطالب بياخد عيّنة عشوائية</span>
      </div>
      ) : null}

      {variant === "lesson" ? (
      <div className="flex items-center gap-2 flex-wrap rounded-lg bg-white/60 border border-white/70 px-3 py-2">
        <label className="text-xs font-bold text-foreground">لغة الاختبار:</label>
        <div className="flex items-center rounded-lg border border-white/70 overflow-hidden">
          <button type="button" onClick={() => onLanguageChange?.("ar")} className={`px-3 py-1.5 text-xs font-bold ${quizLanguage === "ar" ? "bg-primary text-white" : "bg-white text-muted-foreground hover:text-primary"}`}>عربي</button>
          <button type="button" onClick={() => onLanguageChange?.("en")} className={`px-3 py-1.5 text-xs font-bold ${quizLanguage === "en" ? "bg-primary text-white" : "bg-white text-muted-foreground hover:text-primary"}`}>إنجليزي</button>
        </div>
        <span className="text-[11px] text-muted-foreground">بتحدد اتجاه الاختبار في التطبيق: عربي = حروف الاختيار (أ/ب/ج/د) على اليمين · إنجليزي = على الشمال</span>
      </div>
      ) : null}

      {variant === "lesson" ? (
      <div className="rounded-lg bg-white/60 border border-white/70 px-3 py-2 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(quizWatchGateEnabled)}
            onChange={(e) => onWatchGateEnabledChange?.(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-xs font-bold text-foreground">اقفل الاختبار لحد ما الطالب يشوف نسبة من الفيديو</span>
        </label>
        {quizWatchGateEnabled ? (
          <div className="flex items-center gap-2 flex-wrap pr-6">
            <label className="text-xs font-bold text-foreground">النسبة المطلوبة:</label>
            <input
              value={String(quizWatchGatePercent ?? 75)}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                const n = v === "" ? 0 : Number(v);
                onWatchGatePercentChange?.(Math.min(100, Math.max(1, n || 1)));
              }}
              inputMode="numeric"
              className="w-20 px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none text-center"
            />
            <span className="text-xs font-bold text-foreground">%</span>
            <span className="text-[11px] text-muted-foreground">بتُحسب على المشاهدة الحقيقية — سحب الشريط للآخر مش بيحتسب.</span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground pr-6">لو مقفول، الطالب لازم يشوف النسبة دي فعلاً من زمن الفيديو (مش بالسحب) قبل ما يفتح الاختبار.</p>
        )}
      </div>
      ) : null}

      {status ? <div className={`text-xs font-bold rounded-lg px-3 py-2 ${status.tone === "ok" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}>{status.text}</div> : null}

      {form ? (
        <div className="rounded-xl border border-primary/30 bg-white/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-primary">{form.localId == null ? "سؤال جديد" : "تعديل السؤال"}</p>
            <button type="button" onClick={() => setForm(null)} className="text-muted-foreground hover:text-rose-600"><X className="w-4 h-4" /></button>
          </div>

          {/* Question image */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-muted-foreground">صورة السؤال:</p>
            <ImageUploader value={form.imageUrl} onChange={(url) => setForm((p) => (p ? { ...p, imageUrl: url } : p))} token={token} onError={(m) => flash("err", m)} previewClass="max-h-48" label="ارفع صورة السؤال" />
          </div>

          {/* Option images + correct answer */}
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold text-muted-foreground">الاختيارات (دوس على الدايرة لتحديد الإجابة الصح · كل اختيار صورة):</p>
            {form.options.map((url, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/60 p-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => (p ? { ...p, correctIndex: i } : p))}
                  title="الإجابة الصحيحة"
                  className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${form.correctIndex === i ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 text-muted-foreground"}`}
                >
                  {form.correctIndex === i ? <Check className="w-3.5 h-3.5" /> : LETTERS[i]}
                </button>
                <span className="text-[11px] text-muted-foreground shrink-0">اختيار {LETTERS[i]}</span>
                <div className="flex-1">
                  <ImageUploader value={url} onChange={(u) => setOptionImg(i, u)} token={token} onError={(m) => flash("err", m)} previewClass="max-h-20" label="ارفع صورة الاختيار" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">الصعوبة:</span>
              <select value={form.difficulty} onChange={(e) => setForm((p) => (p ? { ...p, difficulty: e.target.value } : p))} className="px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none">
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((p) => (p ? { ...p, isPublished: e.target.checked } : p))} /> منشور (يظهر للطالب)
            </label>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={saveForm} className="text-sm px-4 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary/90 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> تمام
            </button>
            <button type="button" onClick={() => setForm(null)} className="text-sm px-4 py-2 rounded-lg bg-white/70 border border-white/70 text-muted-foreground font-bold hover:text-foreground">إلغاء</button>
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد أسئلة بعد. دوس «إضافة سؤال» وارفع صورة السؤال والاختيارات.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, index) => (
            <div key={q.localId} className={`rounded-xl border p-2.5 ${q.isPublished ? "border-white/70 bg-white/70" : "border-amber-300/60 bg-amber-50/50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[11px] font-bold text-muted-foreground mt-0.5">#{index + 1}</span>
                  {q.imageUrl ? <img src={resolveMediaUrl(q.imageUrl) ?? ""} alt="" className="h-12 w-16 rounded-lg object-contain bg-white border border-white/70 shrink-0" /> : <span className="text-[11px] text-rose-600">بدون صورة</span>}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">سؤال {index + 1}</p>
                    <p className="text-[11px] text-emerald-700 truncate">✓ الإجابة: {LETTERS[q.correctIndex] ?? "؟"} · <span className="text-muted-foreground">{difficultyLabel(q.difficulty)}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => togglePublished(q)} title={q.isPublished ? "إخفاء" : "إظهار"} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10">{q.isPublished ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
                  <button type="button" onClick={() => openEdit(q)} title="تعديل" className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => deleteQuestion(q)} title="حذف" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
