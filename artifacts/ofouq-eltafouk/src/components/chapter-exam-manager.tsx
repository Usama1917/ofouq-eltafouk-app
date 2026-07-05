import { useEffect, useState } from "react";
import { Loader2, Save, RefreshCcw, PencilRuler } from "lucide-react";
import QuizManager, { type LocalQuestion, apiQuestionToLocal, localQuestionToPayload } from "@/components/quiz-manager";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function api<T>(token: string | null, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error ?? "حدث خطأ");
  return payload as T;
}

function numInput(value: number | null, setValue: (v: number | null) => void, opts: { max?: number; allowEmpty?: boolean; placeholder?: string }) {
  return (
    <input
      value={value == null ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, opts.max ?? 4);
        setValue(v === "" ? (opts.allowEmpty ? null : 0) : Number(v));
      }}
      placeholder={opts.placeholder}
      inputMode="numeric"
      className="w-full px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none"
    />
  );
}

// v2 Phase 2 — admin manager for a CHAPTER (unit) exam. One card holds TWO exams, and
// each opens/closes + is configured INDEPENDENTLY:
//   A) راجع أخطاءك  — auto-built from the chapter's lesson-quiz mistakes (no bank to
//      fill); admin controls open/close + points only.
//   B) امتحان الفصل — the adaptive formal exam; admin controls open/close + count +
//      timer + points + fills the difficulty-tagged question bank.
// Everything saves in one PUT.
export default function ChapterExamManager({
  unitId,
  token,
  unitLabelSingular = "الفصل",
  onSaved,
}: {
  unitId: number;
  token: string | null;
  unitLabelSingular?: string;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Exam A — راجع أخطاءك (review).
  const [reviewPublished, setReviewPublished] = useState(false);
  const [reviewPoints, setReviewPoints] = useState<number | null>(10);

  // Exam B — امتحان الفصل (adaptive).
  const [adaptivePublished, setAdaptivePublished] = useState(false);
  const [adaptiveCount, setAdaptiveCount] = useState<number | null>(null);
  const [timerMinutes, setTimerMinutes] = useState<number | null>(0);
  const [points, setPoints] = useState<number | null>(30);
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [chapterLessonCount, setChapterLessonCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ exam: any; questions: any[]; chapterLessonQuestionCount: number }>(token, `/admin/units/${unitId}/exam`)
      .then((d) => {
        if (cancelled) return;
        setReviewPublished(Boolean(d.exam?.reviewPublished));
        setReviewPoints(d.exam?.reviewPoints ?? 10);
        setAdaptivePublished(Boolean(d.exam?.adaptivePublished));
        setAdaptiveCount(d.exam?.adaptiveCount ?? null);
        setTimerMinutes(d.exam?.timerMinutes ?? 0);
        setPoints(d.exam?.points ?? 30);
        setQuestions((d.questions ?? []).map(apiQuestionToLocal));
        setChapterLessonCount(d.chapterLessonQuestionCount ?? 0);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [unitId, token]);

  const byDifficulty = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  for (const q of questions) if (q.isPublished) byDifficulty[q.difficulty ?? "medium"] = (byDifficulty[q.difficulty ?? "medium"] ?? 0) + 1;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await api(token, `/admin/units/${unitId}/exam`, {
        method: "PUT",
        body: JSON.stringify({
          reviewPublished,
          reviewPoints: reviewPoints ?? 0,
          adaptivePublished,
          adaptiveCount,
          timerMinutes: timerMinutes ?? 0,
          points: points ?? 0,
          questions: questions.map(localQuestionToPayload),
        }),
      });
      setStatus({ tone: "ok", text: "تم حفظ امتحان " + unitLabelSingular + " ✓" });
      onSaved?.();
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "تعذّر الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* ── Exam A — راجع أخطاءك ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <RefreshCcw className="w-4 h-4 text-indigo-600" />
          </span>
          <div>
            <h4 className="font-bold text-foreground text-sm">امتحان الاستدراك</h4>
            <p className="text-[11px] text-muted-foreground">ركزنا لك على النقط اللي محتاجة محاولة تانية — بتصحيح فوري.</p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg bg-white/70 border border-white/70 px-3 py-2.5">
          <input type="checkbox" checked={reviewPublished} onChange={(e) => setReviewPublished(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-bold text-foreground">افتح «امتحان الاستدراك» للطلاب</span>
          <span className="text-[11px] text-muted-foreground">(لو مقفول، مايظهرش في التطبيق)</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/70 border border-white/70 px-3 py-2">
            <label className="text-xs font-bold text-foreground block mb-1">النقاط (كامل الدرجة)</label>
            {numInput(reviewPoints, setReviewPoints, { max: 4 })}
          </div>
          <div className="rounded-lg bg-white/50 border border-white/60 px-3 py-2 text-[11px] text-indigo-900 flex items-center">
            بيتكوّن تلقائي من غلطات الطالب · بياخد ٧٥٪ على الأقل من أسئلة دروس الفصل ({chapterLessonCount} سؤال متاح).
          </div>
        </div>
      </section>

      {/* ── Exam B — امتحان الفصل ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
            <PencilRuler className="w-4 h-4 text-violet-600" />
          </span>
          <div>
            <h4 className="font-bold text-foreground text-sm">تحديك الخاص</h4>
            <p className="text-[11px] text-muted-foreground">أسئلة اختيرت بناءً على مستوى الطالب من بنك {unitLabelSingular}، بوقت، والنتيجة في الآخر.</p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg bg-white/70 border border-white/70 px-3 py-2.5">
          <input type="checkbox" checked={adaptivePublished} onChange={(e) => setAdaptivePublished(e.target.checked)} className="w-4 h-4 accent-violet-600" />
          <span className="text-sm font-bold text-foreground">افتح «تحديك الخاص» للطلاب</span>
          <span className="text-[11px] text-muted-foreground">(لو مقفول، مايظهرش في التطبيق)</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/70 border border-white/70 px-3 py-2">
            <label className="text-xs font-bold text-foreground block mb-1">عدد الأسئلة المعروضة</label>
            {numInput(adaptiveCount, setAdaptiveCount, { max: 3, allowEmpty: true, placeholder: "كل البنك" })}
          </div>
          <div className="rounded-lg bg-white/70 border border-white/70 px-3 py-2">
            <label className="text-xs font-bold text-foreground block mb-1">مدة الامتحان (دقيقة)</label>
            {numInput(timerMinutes, setTimerMinutes, { max: 3, placeholder: "0 = بدون وقت" })}
          </div>
          <div className="rounded-lg bg-white/70 border border-white/70 px-3 py-2">
            <label className="text-xs font-bold text-foreground block mb-1">النقاط (كامل الدرجة)</label>
            {numInput(points, setPoints, { max: 4 })}
          </div>
        </div>

        <div className="rounded-lg bg-white/50 border border-white/60 px-3 py-2 text-[11px] text-violet-900">
          بنك الامتحان: <b>{byDifficulty.hard}</b> صعب · <b>{byDifficulty.medium}</b> متوسط · <b>{byDifficulty.easy}</b> سهل
        </div>

        {/* Adaptive bank editor — each question tagged with a difficulty. */}
        <QuizManager variant="chapter" questions={questions} onChange={setQuestions} token={token} />
      </section>

      {status ? (
        <div className={`text-xs font-bold rounded-lg px-3 py-2 ${status.tone === "ok" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}>{status.text}</div>
      ) : null}

      <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm py-2 px-5 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        حفظ إعدادات الامتحان
      </button>
    </div>
  );
}
