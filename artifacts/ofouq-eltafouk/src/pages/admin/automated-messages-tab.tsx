import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Clock, Save, Send, Sparkles, Ticket, BookOpen, Award } from "lucide-react";
import { NotificationIconPicker } from "@/components/notification-icon-picker";
import { NotificationColorPicker } from "@/components/notification-color-picker";
import { useNotificationColors } from "@/lib/notification-colors";

// Self-contained helpers (mirrors admin-panel.tsx) so this tab can live in its own file.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface AutoMessage {
  key: string;
  enabled: boolean;
  titleAr: string;
  bodyAr: string;
  titleEn: string;
  bodyEn: string;
  sendHour: number | null;
  icon: string | null;
  color: string | null;
  config: Record<string, unknown> | null;
  updatedAt: string | null;
}

const META: Record<string, { title: string; emoji: string; desc: string; hasHour: boolean; hasMilestones: boolean }> = {
  evening_reminder: {
    title: "التذكير المسائي",
    emoji: "🔥",
    desc: "بيتبعت بالليل للطلاب اللي سلسلتهم هتتقطع لو ما ذاكروش النهارده. استخدم {streak} عشان عدد أيام السلسلة.",
    hasHour: true,
    hasMilestones: false,
  },
  goal_congrats: {
    title: "تهنئة الهدف اليومي",
    emoji: "🎉",
    desc: "بتتبعت أوتوماتيك أول ما الطالب يحقّق هدف المذاكرة اليومي.",
    hasHour: false,
    hasMilestones: false,
  },
  points_milestone: {
    title: "وسام النقاط",
    emoji: "🏅",
    desc: "بتتبعت أول ما الطالب يوصل لرقم نقاط معيّن. استخدم {points} في النص عشان رقم الوسام.",
    hasHour: false,
    hasMilestones: true,
  },
  subscription_pending: {
    title: "طلب اشتراك قيد المراجعة",
    emoji: "🕓",
    desc: "بتتبعت للطالب أول ما يبعت طلب اشتراك في مادة. استخدم {subject} لاسم المادة.",
    hasHour: false,
    hasMilestones: false,
  },
  subscription_approved: {
    title: "قبول الاشتراك",
    emoji: "✅",
    desc: "بتتبعت للطالب لما تقبل طلب اشتراكه في مادة. استخدم {subject} لاسم المادة.",
    hasHour: false,
    hasMilestones: false,
  },
  subscription_rejected: {
    title: "رفض الاشتراك",
    emoji: "❌",
    desc: "بتتبعت للطالب لما ترفض طلب اشتراكه. استخدم {subject} لاسم المادة و{reason} لسبب الرفض (لو مكتوب).",
    hasHour: false,
    hasMilestones: false,
  },
  new_lesson: {
    title: "درس جديد",
    emoji: "📘",
    desc: "بتتبعت للمشتركين في المادة أول ما يتنشر درس جديد. استخدم {lesson} لاسم الدرس و{unit} للوحدة و{subject} للمادة.",
    hasHour: false,
    hasMilestones: false,
  },
  resume_lesson: {
    title: "استكمال الفيديو",
    emoji: "⏯️",
    desc: "بتتبعت للطالب اللي بدأ فيديو وماكمّلوش (بعد ساعتين). استخدم {lesson} لاسم الدرس و{video} لاسم الفيديو و{time} للوقت اللي وقف عنده.",
    hasHour: false,
    hasMilestones: false,
  },
  exam_opened: {
    title: "فتح امتحان الفصل",
    emoji: "📝",
    desc: "بتتبعت للمشتركين في المادة أول ما تفتح امتحان في فصل (استدراك أو تحدي). استخدم {exam} لاسم الامتحان و{unit} للفصل و{subject} للمادة.",
    hasHour: false,
    hasMilestones: false,
  },
  exam_passed: {
    title: "نتيجة امتحان ممتازة",
    emoji: "🎉",
    desc: "بتتبعت للطالب لما ينجح في امتحان الفصل (٥٠٪ أو أكتر). استخدم {exam} لاسم الامتحان و{percent} للنتيجة.",
    hasHour: false,
    hasMilestones: false,
  },
  exam_retry: {
    title: "تشجيع بعد نتيجة ضعيفة",
    emoji: "💪",
    desc: "بتتبعت للطالب لما تكون نتيجته في امتحان الفصل أقل من ٥٠٪، تشجّعه يراجع ويحاول تاني. استخدم {exam} لاسم الامتحان و{percent} للنتيجة.",
    hasHour: false,
    hasMilestones: false,
  },
};

// Automated messages grouped into owner-facing categories (tabs).
const CATEGORIES = [
  { id: "encourage", label: "إشعارات التشجيع", icon: Sparkles, keys: ["evening_reminder", "goal_congrats", "points_milestone"] },
  { id: "subscription", label: "إشعارات الاشتراك", icon: Ticket, keys: ["subscription_pending", "subscription_approved", "subscription_rejected"] },
  { id: "lessons", label: "إشعارات الدروس", icon: BookOpen, keys: ["new_lesson", "resume_lesson"] },
  { id: "exams", label: "إشعارات الامتحانات", icon: Award, keys: ["exam_opened", "exam_passed", "exam_retry"] },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const CATEGORY_OF: Record<string, CategoryId> = CATEGORIES.reduce((acc, c) => {
  for (const k of c.keys) acc[k] = c.id;
  return acc;
}, {} as Record<string, CategoryId>);

const HOURS = Array.from({ length: 24 }, (_, h) => h);
function hourLabel(h: number) {
  const period = h < 12 ? "صباحًا" : "مساءً";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${period}`;
}

function milestonesOf(config: Record<string, unknown> | null): number[] {
  const m = config?.milestones;
  return Array.isArray(m) ? (m as number[]) : [];
}

export default function AutomatedMessagesTab() {
  const [messages, setMessages] = useState<AutoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  // Free-text milestone editing (parsed to numbers only on save).
  const [milestonesText, setMilestonesText] = useState<Record<string, string>>({});
  const [runResult, setRunResult] = useState("");
  const [running, setRunning] = useState(false);
  const [category, setCategory] = useState<CategoryId>("encourage");
  const { colors: customColors, addColor, deleteColor } = useNotificationColors();

  // `silent` = refresh in place without flipping the global loading flag. A non-silent
  // load swaps the whole list for a "جاري التحميل" spinner, which collapses the page and
  // scrolls it back to the top — so the post-save refresh passes silent=true to keep the
  // admin exactly where they were.
  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/automated-messages"), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل الرسائل");
      const data = await res.json();
      const list: AutoMessage[] = data.messages ?? [];
      setMessages(list);
      const texts: Record<string, string> = {};
      for (const m of list) {
        if (META[m.key]?.hasMilestones) texts[m.key] = milestonesOf(m.config).join("، ");
      }
      setMilestonesText(texts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function patch(key: string, fields: Partial<AutoMessage>) {
    setMessages((prev) => prev.map((m) => (m.key === key ? { ...m, ...fields } : m)));
    setSavedKey(null);
  }

  async function save(msg: AutoMessage) {
    setSavingKey(msg.key);
    setSavedKey(null);
    setError("");
    try {
      const body: Record<string, unknown> = {
        enabled: msg.enabled,
        titleAr: msg.titleAr,
        bodyAr: msg.bodyAr,
        titleEn: msg.titleEn,
        bodyEn: msg.bodyEn,
        icon: msg.icon ?? null,
        color: msg.color ?? null,
      };
      if (META[msg.key]?.hasHour) body.sendHour = msg.sendHour;
      if (META[msg.key]?.hasMilestones) {
        const nums = (milestonesText[msg.key] ?? "")
          .split(/[,،\s]+/)
          .map((s) => Number.parseInt(s, 10))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        body.config = { ...(msg.config ?? {}), milestones: nums };
      }
      const res = await fetch(apiPath(`/api/admin/automated-messages/${msg.key}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("تعذّر الحفظ");
      setSavedKey(msg.key);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ");
    } finally {
      setSavingKey(null);
    }
  }

  async function runEveningReminder() {
    setRunning(true);
    setRunResult("");
    try {
      const res = await fetch(apiPath("/api/admin/automated-messages/evening-reminder/run"), {
        method: "POST",
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "تعذّر الإرسال");
      setRunResult(`تم الإرسال لـ ${data.sent ?? 0} طالب (من إجمالي ${data.targeted ?? 0} مرشّح).`);
    } catch (err) {
      setRunResult(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-[12px] font-bold text-primary">
        دي كل الرسائل اللي بتتبعت لوحدها للطلاب. مقسّمة حسب النوع في التابات تحت. تقدر تعدّل النص، تشغّلها أو تطفّيها، تحدّد ميعاد التذكير المسائي، وتختار شكل الأيقونة ولونها.
      </div>

      {/* Category tabs with a sliding highlight pill */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-muted p-1.5">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = category === c.id;
          const countOf = messages.filter((m) => CATEGORY_OF[m.key] === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {active && (
                <motion.span
                  layoutId="auto-msg-category-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-white shadow dark:bg-white/10"
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="h-4 w-4" /> {c.label}
                <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-primary/10 text-primary" : "bg-foreground/5 text-muted-foreground"}`}>{countOf}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {messages.filter((msg) => CATEGORY_OF[msg.key] === category).map((msg) => {
        const meta = META[msg.key] ?? { title: msg.key, emoji: "🔔", desc: "", hasHour: false, hasMilestones: false };
        return (
          <div key={msg.key} className="glass-card p-5 space-y-4 border-primary/20">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{meta.emoji}</span>
                <div>
                  <h3 className="font-display font-bold text-lg flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    {meta.title}
                  </h3>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-6">{meta.desc}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <span className="text-xs font-bold text-muted-foreground">{msg.enabled ? "مفعّلة" : "متوقفة"}</span>
                <input
                  type="checkbox"
                  checked={msg.enabled}
                  onChange={(e) => patch(msg.key, { enabled: e.target.checked })}
                  className="h-5 w-5 accent-primary"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">العنوان (عربي)</span>
                <input
                  value={msg.titleAr}
                  onChange={(e) => patch(msg.key, { titleAr: e.target.value })}
                  dir="rtl"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">Title (English)</span>
                <input
                  value={msg.titleEn}
                  onChange={(e) => patch(msg.key, { titleEn: e.target.value })}
                  dir="ltr"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">النص (عربي)</span>
                <textarea
                  value={msg.bodyAr}
                  onChange={(e) => patch(msg.key, { bodyAr: e.target.value })}
                  dir="rtl"
                  className="min-h-[90px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">Body (English)</span>
                <textarea
                  value={msg.bodyEn}
                  onChange={(e) => patch(msg.key, { bodyEn: e.target.value })}
                  dir="ltr"
                  className="min-h-[90px] w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-7 outline-none focus:border-primary"
                />
              </label>
            </div>

            {meta.hasHour ? (
              <label className="space-y-1.5 block max-w-xs">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> ميعاد الإرسال (بتوقيت القاهرة)
                </span>
                <select
                  value={msg.sendHour ?? 20}
                  onChange={(e) => patch(msg.key, { sendHour: Number.parseInt(e.target.value, 10) })}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {meta.hasMilestones ? (
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold text-muted-foreground">أرقام الأوسمة (افصل بينهم بفاصلة)</span>
                <input
                  value={milestonesText[msg.key] ?? ""}
                  onChange={(e) => setMilestonesText((prev) => ({ ...prev, [msg.key]: e.target.value }))}
                  dir="ltr"
                  placeholder="100، 250، 500، 1000"
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
                />
              </label>
            ) : null}

            <NotificationIconPicker value={msg.icon ?? null} onChange={(k) => patch(msg.key, { icon: k })} />

            <NotificationColorPicker
              value={msg.color ?? null}
              onChange={(c) => patch(msg.key, { color: c })}
              customColors={customColors}
              onAdd={addColor}
              onDelete={deleteColor}
            />

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => void save(msg)}
                disabled={savingKey === msg.key}
                className="btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {savingKey === msg.key ? "جاري الحفظ..." : "حفظ"}
              </button>
              {savedKey === msg.key ? <span className="text-xs font-bold text-emerald-600">تم الحفظ ✓</span> : null}

              {msg.key === "evening_reminder" ? (
                <button
                  onClick={() => void runEveningReminder()}
                  disabled={running}
                  className="text-sm py-2 px-5 rounded-2xl border border-primary/30 bg-primary/5 font-bold text-primary flex items-center gap-2 disabled:opacity-60 hover:bg-primary/10"
                >
                  <Send className="w-4 h-4" />
                  {running ? "جاري الإرسال..." : "إرسال التذكير الآن"}
                </button>
              ) : null}
            </div>
            {msg.key === "evening_reminder" && runResult ? (
              <p className="text-xs font-bold text-muted-foreground">{runResult}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
