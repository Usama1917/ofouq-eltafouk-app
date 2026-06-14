import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import {
  LayoutDashboard, Users, BookOpen, Video, MessageSquare, Layers,
  GraduationCap, TicketPercent, Send, FileBarChart, Crown, ShieldCheck,
  TrendingUp, BarChart3, Plus, LogOut, Bell, AlertTriangle,
  CheckCircle2, Clock, FolderTree, ListVideo, Sun, Moon, Info, X, History,
  Download, FileSpreadsheet, FileText, Loader2, Star, Snowflake,
  Search, SlidersHorizontal, GripVertical,
} from "lucide-react";
import { fetchReport, exportExcel, exportPdf } from "@/lib/activity-export";
import { numTick, numAxisWidth, catAxisWidth, AXIS_GAP } from "@/lib/chart-axis";
import { EgyptHeatmap } from "@/components/egypt-heatmap";
import { InternalChatWidget } from "@/components/internal-chat-widget";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListAdminUsers, useUpdateAdminUser, useDeleteAdminUser, useCreateAdminUser,
} from "@workspace/api-client-react";
import { Logo } from "@/components/logo";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "dashboard" | "reports" | "admins" | "users";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "reports", label: "التقارير", icon: FileBarChart },
  { id: "admins", label: "إدارة المشرفين", icon: ShieldCheck },
  { id: "users", label: "جميع المستخدمين", icon: Users },
];

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#EC4899"];

// Directional vertical page transition between tabs. dir = +1 means navigating
// DOWN the tab list (forward) → both pages slide UP (the new page comes in from
// below, the old one leaves through the top — like dragging the stack upward).
// dir = -1 (backward) slides everything DOWN. Distance is the page's own height
// (100%) so it reads as a full swap; opacity keeps the far ends from snapping.
const pageVariants = {
  enter: (dir: number) => ({ y: dir >= 0 ? "100%" : "-100%", opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (dir: number) => ({ y: dir >= 0 ? "-100%" : "100%", opacity: 0 }),
};
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Shares the same saved preference as the admin panel so the theme stays in sync.
type AdminTheme = "light" | "dark";
const ADMIN_THEME_STORAGE_KEY = "ofouq-admin-theme:v1";
function getInitialAdminTheme(): AdminTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "light";
}

// ── Types matching GET /api/admin/owner-dashboard/summary ──────────────────
type OwnerSummary = {
  generatedAt: string;
  kpis: {
    totalUsers: number; totalStudents: number; totalTeachers: number; totalAdmins: number;
    totalModerators: number; totalParents: number; activeStudents: number; suspendedStudents: number;
    activeSubscriptions: number; pendingSubscriptions: number; approvedSubscriptions: number;
    rejectedSubscriptions: number; totalYears: number; totalSubjects: number; totalUnits: number;
    totalLessons: number; totalVideos: number; totalSegments: number; unreadSupport: number;
    openConversations: number; pushTokensAndroid: number; pushTokensIos: number; pushTokensTotal: number;
    lastActivityAt: string | null;
  };
  alerts: {
    pendingSubscriptions: number; unreadSupport: number; subjectsWithoutUnits: number;
    unitsWithoutLessons: number; lessonsWithoutVideos: number; videosWithoutSegments: number;
  };
  charts: {
    roleDistribution: { role: string; value: number }[];
    subscriptionsByStatus: { status: string; value: number }[];
    academicContent: { name: string; value: number }[];
    topSubjects: { name: string; value: number }[];
    userGrowth: { month: string; students: number; teachers: number; others: number }[];
    last7Days: { day: string; watch: number; requests: number; messages: number }[];
  };
  recent: {
    students: { id: number; name: string; email: string; status: string; joinedAt: string }[];
    subscriptionRequests: { id: number; studentName: string | null; subjectName: string | null; status: string; submittedAt: string }[];
    support: { conversationId: number; userName: string | null; status: string; lastMessageAt: string }[];
  };
};

const ROLE_LABELS: Record<string, string> = { student: "طلاب", teacher: "معلمون", parent: "أولياء أمور", admin: "مشرفون", owner: "ملاك", moderator: "مشرفو محتوى" };
const STATUS_LABELS: Record<string, string> = { pending: "قيد المراجعة", approved: "مقبولة", rejected: "مرفوضة", active: "نشطة", expired: "منتهية", open: "مفتوحة", resolved: "تم الحل", closed: "مغلقة" };

// All numbers shown as English digits (Latin numerals) per request.
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("en-US");
function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    // Arabic month names but Latin (English) digits.
    return new Date(value).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return names[Math.max(0, Math.min(11, Number(m) - 1))] ?? ym;
}
function dayLabel(d: string) {
  try {
    return new Date(d).toLocaleDateString("ar-EG-u-nu-latn", { weekday: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function useOwnerSummary() {
  return useQuery<OwnerSummary>({
    queryKey: ["owner-dashboard-summary"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/admin/owner-dashboard/summary"), { headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "تعذر تحميل بيانات اللوحة");
      return data as OwnerSummary;
    },
    refetchInterval: 60000,
  });
}

// ── Reusable bits ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-white/60 p-3 text-sm" dir="rtl">
      {label != null && <p className="font-bold text-foreground mb-2">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {Number(p.value).toLocaleString("en-US")}
        </p>
      ))}
    </div>
  );
};

function KpiCard({ label, value, icon: Icon, color, bg, sub }: any) {
  return (
    <div className={`glass-card p-4 bg-gradient-to-br ${bg} dark:bg-none`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4.5 h-4.5 ${color}`} />
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
      <p className={`font-display font-black text-2xl ${color}`}>{fmt(value)}</p>
      {sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  );
}

// ── Resizable chart cards ──────────────────────────────────────────────────────
// Four area-based sizes on a 4-col grid: the larger the tier, the more grid cells
// the card spans, and the grid reflows to fill gaps (fixed order). Sizes persist.
export type CardSize = "small" | "medium" | "large" | "xlarge";
const CARD_ORDER: CardSize[] = ["small", "medium", "large", "xlarge"];
// Literal class strings (kept whole so Tailwind's JIT can see them).
const CARD_SPAN: Record<CardSize, string> = {
  small: "col-span-1 row-span-1",
  medium: "col-span-2 row-span-1",
  large: "col-span-4 row-span-1",
  xlarge: "col-span-4 row-span-2",
};
const CARD_SIZES_KEY = "ofouq-owner-chart-sizes:v1";
function loadCardSizes(): Record<string, CardSize> {
  try { const raw = localStorage.getItem(CARD_SIZES_KEY); if (raw) return JSON.parse(raw) || {}; } catch { /* ignore */ }
  return {};
}

// Card display order (persisted, drag-to-reorder). Unknown/missing ids are
// reconciled against DEFAULT_ORDER so new charts always appear.
const CARD_ORDER_KEY = "ofouq-owner-chart-order:v1";
const DEFAULT_ORDER = ["growth", "roles", "subs", "academic", "topSubjects", "activity"];
function loadCardOrder(): string[] {
  try {
    const raw = localStorage.getItem(CARD_ORDER_KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) {
        const merged = [...a.filter((id: string) => DEFAULT_ORDER.includes(id)), ...DEFAULT_ORDER.filter((id) => !a.includes(id))];
        if (merged.length) return merged;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_ORDER;
}

// Pixel span of each tier on the grid (columns × rows). Used to translate a live
// drag size back into the nearest discrete tier.
const TIER_SPAN: Record<CardSize, [number, number]> = { small: [1, 1], medium: [2, 1], large: [4, 1], xlarge: [4, 2] };

// Corner grip (bottom-left): invisible until the card is hovered, glows blue when
// approached/grabbed. It forwards raw pointer drag to the card, which resizes the
// card live (following the cursor) and snaps to the nearest tier on release.
function ResizeGrip({ onDown, onMove, onUp, active }: {
  onDown: (e: React.PointerEvent) => void; onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void; active: boolean;
}) {
  return (
    <div
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onClick={(e) => e.stopPropagation()}
      title="اسحب لتغيير الحجم"
      className={`absolute bottom-0 left-0 z-30 h-8 w-8 cursor-nesw-resize transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0 group-hover/card:opacity-100"}`}
    >
      <svg viewBox="0 0 24 24" fill="none"
        className={`absolute bottom-1 left-1 h-5 w-5 rotate-180 transition-colors ${active ? "text-primary drop-shadow-[0_0_6px_rgba(59,130,246,0.85)]" : "text-muted-foreground/50 hover:text-primary hover:drop-shadow-[0_0_6px_rgba(59,130,246,0.85)]"}`}>
        <path d="M6 4 A14 14 0 0 1 20 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ChartCard({ title, icon: Icon, iconClass, children, empty, size = "medium", onResize, isDragging, onReorderStart, onReorderMove, onReorderEnd, cardRef }: any) {
  const resizable = typeof onResize === "function";
  const sortable = typeof onReorderStart === "function";
  const interactive = resizable || sortable;
  const controls = useDragControls();
  const elRef = useRef<HTMLDivElement | null>(null);
  const setRef = (el: HTMLDivElement | null) => { elRef.current = el; if (typeof cardRef === "function") cardRef(el); };

  // ── Live resize (follows the cursor; snaps to nearest tier on release) ──
  const [livePx, setLivePx] = useState<{ w: number; h: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number; colUnit: number; rowUnit: number } | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const el = elRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const [cs, rs] = TIER_SPAN[size as CardSize];
    resizeStart.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, colUnit: r.width / cs, rowUnit: r.height / rs };
    setLivePx({ w: r.width, h: r.height });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const s = resizeStart.current; if (!s) return;
    setLivePx({
      w: Math.max(s.colUnit * 0.6, s.w + (s.x - e.clientX)), // grow leftward
      h: Math.max(s.rowUnit * 0.6, s.h + (e.clientY - s.y)), // grow downward
    });
  };
  const onGripUp = () => {
    const s = resizeStart.current, lp = livePx;
    if (s && lp && resizable) {
      const liveCol = lp.w / s.colUnit;
      const nearestCol = [1, 2, 4].reduce((a, b) => (Math.abs(b - liveCol) < Math.abs(a - liveCol) ? b : a), 1);
      const dbl = lp.h / s.rowUnit >= 1.5;
      onResize(nearestCol <= 1 ? "small" : nearestCol === 2 ? "medium" : dbl ? "xlarge" : "large");
    }
    resizeStart.current = null; setLivePx(null);
  };
  const resizing = livePx !== null;

  return (
    <motion.div
      ref={setRef}
      layout={sortable && !resizing ? true : undefined}
      drag={sortable ? true : undefined}
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      dragSnapToOrigin
      onDragStart={() => onReorderStart?.()}
      onDrag={() => onReorderMove?.()}
      onDragEnd={() => onReorderEnd?.()}
      whileDrag={{ scale: 1.03, zIndex: 50 }}
      transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
      style={resizing && livePx ? { width: livePx.w, height: livePx.h, zIndex: 50 } : undefined}
      className={`glass-card p-5 relative flex h-full flex-col overflow-hidden ${interactive ? `group/card ${CARD_SPAN[size as CardSize]}` : ""} ${(isDragging || resizing) ? "shadow-2xl ring-2 ring-primary/40" : ""}`}
    >
      <h3 className="font-display font-bold text-base text-foreground mb-4 flex items-center gap-2 shrink-0">
        <Icon className={`w-5 h-5 ${iconClass}`} />
        <span className="flex-1 truncate">{title}</span>
        {sortable ? (
          <button onPointerDown={(e) => controls.start(e)} title="اسحب لتغيير ترتيب البطاقة" aria-label="اسحب لتغيير الترتيب"
            style={{ touchAction: "none" }}
            className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-primary group-hover/card:opacity-100 active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
      </h3>
      {empty ? (
        <div className="flex h-full min-h-[160px] flex-1 flex-col items-center justify-center text-center gap-2 text-muted-foreground">
          <BarChart3 className="w-8 h-8 opacity-30" />
          <p className="text-sm">لا توجد بيانات كافية لعرض هذا التقرير حاليًا</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{children}</div>
      )}
      {resizable ? <ResizeGrip onDown={onGripDown} onMove={onGripMove} onUp={onGripUp} active={resizing} /> : null}
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, children, iconClass = "text-primary" }: any) {
  return (
    <h2 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
      <Icon className={`w-5 h-5 ${iconClass}`} />
      {children}
    </h2>
  );
}

// ── Dashboard Tab (real data) ──────────────────────────────────────────────
function DashboardTab({ go, isDark }: { go: (tab: Tab) => void; isDark: boolean }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, error, refetch } = useOwnerSummary();
  // Chart axis labels readable on both themes; grid stays a subtle gray.
  const axisColor = isDark ? "#E5E7EB" : "#475569";
  const gridColor = isDark ? "rgba(255,255,255,0.14)" : "#EEF0F2";

  // Per-chart size tiers (persisted). `sizeProps(id)` wires a card to its size.
  const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>(loadCardSizes);
  const sizeProps = (id: string) => ({
    size: cardSizes[id] ?? "medium" as CardSize,
    onResize: (s: CardSize) => setCardSizes((prev) => {
      const next = { ...prev, [id]: s };
      try { localStorage.setItem(CARD_SIZES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    }),
  });

  // ── Drag-to-reorder (the grabbed card pixel-follows the cursor; on release it
  // snaps into the nearest slot and the others ease out of the way). ──
  const [order, setOrder] = useState<string[]>(loadCardOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragCenter = useRef<{ x: number; y: number } | null>(null);      // live centre of the grabbed card
  const dragStartCenter = useRef<{ x: number; y: number } | null>(null); // where the drag began
  const setCardRef = (id: string) => (el: HTMLElement | null) => { if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id); };
  const centerOf = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const onReorderStart = (id: string) => () => {
    const el = cardRefs.current.get(id);
    dragStartCenter.current = dragCenter.current = el ? centerOf(el) : null;
    setDraggingId(id);
  };
  // Only TRACK the grabbed card while it follows the cursor — no reordering yet, so
  // nothing competes with the drag (that was what made it stick near a neighbour).
  const onReorderMove = (id: string) => () => { const el = cardRefs.current.get(id); if (el) dragCenter.current = centerOf(el); };
  // On release: drop into the slot of the nearest other card; the rest ease over.
  const onReorderEnd = (id: string) => () => {
    const c = dragCenter.current, s = dragStartCenter.current;
    setDraggingId(null); dragCenter.current = dragStartCenter.current = null;
    if (!c || !s || Math.hypot(c.x - s.x, c.y - s.y) < 40) return; // tiny nudge → keep place
    let target: string | null = null, best = Infinity;
    for (const [oid, el] of cardRefs.current) {
      if (oid === id) continue;
      const oc = centerOf(el);
      const d = (oc.x - c.x) ** 2 + (oc.y - c.y) ** 2;
      if (d < best) { best = d; target = oid; }
    }
    if (!target) return;
    setOrder((cur) => {
      const from = cur.indexOf(id), to = cur.indexOf(target!);
      if (from < 0 || to < 0 || from === to) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, id);
      try { localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-card p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <p className="font-bold text-foreground">{(error as Error)?.message || "تعذر تحميل بيانات اللوحة"}</p>
        <button onClick={() => refetch()} className="btn-primary text-sm py-2 px-5 mx-auto">إعادة المحاولة</button>
      </div>
    );
  }

  const k = data.kpis;
  const alertItems = [
    { label: "طلبات اشتراك قيد المراجعة", value: data.alerts.pendingSubscriptions, icon: TicketPercent, action: () => navAdmin("subscriptionRequests") },
    { label: "رسائل دعم غير مقروءة", value: data.alerts.unreadSupport, icon: MessageSquare, action: () => navAdmin("supportMessages") },
    { label: "مواد بدون وحدات", value: data.alerts.subjectsWithoutUnits, icon: FolderTree, action: () => navAdmin("academic") },
    { label: "وحدات بدون دروس", value: data.alerts.unitsWithoutLessons, icon: Layers, action: () => navAdmin("academic") },
    { label: "دروس بدون فيديوهات", value: data.alerts.lessonsWithoutVideos, icon: Video, action: () => navAdmin("academic") },
    { label: "فيديوهات بدون تقسيمات", value: data.alerts.videosWithoutSegments, icon: ListVideo, action: () => navAdmin("academic") },
  ].filter((a) => a.value > 0);

  function navAdmin(tab: string) {
    setLocation(`/admin?tab=${tab}`);
  }

  const roleData = data.charts.roleDistribution.map((r) => ({ name: ROLE_LABELS[r.role] || r.role, value: r.value }));
  const subsData = data.charts.subscriptionsByStatus.map((s) => ({ name: STATUS_LABELS[s.status] || s.status, value: s.value }));
  const academicData = data.charts.academicContent.map((c) => ({
    name: ({ subjects: "مواد", units: "وحدات", lessons: "دروس", videos: "فيديوهات", segments: "تقسيمات" } as any)[c.name] || c.name,
    value: c.value,
  }));
  const growthData = data.charts.userGrowth.map((g) => ({ month: monthLabel(g.month), طلاب: g.students, معلمون: g.teachers, أخرى: g.others }));
  const activityData = data.charts.last7Days.map((d) => ({ day: dayLabel(d.day), مشاهدات: d.watch, اشتراكات: d.requests, رسائل: d.messages }));

  const quickActions = [
    { label: "إضافة محتوى أكاديمي", icon: GraduationCap, onClick: () => navAdmin("academic"), accent: "from-blue-500 to-indigo-600" },
    { label: "مراجعة طلبات الاشتراك", icon: TicketPercent, onClick: () => navAdmin("subscriptionRequests"), accent: "from-emerald-500 to-teal-600" },
    { label: "رسائل الدعم", icon: MessageSquare, onClick: () => navAdmin("supportMessages"), accent: "from-amber-500 to-orange-600" },
    { label: "إرسال إشعار", icon: Send, onClick: () => navAdmin("broadcastMessages"), accent: "from-violet-500 to-purple-600" },
    { label: "إضافة مستخدم", icon: Plus, onClick: () => go("admins"), accent: "from-sky-500 to-cyan-600" },
    { label: "تقرير المستخدمين", icon: FileBarChart, onClick: () => go("reports"), accent: "from-rose-500 to-pink-600" },
  ];

  // Chart descriptors keyed by id — rendered in `order` so they can be reordered.
  const chartCards: Record<string, { title: string; icon: any; iconClass: string; empty: boolean; children: React.ReactNode }> = {
    growth: {
      title: "نمو المستخدمين حسب الشهر", icon: TrendingUp, iconClass: "text-primary", empty: growthData.length === 0,
      children: (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={growthData}>
            <defs>
              {[["gS", "#3B82F6"], ["gT", "#10B981"], ["gO", "#F59E0B"]].map(([id, c]) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c} stopOpacity={0.25} /><stop offset="95%" stopColor={c} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fontFamily: "Cairo", fill: axisColor }} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} tickFormatter={numTick} tickMargin={AXIS_GAP} width={numAxisWidth(growthData.flatMap((g) => [g.طلاب, g.معلمون, g.أخرى]))} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 12 }} />
            <Area type="monotone" dataKey="طلاب" stroke="#3B82F6" fill="url(#gS)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="معلمون" stroke="#10B981" fill="url(#gT)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="أخرى" stroke="#F59E0B" fill="url(#gO)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      ),
    },
    roles: {
      title: "توزيع المستخدمين حسب الدور", icon: Users, iconClass: "text-violet-500", empty: roleData.every((r) => r.value === 0),
      children: (
        <div className="flex h-full items-center gap-4">
          <ResponsiveContainer width={180} height={200}>
            <PieChart>
              <Pie data={roleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={48}>
                {roleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {roleData.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</span>
                <span className="font-bold" style={{ color: COLORS[i % COLORS.length] }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    subs: {
      title: "الاشتراكات حسب الحالة", icon: TicketPercent, iconClass: "text-emerald-500", empty: subsData.every((s) => s.value === 0),
      children: (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={subsData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: "Cairo", fill: axisColor }} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} tickFormatter={numTick} tickMargin={AXIS_GAP} width={numAxisWidth(subsData.map((s) => s.value))} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="العدد" radius={[6, 6, 0, 0]}>
              {subsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ),
    },
    academic: {
      title: "المحتوى الأكاديمي", icon: GraduationCap, iconClass: "text-blue-500", empty: academicData.every((c) => c.value === 0),
      children: (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={academicData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: "Cairo", fill: axisColor }} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} tickFormatter={numTick} tickMargin={AXIS_GAP} width={numAxisWidth(academicData.map((c) => c.value))} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="العدد" fill="#3B82F6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ),
    },
    topSubjects: {
      title: "أكثر المواد اشتراكًا", icon: BarChart3, iconClass: "text-amber-500", empty: data.charts.topSubjects.length === 0,
      children: (
        <div dir="ltr" className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.charts.topSubjects} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} tickFormatter={numTick} tickMargin={AXIS_GAP} />
              <YAxis dataKey="name" type="category" orientation="left" tick={{ fontSize: 12, fontFamily: "Cairo", fill: axisColor }} tickMargin={AXIS_GAP} width={catAxisWidth(data.charts.topSubjects.map((s) => s.name))} interval={0} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="مشتركون" radius={[0, 6, 6, 0]}>
                {data.charts.topSubjects.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ),
    },
    activity: {
      title: "النشاط خلال آخر 7 أيام", icon: TrendingUp, iconClass: "text-sky-500", empty: activityData.every((d) => d.مشاهدات === 0 && d.اشتراكات === 0 && d.رسائل === 0),
      children: (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={activityData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fontFamily: "Cairo", fill: axisColor }} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} tickFormatter={numTick} tickMargin={AXIS_GAP} width={numAxisWidth(activityData.flatMap((d) => [d.مشاهدات, d.اشتراكات, d.رسائل]))} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: "Cairo", fontSize: 12 }} />
            <Area type="monotone" dataKey="مشاهدات" stroke="#06B6D4" fill="#06B6D433" strokeWidth={2} />
            <Area type="monotone" dataKey="اشتراكات" stroke="#10B981" fill="#10B98133" strokeWidth={2} />
            <Area type="monotone" dataKey="رسائل" stroke="#F59E0B" fill="#F59E0B33" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      ),
    },
  };

  return (
    <div className="space-y-6">
      {/* ── KPIs ── */}
      <div className="space-y-3">
        <SectionTitle icon={Users}>المستخدمون</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="إجمالي المستخدمين" value={k.totalUsers} icon={Users} color="text-primary" bg="from-blue-50 to-indigo-50" />
          <KpiCard label="الطلاب" value={k.totalStudents} icon={GraduationCap} color="text-sky-600" bg="from-sky-50 to-cyan-50" sub={`${fmt(k.activeStudents)} نشط · ${fmt(k.suspendedStudents)} موقوف`} />
          <KpiCard label="المعلمون" value={k.totalTeachers} icon={UsersIcon} color="text-emerald-600" bg="from-emerald-50 to-teal-50" />
          <KpiCard label="المشرفون / الملاك" value={k.totalAdmins} icon={ShieldCheck} color="text-violet-600" bg="from-violet-50 to-purple-50" />
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle icon={TicketPercent} iconClass="text-emerald-500">الاشتراكات والدعم</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="اشتراكات نشطة" value={k.activeSubscriptions} icon={CheckCircle2} color="text-emerald-600" bg="from-emerald-50 to-green-50" />
          <KpiCard label="طلبات قيد المراجعة" value={k.pendingSubscriptions} icon={Clock} color="text-amber-600" bg="from-amber-50 to-yellow-50" />
          <KpiCard label="طلبات مرفوضة" value={k.rejectedSubscriptions} icon={AlertTriangle} color="text-rose-600" bg="from-rose-50 to-red-50" />
          <KpiCard label="رسائل دعم غير مقروءة" value={k.unreadSupport} icon={MessageSquare} color="text-orange-600" bg="from-orange-50 to-amber-50" />
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle icon={GraduationCap} iconClass="text-blue-500">المحتوى الأكاديمي</SectionTitle>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          <KpiCard label="السنوات" value={k.totalYears} icon={FolderTree} color="text-indigo-600" bg="from-indigo-50 to-blue-50" />
          <KpiCard label="المواد" value={k.totalSubjects} icon={BookOpen} color="text-blue-600" bg="from-blue-50 to-sky-50" />
          <KpiCard label="الوحدات" value={k.totalUnits} icon={Layers} color="text-sky-600" bg="from-sky-50 to-cyan-50" />
          <KpiCard label="الدروس" value={k.totalLessons} icon={GraduationCap} color="text-cyan-600" bg="from-cyan-50 to-teal-50" />
          <KpiCard label="الفيديوهات" value={k.totalVideos} icon={Video} color="text-teal-600" bg="from-teal-50 to-emerald-50" />
          <KpiCard label="التقسيمات" value={k.totalSegments} icon={ListVideo} color="text-emerald-600" bg="from-emerald-50 to-green-50" />
        </div>
      </div>

      {/* ── Alerts ── */}
      <div className="glass-card p-5 space-y-3">
        <SectionTitle icon={Bell} iconClass="text-amber-500">تنبيهات تحتاج متابعة</SectionTitle>
        {alertItems.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold py-2">
            <CheckCircle2 className="w-5 h-5" /> لا توجد تنبيهات حاليًا 🎉
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertItems.map((a) => (
              <button key={a.label} onClick={a.action}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-400/10 border border-amber-200/50 dark:border-amber-400/25 hover:bg-amber-100/70 dark:hover:bg-amber-400/15 transition-all text-right">
                <span className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-400/15 flex items-center justify-center flex-shrink-0">
                  <a.icon className="w-4.5 h-4.5 text-amber-600" />
                </span>
                <span className="flex-1 text-sm font-semibold text-foreground">{a.label}</span>
                <span className="font-display font-black text-lg text-amber-600">{fmt(a.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="space-y-3">
        <SectionTitle icon={TrendingUp} iconClass="text-primary">إجراءات سريعة</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((a) => (
            <button key={a.label} onClick={a.onClick}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br ${a.accent} text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`}>
              <a.icon className="w-6 h-6" />
              <span className="text-xs font-bold text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Geographic distribution (Egypt heatmap) ── */}
      <EgyptHeatmap isDark={isDark} />

      {/* ── Charts (resizable + drag-to-reorder, reflowing 4-col grid) ── */}
      <motion.div layout className="grid grid-cols-1 lg:grid-cols-4 gap-5 auto-rows-[330px]">
        {order.map((id) => {
          const c = chartCards[id];
          if (!c) return null;
          return (
            <ChartCard key={id} title={c.title} icon={c.icon} iconClass={c.iconClass} empty={c.empty}
              {...sizeProps(id)}
              cardRef={setCardRef(id)}
              isDragging={draggingId === id}
              onReorderStart={onReorderStart(id)}
              onReorderMove={onReorderMove(id)}
              onReorderEnd={onReorderEnd(id)}>
              {c.children}
            </ChartCard>
          );
        })}
      </motion.div>

      <p className="text-center text-xs text-muted-foreground">آخر تحديث للبيانات: {fmtDate(data.generatedAt)} · جميع الأرقام حقيقية من قاعدة البيانات</p>
    </div>
  );
}

// Small alias to avoid clashing icon import name
const UsersIcon = Users;

// ── Reports Tab (real data) ────────────────────────────────────────────────
function ReportsTab() {
  const { data, isLoading, isError, refetch } = useOwnerSummary();
  if (isLoading) return <div className="glass-card p-8 animate-pulse h-64" />;
  if (isError || !data) return (
    <div className="glass-card p-8 text-center space-y-3">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
      <button onClick={() => refetch()} className="btn-primary text-sm py-2 px-5 mx-auto">إعادة المحاولة</button>
    </div>
  );
  const k = data.kpis;

  const reportCards = [
    { title: "تقرير المستخدمين", icon: Users, rows: [["إجمالي المستخدمين", k.totalUsers], ["الطلاب", k.totalStudents], ["المعلمون", k.totalTeachers], ["المشرفون والملاك", k.totalAdmins], ["طلاب نشطون", k.activeStudents], ["طلاب موقوفون", k.suspendedStudents]] },
    { title: "تقرير الاشتراكات", icon: TicketPercent, rows: [["اشتراكات نشطة", k.activeSubscriptions], ["قيد المراجعة", k.pendingSubscriptions], ["مقبولة", k.approvedSubscriptions], ["مرفوضة", k.rejectedSubscriptions]] },
    { title: "تقرير المحتوى الأكاديمي", icon: GraduationCap, rows: [["السنوات", k.totalYears], ["المواد", k.totalSubjects], ["الوحدات", k.totalUnits], ["الدروس", k.totalLessons], ["الفيديوهات", k.totalVideos], ["التقسيمات", k.totalSegments]] },
    { title: "تقرير الدعم والإشعارات", icon: MessageSquare, rows: [["رسائل غير مقروءة", k.unreadSupport], ["محادثات مفتوحة", k.openConversations], ["أجهزة أندرويد", k.pushTokensAndroid], ["أجهزة iOS", k.pushTokensIos], ["إجمالي الأجهزة", k.pushTokensTotal]] },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportCards.map((c) => (
          <div key={c.title} className="glass-card p-5">
            <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2"><c.icon className="w-5 h-5 text-primary" />{c.title}</h3>
            <div className="space-y-1.5">
              {c.rows.map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between text-sm py-1.5 border-b border-white/30 last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-bold text-foreground">{fmt(value as number)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent students */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2"><GraduationCap className="w-5 h-5 text-sky-500" />أحدث الطلاب المسجّلين</h3>
        {data.recent.students.length === 0 ? <EmptyRow /> : (
          <div className="space-y-1.5">
            {data.recent.students.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-2 border-b border-white/30 last:border-0">
                <div className="min-w-0"><p className="font-semibold text-foreground truncate">{s.name}</p><p className="text-xs text-muted-foreground truncate">{s.email}</p></div>
                <div className="text-left flex-shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{s.status === "active" ? "نشط" : "موقوف"}</span>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(s.joinedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent subscription requests */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-base mb-3 flex items-center gap-2"><TicketPercent className="w-5 h-5 text-emerald-500" />أحدث طلبات الاشتراك</h3>
        {data.recent.subscriptionRequests.length === 0 ? <EmptyRow /> : (
          <div className="space-y-1.5">
            {data.recent.subscriptionRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b border-white/30 last:border-0">
                <div className="min-w-0"><p className="font-semibold text-foreground truncate">{r.studentName || "—"}</p><p className="text-xs text-muted-foreground truncate">{r.subjectName || "—"}</p></div>
                <div className="text-left flex-shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "approved" ? "bg-emerald-100 text-emerald-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{STATUS_LABELS[r.status] || r.status}</span>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(r.submittedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">تصدير CSV / PDF — قيد التطوير (follow-up)</p>
    </div>
  );
}

function EmptyRow() {
  return <p className="text-sm text-muted-foreground py-4 text-center">لا توجد بيانات كافية لعرض هذا التقرير حاليًا</p>;
}

// ── Per-user details + activity timeline drawer (owner only) ───────────────
type ActivityResponse = {
  user: { id: number; name: string; email: string; role: string; status: string; phone: string | null; governorate: string | null; joinedAt: string; lastActiveAt: string | null; expectationStars?: number; scoringFrozen?: boolean };
  stats: { supportReplies: number; subscriptionsReviewed: number; subscriptionsGranted: number; requestsSubmitted: number; lessonsWatched: number; videosAdded: number };
  timeline: { type: string; at: string | null; title: string; detail: string }[];
};
const ACTIVITY_ICON: Record<string, React.ElementType> = {
  support_reply: MessageSquare, support_message: MessageSquare,
  subscription_review: TicketPercent, request_submitted: TicketPercent,
  subscription_grant: CheckCircle2, lesson_watch: Video,
  content_create: Video,
};
function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; }
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/40 dark:bg-white/[0.06] rounded-lg px-2.5 py-1.5"><span className="text-muted-foreground">{label}:</span> <span className="font-semibold text-foreground">{value}</span></div>;
}

// ── Export menu: morphing iOS-style glass popover (Excel / PDF) ───────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function defaultRange() {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const start = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  return { start, today };
}

function ExportMenu({ userId, userName }: { userId: number; userName: string }) {
  const [open, setOpen] = useState(false);
  const dr = defaultRange();
  const [from, setFrom] = useState(dr.start);
  const [to, setTo] = useState(dr.today);
  const [busy, setBusy] = useState<null | "excel" | "pdf">(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const invalid = from > to;
  const usingDefault = from === dr.start && to === dr.today;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const run = async (kind: "excel" | "pdf") => {
    setErr(null); setOk(null);
    if (invalid) { setErr("تاريخ البداية يجب أن يكون قبل تاريخ النهاية"); return; }
    setBusy(kind);
    try {
      const report = await fetchReport({ apiPath, headers: authHeader(), userId, from, to });
      if (kind === "excel") exportExcel(report);
      else await exportPdf(report);
      setOk(kind === "excel" ? "تم تنزيل ملف Excel ✓" : "تم تنزيل ملف PDF ✓");
    } catch (e) {
      setErr((e as Error)?.message || "تعذّر التصدير، حاول مجددًا");
    } finally {
      setBusy(null);
    }
  };

  const EASE = [0.22, 1, 0.36, 1] as const;

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.94 }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${open ? "bg-primary text-white border-primary" : "bg-white/60 dark:bg-white/10 text-primary border-white/70 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/[0.14]"}`}
      >
        <Download className="w-3.5 h-3.5" /> تصدير
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[80] bg-black/10 dark:bg-black/30"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }} onClick={() => setOpen(false)}
            />
            <motion.div
              dir="rtl"
              initial={{ opacity: 0, scale: 0.86, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ transformOrigin: "top left" }}
              className="absolute top-full left-0 mt-2 w-[290px] z-[90] rounded-2xl border border-white/60 dark:border-white/10 bg-white/85 dark:bg-[#15181e]/95 backdrop-blur-xl shadow-2xl p-4 overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06, duration: 0.25, ease: EASE }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">تصدير تقرير النشاط</p>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{userName}</span>
                </div>

                <div className="rounded-xl bg-white/50 dark:bg-white/[0.04] border border-white/60 dark:border-white/10 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-muted-foreground">الفترة</p>
                    {usingDefault && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">الشهر الحالي</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">من تاريخ</span>
                      <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setErr(null); setOk(null); }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white/70 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-[11px] outline-none focus:border-primary/50 text-foreground" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">إلى تاريخ</span>
                      <input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setErr(null); setOk(null); }}
                        className="w-full px-2 py-1.5 rounded-lg bg-white/70 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-[11px] outline-none focus:border-primary/50 text-foreground" />
                    </label>
                  </div>
                  {invalid && <p className="text-[10px] text-rose-600 font-semibold">تاريخ البداية يجب أن يكون قبل تاريخ النهاية</p>}
                </div>

                <div className="space-y-2">
                  <button onClick={() => run("excel")} disabled={busy !== null || invalid}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/[0.18] transition-colors disabled:opacity-50">
                    {busy === "excel" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                    <span>تصدير Excel</span>
                    <span className="mr-auto text-[9px] font-medium opacity-70">تقرير مفصّل</span>
                  </button>
                  <button onClick={() => run("pdf")} disabled={busy !== null || invalid}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-500/[0.18] transition-colors disabled:opacity-50">
                    {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    <span>تصدير PDF</span>
                    <span className="mr-auto text-[9px] font-medium opacity-70">ملخّص وتقييم</span>
                  </button>
                </div>

                {err && <p className="text-[10px] text-rose-600 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{err}</p>}
                {ok && <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{ok}</p>}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Owner control: per-admin expectation stars (1..5) + freeze ───────────────
const STAR_PCT = [70, 90, 100, 110, 150]; // 1★..5★ → % of the equal per-admin share
function ScoringControl({ userId, stars, frozen, onChanged }: { userId: number; stars: number; frozen: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [localStars, setLocalStars] = useState(stars);
  const [localFrozen, setLocalFrozen] = useState(frozen);
  const [hover, setHover] = useState(0);
  useEffect(() => { setLocalStars(stars); setLocalFrozen(frozen); }, [stars, frozen]);

  const patch = async (body: Record<string, unknown>, revert: () => void) => {
    setBusy(true);
    try {
      const res = await fetch(apiPath(`/api/admin/owner-dashboard/admin-scoring/${userId}`), {
        method: "PATCH", headers: { ...authHeader(), "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch { revert(); } finally { setBusy(false); }
  };
  const setStar = (s: number) => { const prev = localStars; setLocalStars(s); patch({ expectationStars: s }, () => setLocalStars(prev)); };
  const toggleFreeze = () => { const nf = !localFrozen; setLocalFrozen(nf); patch({ scoringFrozen: nf }, () => setLocalFrozen(!nf)); };
  const shown = hover || localStars;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} disabled={busy} onMouseEnter={() => setHover(i)} onClick={() => setStar(i)} title={`${STAR_PCT[i - 1]}% من النصيب المتوقَّع`} className="p-0.5 disabled:opacity-60">
            <Star className={`w-4 h-4 transition-colors ${i <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
          </button>
        ))}
        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mr-1">{STAR_PCT[localStars - 1]}%</span>
      </div>
      <button disabled={busy} onClick={toggleFreeze}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${localFrozen ? "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30" : "bg-white/50 dark:bg-white/[0.06] text-muted-foreground border-white/60 dark:border-white/10 hover:bg-white/70"}`}>
        <Snowflake className="w-3 h-3" />{localFrozen ? "مُجمّد (خارج القسمة)" : "تجميد الحساب"}
      </button>
    </div>
  );
}

function ActivityDrawer({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<ActivityResponse>({
    queryKey: ["admin-activity", userId],
    enabled: userId != null,
    queryFn: async () => {
      const res = await fetch(apiPath(`/api/admin/owner-dashboard/admin-activity/${userId}`), { headers: authHeader() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as any)?.error || "تعذر تحميل التفاصيل");
      return d as ActivityResponse;
    },
  });
  return (
    <AnimatePresence>
      {userId != null && (
        <>
          <motion.div className="fixed inset-0 bg-black/40 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div dir="rtl" className="fixed top-0 left-0 h-full w-full sm:max-w-md z-[70] bg-card border-l border-border shadow-2xl overflow-y-auto"
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}>
            <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border p-4 flex items-center justify-between z-10">
              <h3 className="font-display font-bold text-lg">تفاصيل وسجل النشاط</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-5">
              {isLoading ? <div className="animate-pulse h-40 bg-muted/40 rounded-2xl" /> :
               isError ? <p className="text-sm text-rose-600 text-center py-6">{(error as Error)?.message || "تعذر تحميل التفاصيل"}</p> :
               data ? (
                <>
                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-black text-lg flex-shrink-0">{data.user.name.charAt(0)}</div>
                        <div className="min-w-0"><p className="font-bold truncate">{data.user.name}</p><p className="text-xs text-muted-foreground truncate">{data.user.email}</p></div>
                      </div>
                      {data.user.role === "admin" && (
                        <ScoringControl
                          userId={data.user.id}
                          stars={data.user.expectationStars ?? 3}
                          frozen={data.user.scoringFrozen ?? false}
                          onChanged={() => queryClient.invalidateQueries({ queryKey: ["admin-activity", userId] })}
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Field label="الدور" value={ROLE_LABELS[data.user.role] || data.user.role} />
                      <Field label="الحالة" value={data.user.status === "active" ? "نشط" : "موقوف"} />
                      <Field label="الهاتف" value={data.user.phone || "—"} />
                      <Field label="المحافظة" value={data.user.governorate || "—"} />
                      <Field label="تاريخ الانضمام" value={fmtDate(data.user.joinedAt)} />
                      <Field label="آخر نشاط" value={fmtDateTime(data.user.lastActiveAt)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([["ردود دعم", data.stats.supportReplies], ["مراجعات", data.stats.subscriptionsReviewed], ["منح اشتراك", data.stats.subscriptionsGranted], ["فيديوهات مُضافة", data.stats.videosAdded], ["طلبات", data.stats.requestsSubmitted], ["دروس", data.stats.lessonsWatched]] as [string, number][]).map(([l, v]) => (
                      <div key={l} className="glass-card p-3 text-center"><p className="font-display font-black text-xl text-primary">{fmt(v)}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4 text-primary" />سجل النشاط ({fmt(data.timeline.length)})</h4>
                      <ExportMenu userId={data.user.id} userName={data.user.name} />
                    </div>
                    {data.timeline.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">لا يوجد نشاط مسجّل لهذا المستخدم</p> : (
                      <div className="space-y-2">
                        {data.timeline.map((it, i) => {
                          const Icon = ACTIVITY_ICON[it.type] || History;
                          return (
                            <div key={i} className="flex gap-3 p-3 rounded-2xl bg-white/40 dark:bg-white/[0.06] border border-white/40 dark:border-white/10">
                              <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-primary" /></span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">{it.title}</p>
                                {it.detail ? <p className="text-xs text-muted-foreground mt-0.5 break-words">{it.detail}</p> : null}
                                <p className="text-[11px] text-muted-foreground mt-1">{fmtDateTime(it.at)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
               ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Admins Tab (unchanged, real) ───────────────────────────────────────────
function AdminsTab() {
  const { data: allUsers = [], refetch } = useListAdminUsers();
  const admins = allUsers.filter((u) => (u.role as unknown as string) === "admin" || (u.role as unknown as string) === "owner");
  const updateUser = useUpdateAdminUser();
  const createUser = useCreateAdminUser();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">إدارة المشرفين ({admins.length})</h2>
        <button onClick={() => setAdding(true)} className="btn-primary text-sm py-2.5 px-5"><Plus className="w-4 h-4" /> إضافة مشرف</button>
      </div>

      {adding && (
        <div className="glass-card p-5 space-y-4 border-amber-200/40">
          <h3 className="font-bold text-foreground">إضافة مشرف / مالك جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["name", "الاسم الكامل"], ["email", "البريد الإلكتروني"], ["password", "كلمة المرور"]].map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{label}</label>
                <input type={key === "password" ? "password" : "text"} value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none focus:border-primary/50" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">الدور</label>
              <select value={form.role} onChange={(e) => set("role", e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white/70 border border-white/70 text-sm outline-none">
                <option value="admin">مشرف</option>
                <option value="owner">مالك</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { createUser.mutate({ data: form as any }, { onSuccess: () => { refetch(); setAdding(false); setForm({ name: "", email: "", password: "", role: "admin" }); } }); }} className="btn-primary text-sm py-2">إضافة</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-all">إلغاء</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {admins.map((u) => {
          const isOwner = (u.role as unknown as string) === "owner";
          return (
            <div key={u.id} className="glass-card p-5 pl-16 flex items-center gap-4 relative">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-display font-black text-lg flex-shrink-0 ${isOwner ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-violet-500 to-purple-600"}`}>{u.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
                <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${isOwner ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>{isOwner ? "مالك" : "مشرف"}</span>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {!isOwner && (
                  <button onClick={() => updateUser.mutate({ id: u.id, data: { role: "owner" } as any }, { onSuccess: () => refetch() })} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all">ترقية لمالك</button>
                )}
                <button onClick={() => { if (confirm(`إزالة ${u.name} من المشرفين؟`)) updateUser.mutate({ id: u.id, data: { role: "student" } as any }, { onSuccess: () => refetch() }); }} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 transition-all">إزالة الصلاحيات</button>
              </div>
              <button onClick={() => setDetailsId(u.id)} title="تفاصيل وسجل النشاط" className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-white/70 dark:bg-white/10 border border-white/70 dark:border-white/10 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-white dark:hover:bg-white/20 transition-all">
                <Info className="w-4.5 h-4.5" />
              </button>
            </div>
          );
        })}
      </div>
      <ActivityDrawer userId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

// ── All Users Tab (real) ───────────────────────────────────────────────────
const ROLE_FILTERS: [string, string][] = [["all", "الكل"], ["student", "طلاب"], ["teacher", "معلمون"], ["parent", "أولياء"], ["admin", "مشرفون"]];
const STATUS_FILTERS: [string, string][] = [["all", "الكل"], ["active", "نشط"], ["suspended", "موقوف"]];
const PAGE_SIZES = [20, 50, 100, 500];

function AllUsersTab() {
  const { data: users = [], refetch } = useListAdminUsers();
  const updateUser = useUpdateAdminUser();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [govFilter, setGovFilter] = useState("all");
  const [pageSize, setPageSize] = useState(20);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const ROLE_LABELS_T: Record<string, string> = { student: "طالب", teacher: "معلم", parent: "ولي أمر", admin: "مشرف", owner: "مالك", moderator: "مشرف محتوى" };
  const ROLE_COLORS: Record<string, string> = { student: "bg-blue-100 text-blue-700", teacher: "bg-emerald-100 text-emerald-700", parent: "bg-amber-100 text-amber-700", admin: "bg-violet-100 text-violet-700", owner: "bg-rose-100 text-rose-700", moderator: "bg-cyan-100 text-cyan-700" };

  // Governorates actually present in the data → the filter only offers real options.
  const govOptions = Array.from(new Set(users.map((u) => (u as any).governorate).filter(Boolean) as string[])).sort();
  const q = search.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (govFilter !== "all" && ((u as any).governorate || "") !== govFilter) return false;
    if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
  // Only render a capped slice so a large directory stays light; the count picker
  // (in the actions header) raises the cap on demand.
  const visible = filtered.slice(0, pageSize);
  const activeFilterCount = (roleFilter !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (govFilter !== "all" ? 1 : 0);
  const clearFilters = () => { setRoleFilter("all"); setStatusFilter("all"); setGovFilter("all"); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-display font-bold">جميع المستخدمين ({fmt(filtered.length)})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search by name / email */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد…"
              className="w-56 max-w-[60vw] pr-9 pl-3 py-2 rounded-xl text-sm bg-white/60 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          {/* Filter button → floating conditions card */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${activeFilterCount || filterOpen ? "bg-primary text-white border-primary shadow-md" : "bg-white/60 dark:bg-white/[0.06] border-white/70 dark:border-white/10 text-muted-foreground hover:text-foreground"}`}>
              <SlidersHorizontal className="w-4 h-4" /> فلترة
              {activeFilterCount > 0 ? (
                <span className="w-4 h-4 rounded-full bg-white/90 text-primary text-[10px] font-black flex items-center justify-center">{activeFilterCount}</span>
              ) : null}
            </button>
            {filterOpen ? (
              <>
                {/* click-away backdrop */}
                <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-40 w-72 rounded-2xl bg-white/97 dark:bg-[#11151b]/97 backdrop-blur border border-white/70 dark:border-white/10 shadow-2xl p-4 space-y-4" dir="rtl">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-foreground">شروط الفلترة</p>
                    {activeFilterCount > 0 ? (
                      <button onClick={clearFilters} className="text-[11px] font-bold text-primary hover:underline">مسح الكل</button>
                    ) : null}
                  </div>
                  <FilterGroup label="الدور" options={ROLE_FILTERS} value={roleFilter} onChange={setRoleFilter} />
                  <FilterGroup label="الحالة" options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
                  {govOptions.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-muted-foreground">المحافظة</p>
                      <select
                        value={govFilter}
                        onChange={(e) => setGovFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-white/70 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-foreground focus:outline-none focus:border-primary/50">
                        <option value="all">كل المحافظات</option>
                        {govOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b border-white/40">
              {["الاسم", "البريد", "الدور", "الحالة", "المحافظة"].map((h) => <th key={h} className="px-5 py-4 font-bold text-muted-foreground text-xs whitespace-nowrap">{h}</th>)}
              <th className="px-5 py-3 font-bold text-muted-foreground text-xs whitespace-nowrap">
                <div className="flex items-center justify-between gap-2">
                  <span>إجراءات</span>
                  {/* How many rows to render — keeps a big directory light. */}
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    title="عدد النتائج المعروضة"
                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white/70 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-foreground focus:outline-none focus:border-primary/50">
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </th>
            </tr></thead>
            <tbody className="divide-y divide-white/30">
              {visible.map((u) => (
                <tr key={u.id} className="hover:bg-white/30 transition-colors">
                  <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold ${ROLE_COLORS[u.role]?.replace("bg-", "bg-gradient-to-br from-").replace(" text-", "") || "bg-gray-400"}`}>{u.name.charAt(0)}</div><span className="font-semibold text-foreground">{u.name}</span></div></td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>{ROLE_LABELS_T[u.role] || u.role}</span></td>
                  <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{u.status === "active" ? "نشط" : "موقوف"}</span></td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{(u as any).governorate || "—"}</td>
                  <td className="px-5 py-3.5"><div className="flex items-center justify-between gap-2 w-full"><button onClick={() => updateUser.mutate({ id: u.id, data: { status: u.status === "active" ? "suspended" : "active" } as any }, { onSuccess: () => refetch() })} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 transition-all">{u.status === "active" ? "تعليق" : "تفعيل"}</button><button onClick={() => setDetailsId(u.id)} title="تفاصيل وسجل النشاط" className="w-8 h-8 rounded-lg bg-white/60 dark:bg-white/10 border border-white/70 dark:border-white/10 flex items-center justify-center text-muted-foreground hover:text-primary transition-all"><Info className="w-4 h-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون للبحث أو الفلترة</div>
        ) : filtered.length > visible.length ? (
          <div className="px-5 py-3 text-center text-xs text-muted-foreground border-t border-white/30">
            عرض {fmt(visible.length)} من {fmt(filtered.length)} — اختر عددًا أكبر من قائمة العدد بالأعلى لعرض المزيد
          </div>
        ) : null}
      </div>
      <ActivityDrawer userId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

// Small chip group used inside the users filter popover.
function FilterGroup({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${value === v ? "bg-primary text-white shadow" : "bg-white/60 dark:bg-white/[0.06] border border-white/70 dark:border-white/10 text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Owner Panel ───────────────────────────────────────────────────────
export default function OwnerPanel() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(getInitialAdminTheme);
  const isDarkAdmin = adminTheme === "dark";

  // Pick the slide direction from the tab's position in TABS — only the source
  // and destination pages animate, any tabs jumped over never render.
  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const navDirRef = useRef(0);
  const prevTabIndexRef = useRef(tabIndex);
  if (tabIndex !== prevTabIndexRef.current) {
    navDirRef.current = tabIndex > prevTabIndexRef.current ? 1 : -1;
    prevTabIndexRef.current = tabIndex;
  }
  const navDir = navDirRef.current;
  // The slide wrapper is `overflow-hidden` ONLY while a transition is running so
  // it clips the two sliding pages. At rest it must be visible — otherwise it
  // would shear off button shadows, popovers and dropdowns at the page edges.
  // Skip the very first mount (there's no slide to clip then).
  const [animating, setAnimating] = useState(false);
  const firstTabRender = useRef(true);
  useLayoutEffect(() => {
    if (firstTabRender.current) { firstTabRender.current = false; return; }
    setAnimating(true);
    window.scrollTo(0, 0); // start each vertical slide from the top
  }, [tab]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, adminTheme);
  }, [adminTheme]);

  // Wait for session restore before deciding, so a hard refresh doesn't bounce
  // a logged-in owner to login while the token is still being validated.
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "owner")) {
      setLocation("/login");
    }
  }, [authLoading, user, setLocation]);

  if (authLoading || !user || user.role !== "owner") {
    return null;
  }

  const TAB_CONTENT: Record<Tab, React.ReactNode> = {
    dashboard: <DashboardTab go={setTab} isDark={isDarkAdmin} />,
    reports: <ReportsTab />,
    admins: <AdminsTab />,
    users: <AllUsersTab />,
  };

  return (
    <div className={`admin-dashboard ${isDarkAdmin ? "dark" : ""} min-h-screen flex bg-background text-foreground`} dir="rtl">
      <div className="mesh-bg" />
      <aside className="hidden md:flex flex-col fixed top-0 right-0 h-screen w-64 z-40 glass-panel border-l border-white/60"
        style={{ borderImage: "linear-gradient(to bottom, rgba(245,158,11,0.3), rgba(255,255,255,0.4)) 1" }}>
        <div className="px-6 pt-7 pb-5">
          <Logo size={36} />
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#d97706" }}>
            <Crown className="w-3.5 h-3.5" /> لوحة المالك — صلاحيات عليا
          </div>
        </div>
        <div className="mx-5 h-px bg-gradient-to-l from-transparent via-border to-transparent mb-3" />
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto hide-scrollbar">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${tab === t.id ? "text-white shadow-md" : "text-muted-foreground hover:bg-white/60 hover:text-foreground"}`}
              style={tab === t.id ? { background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 4px 15px rgba(245,158,11,0.3)" } : {}}>
              <t.icon className="w-4.5 h-4.5 flex-shrink-0" /> {t.label}
            </button>
          ))}
          <div className="h-px bg-gradient-to-l from-transparent via-border to-transparent my-2" />
          <button onClick={() => setLocation("/admin")} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-muted-foreground hover:bg-violet-50 hover:text-violet-700 transition-all">
            <ShieldCheck className="w-4.5 h-4.5" /> لوحة المشرف الكاملة
          </button>
        </nav>
        <div className="p-4 border-t border-white/40">
          <div className="admin-theme-switch relative mb-4 grid h-12 grid-cols-2 overflow-hidden rounded-3xl border border-border/70 bg-muted/55 p-1 shadow-inner" dir="rtl">
            <motion.span
              className="absolute bottom-1 top-1 right-1 rounded-2xl bg-primary shadow-lg shadow-primary/25"
              style={{ width: "calc(50% - 0.25rem)" }}
              initial={false}
              animate={{ x: isDarkAdmin ? "-100%" : "0%" }}
              transition={{ type: "spring", stiffness: 430, damping: 31, mass: 0.8 }}
            />
            <button
              type="button"
              onClick={() => setAdminTheme("light")}
              className={`relative z-10 flex h-full items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition-colors duration-200 ${adminTheme === "light" ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={adminTheme === "light"}
            >
              <Sun className="h-3.5 w-3.5" /> فاتح
            </button>
            <button
              type="button"
              onClick={() => setAdminTheme("dark")}
              className={`relative z-10 flex h-full items-center justify-center gap-1.5 rounded-2xl text-xs font-black transition-colors duration-200 ${adminTheme === "dark" ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={adminTheme === "dark"}
            >
              <Moon className="h-3.5 w-3.5" /> داكن
            </button>
          </div>
          <div className="px-3 py-2 mb-2"><p className="text-xs font-semibold text-foreground">{user.name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
          <button onClick={() => { logout(); setLocation("/login"); }} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-all"><LogOut className="w-4 h-4" /> خروج</button>
        </div>
      </aside>
      <main className="flex-1 md:mr-64 p-5 md:p-8 max-w-full overflow-x-hidden">
        {/* Clip the sliding pages to this area; popLayout lets the outgoing and
            incoming page move together (vertical carousel) instead of waiting. */}
        <div className={`relative ${animating ? "overflow-hidden" : ""}`}>
          <AnimatePresence mode="popLayout" initial={false} custom={navDir} onExitComplete={() => setAnimating(false)}>
            <motion.div
              key={tab}
              custom={navDir}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.42 }}
              // Keep the page at least viewport-tall so the overflow-hidden clip
              // (needed for the slide) doesn't cut floating popovers when a tab's
              // content is short.
              className="min-h-[calc(100vh-4rem)]"
            >
              {TAB_CONTENT[tab]}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <InternalChatWidget isDark={isDarkAdmin} />
    </div>
  );
}
