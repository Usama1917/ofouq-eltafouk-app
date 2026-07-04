import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
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

// v2 Phase 2 — admin manager for a CHAPTER (unit) exam. Config (open toggle, shown
// count, timer, points) + the adaptive question bank (each question tagged easy/
// medium/hard — reuses QuizManager in "chapter" variant). Saves in one PUT.
export default function ChapterExamManager({ unitId, token }: { unitId: number; token: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [isPublished, setIsPublished] = useState(false);
  const [adaptiveCount, setAdaptiveCount] = useState<number | null>(null);
  const [timerMinutes, setTimerMinutes] = useState(0);
  const [points, setPoints] = useState(30);
  const [questions, setQuestions] = useState<LocalQuestion[]>([]);
  const [chapterLessonCount, setChapterLessonCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ exam: any; questions: any[]; chapterLessonQuestionCount: number }>(token, `/admin/units/${unitId}/exam`)
      .then((d) => {
        if (cancelled) return;
        setIsPublished(Boolean(d.exam?.isPublished));
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
          isPublished,
          adaptiveCount,
          timerMinutes,
          points,
          questions: questions.map(localQuestionToPayload),
        }),
      });
      setStatus({ tone: "ok", text: "تم حفظ امتحان الفصل ✓" });
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
    <div className="space-y-3" dir="rtl">
      {/* Open / close the exam for students */}
      <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg bg-white/60 border border-white/70 px-3 py-2.5">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="w-4 h-4 accent-primary" />
        <span className="text-sm font-bold text-foreground">افتح امتحان الفصل للطلاب</span>
        <span className="text-[11px] text-muted-foreground">(لو مقفول، الكارت مايظهرش في التطبيق)</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/60 border border-white/70 px-3 py-2">
          <label className="text-xs font-bold text-foreground block mb-1">عدد الأسئلة المعروضة</label>
          <input
            value={adaptiveCount == null ? "" : String(adaptiveCount)}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 3);
              setAdaptiveCount(v === "" ? null : Number(v));
            }}
            placeholder="كل البنك"
            inputMode="numeric"
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none"
          />
        </div>
        <div className="rounded-lg bg-white/60 border border-white/70 px-3 py-2">
          <label className="text-xs font-bold text-foreground block mb-1">مدة الامتحان (دقيقة)</label>
          <input
            value={String(timerMinutes)}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 3);
              setTimerMinutes(v === "" ? 0 : Number(v));
            }}
            placeholder="0 = بدون وقت"
            inputMode="numeric"
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none"
          />
        </div>
        <div className="rounded-lg bg-white/60 border border-white/70 px-3 py-2">
          <label className="text-xs font-bold text-foreground block mb-1">النقاط (كامل الدرجة)</label>
          <input
            value={String(points)}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPoints(v === "" ? 0 : Number(v));
            }}
            inputMode="numeric"
            className="w-full px-3 py-1.5 rounded-lg bg-white border border-white/70 text-sm outline-none"
          />
        </div>
      </div>

      <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-[11px] text-blue-800 flex flex-wrap gap-x-4 gap-y-1">
        <span>بنك الامتحان: <b>{byDifficulty.hard}</b> صعب · <b>{byDifficulty.medium}</b> متوسط · <b>{byDifficulty.easy}</b> سهل</span>
        <span>أسئلة دروس الفصل: <b>{chapterLessonCount}</b> (امتحان «راجع أخطاءك» بيسحب منها ٧٥٪ على الأقل)</span>
      </div>

      {/* Adaptive bank editor — each question tagged with a difficulty. */}
      <QuizManager variant="chapter" questions={questions} onChange={setQuestions} token={token} />

      {status ? (
        <div className={`text-xs font-bold rounded-lg px-3 py-2 ${status.tone === "ok" ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-700"}`}>{status.text}</div>
      ) : null}

      <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm py-2 px-5 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        حفظ امتحان الفصل
      </button>
    </div>
  );
}
