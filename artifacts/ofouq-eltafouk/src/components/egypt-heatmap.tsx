import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { MapPin, Users, Activity, GraduationCap, Plus, Minus, X, RotateCcw, ChevronDown, Settings2, Maximize2, ShoppingCart, BookOpen, Banknote } from "lucide-react";
import { EGYPT_VIEWBOX, EGYPT_GOV_PATHS, EGYPT_GOV_CENTROIDS } from "@/data/egypt-governorates";

// viewBox is "0 0 W H" — parse the extents once for zoom + popup math.
const [, , MAP_W, MAP_H] = EGYPT_VIEWBOX.split(" ").map(Number);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (p: string) => `${BASE}${p}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const fmt = (n: number) => Number(n ?? 0).toLocaleString("en-US");
// Map labels sit inside a governorate shape, so a full "1,250,000" would spill
// past the borders — anything from 10k up is abbreviated (Western digits, per the
// app-wide numbering rule).
const fmtCompact = (n: number) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) < 10_000) return fmt(v);
  if (Math.abs(v) < 1_000_000) return `${Math.round(v / 100) / 10}k`;
  return `${Math.round(v / 100_000) / 10}M`;
};

type GovRow = {
  name: string; users: number; students: number; activeUsers: number;
  subscriptions: number; topSubject: string | null; topSubjectCount: number;
  grade1: number; grade2: number; grade3: number; watchHours: number;
  // Bookstore — keyed server-side by the order's DELIVERY governorate.
  orders: number; deliveredOrders: number; buyers: number;
  booksSold: number; salesEgp: number; topBook: string | null; topBookCount: number;
};

type FieldGroup = "edu" | "store";
const GROUP_LABEL: Record<FieldGroup, string> = { edu: "التعليم", store: "المتجر" };

// The fields the owner can show/hide on the per-governorate card. The floating card
// shows at most CARD_FIELD_LIMIT of these (in this order); the expanded card shows all.
type CardFieldKey =
  | "users" | "activeUsers" | "students" | "subscriptions" | "grade1" | "grade2" | "grade3" | "watchHours"
  | "orders" | "booksSold" | "salesEgp" | "buyers" | "deliveredOrders";
const CARD_FIELDS: { key: CardFieldKey; label: string; get: (g: GovRow) => number; suffix?: string; group: FieldGroup }[] = [
  { key: "users", label: "المستخدمون", get: (g) => g.users, group: "edu" },
  { key: "activeUsers", label: "النشطون", get: (g) => g.activeUsers, group: "edu" },
  { key: "students", label: "الطلاب", get: (g) => g.students, group: "edu" },
  { key: "subscriptions", label: "الاشتراكات", get: (g) => g.subscriptions, group: "edu" },
  { key: "grade1", label: "الأول الثانوي", get: (g) => g.grade1, group: "edu" },
  { key: "grade2", label: "الثاني الثانوي", get: (g) => g.grade2, group: "edu" },
  { key: "grade3", label: "الثالث الثانوي", get: (g) => g.grade3, group: "edu" },
  { key: "watchHours", label: "المشاهدات بالساعة", get: (g) => g.watchHours, suffix: " س", group: "edu" },
  { key: "orders", label: "الطلبات", get: (g) => g.orders, group: "store" },
  { key: "booksSold", label: "الكتب المُباعة", get: (g) => g.booksSold, group: "store" },
  { key: "salesEgp", label: "المبيعات", get: (g) => g.salesEgp, suffix: " ج.م", group: "store" },
  { key: "buyers", label: "طلاب اشتروا", get: (g) => g.buyers, group: "store" },
  { key: "deliveredOrders", label: "طلبات مُسلَّمة", get: (g) => g.deliveredOrders, group: "store" },
];
// Per GROUP, not overall: the floating card follows whichever tab is open, so the
// owner keeps one set of four education fields AND one set of four store fields
// instead of having to re-pick every time they switch tabs.
const CARD_FIELD_LIMIT = 4;
const DEFAULT_VISIBLE: Record<CardFieldKey, boolean> = {
  users: true, activeUsers: true, students: true, subscriptions: true,
  grade1: false, grade2: false, grade3: false, watchHours: false,
  orders: true, booksSold: true, salesEgp: true, buyers: true, deliveredOrders: false,
};
const FIELDS_STORAGE_KEY = "ofouq-geo-card-fields:v1";
function loadVisibleFields(): Record<CardFieldKey, boolean> {
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VISIBLE };
    const parsed = JSON.parse(raw) as Partial<Record<CardFieldKey, boolean>>;
    return { ...DEFAULT_VISIBLE, ...parsed };
  } catch {
    return { ...DEFAULT_VISIBLE };
  }
}
type GeoResponse = {
  generatedAt: string;
  governorates: GovRow[];
  unknownUsers: number;
  totals: {
    coveredGovernorates: number; totalUsersWithGov: number; totalSubscriptions: number;
    governoratesWithOrders: number; totalOrders: number; totalBooksSold: number; totalSalesEgp: number;
  };
};

type Metric = "users" | "subscriptions" | "activeUsers" | "orders" | "booksSold" | "salesEgp";
const METRICS: { key: Metric; label: string; icon: React.ElementType; group: FieldGroup; suffix?: string }[] = [
  { key: "users", label: "عدد المستخدمين", icon: Users, group: "edu" },
  { key: "subscriptions", label: "النشاط (الاشتراكات)", icon: Activity, group: "edu" },
  { key: "activeUsers", label: "النشطون", icon: GraduationCap, group: "edu" },
  { key: "orders", label: "الطلبات", icon: ShoppingCart, group: "store" },
  { key: "booksSold", label: "الكتب المُباعة", icon: BookOpen, group: "store" },
  { key: "salesEgp", label: "المبيعات", icon: Banknote, group: "store", suffix: " ج.م" },
];

// Ramp: low → high = red → yellow → blue → green (per request).
const RAMP: [number, [number, number, number]][] = [
  [0.0, [239, 68, 68]],   // أحمر — منخفض
  [0.33, [250, 204, 21]], // أصفر — تحت المتوسط
  [0.66, [37, 99, 235]],  // أزرق — فوق المتوسط
  [1.0, [34, 197, 94]],   // أخضر — عالي
];
function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [p0, c0] = RAMP[i - 1];
      const [p1, c1] = RAMP[i];
      const f = (x - p0) / (p1 - p0 || 1);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return `rgb(${RAMP[RAMP.length - 1][1].join(",")})`;
}

export function EgyptHeatmap({ isDark }: { isDark: boolean }) {
  const [metric, setMetric] = useState<Metric>("users");
  // Which card fields are shown, the settings popover, and the expanded governorate.
  const [visibleFields, setVisibleFields] = useState<Record<CardFieldKey, boolean>>(loadVisibleFields);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedGov, setExpandedGov] = useState<string | null>(null);
  useEffect(() => {
    try { localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(visibleFields)); } catch { /* ignore */ }
  }, [visibleFields]);
  // The open tab decides which half of the fields the card is about.
  const activeGroup: FieldGroup = METRICS.find((m) => m.key === metric)?.group ?? "edu";
  const groupFields = CARD_FIELDS.filter((f) => f.group === activeGroup);
  const enabledFields = groupFields.filter((f) => visibleFields[f.key]);
  const enabledCount = enabledFields.length;
  const shownFields = enabledFields.slice(0, CARD_FIELD_LIMIT);
  const toggleField = (key: CardFieldKey) =>
    setVisibleFields((prev) => {
      const next = !prev[key];
      // Enforce the max-visible cap WITHIN the group: block turning a 5th on.
      const group = CARD_FIELDS.find((f) => f.key === key)?.group;
      if (next && CARD_FIELDS.filter((f) => f.group === group && prev[f.key]).length >= CARD_FIELD_LIMIT) return prev;
      return { ...prev, [key]: next };
    });
  // Expanded view: card ~doubles in height, the map moves on top (taking ~3/4 of
  // the height) and the ranking panel sits below it (the remaining ~1/4).
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // The base box is the *actual* extent of the drawn governorate shapes —
  // measured from getBBox so the empty padding baked into EGYPT_VIEWBOX is
  // trimmed away and the map fills its frame edge-to-edge. Falls back to the
  // declared viewBox until the paths mount and report their real bounds.
  const pathsRef = useRef<SVGGElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [base, setBase] = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  // Zoom is driven by the SVG viewBox (vector strokes stay crisp).
  const [view, setView] = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const MIN_W = base.w / 5; // up to 5× zoom

  const clampView = (v: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(base.w, Math.max(MIN_W, v.w));
    const h = w * (base.h / base.w);
    const x = Math.min(Math.max(base.x, v.x), base.x + base.w - w);
    const y = Math.min(Math.max(base.y, v.y), base.y + base.h - h);
    return { x, y, w, h };
  };
  const zoomBy = (factor: number, center?: [number, number]) => {
    setView((v) => {
      const cx = center ? center[0] : v.x + v.w / 2;
      const cy = center ? center[1] : v.y + v.h / 2;
      const w = Math.min(base.w, Math.max(MIN_W, v.w / factor));
      const h = w * (base.h / base.w);
      return clampView({ x: cx - w / 2, y: cy - h / 2, w, h });
    });
  };
  const resetView = () => setView(base);

  // ── Free pan (grab & drag the map) ──────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const draggedRef = useRef(false); // true right after a drag → swallow the click
  const [panning, setPanning] = useState(false);
  // Hold Option/Alt → drag-to-pan mode (grab cursor, clicks don't select).
  const [panMode, setPanMode] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Alt" || e.altKey) setPanMode(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Alt" || !e.altKey) setPanMode(false); };
    const blur = () => setPanMode(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);
  const isZoomed = view.w < base.w - 0.5;

  // Hold Option/Alt + scroll over the map → zoom in/out toward the cursor. Uses a
  // native non-passive listener so we can preventDefault (stop the page scrolling).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // Cursor position as a fraction of the map frame.
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06; // gentle per-notch step
      // Anchored zoom: keep the point under the cursor fixed on screen (zoom toward
      // the cursor) instead of recentering on it.
      setView((v) => {
        const cx = v.x + fx * v.w;
        const cy = v.y + fy * v.h;
        const w = Math.min(base.w, Math.max(MIN_W, v.w / factor));
        const h = w * (base.h / base.w);
        return clampView({ x: cx - fx * w, y: cy - fy * h, w, h });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const onPanStart = (e: React.PointerEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    setPanning(true);
  };
  const onPanMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    const el = svgRef.current;
    if (!p || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) p.moved = true;
    // Convert screen drag → viewBox units; drag right pushes the map right.
    setView((v) => clampView({ ...v, x: p.vx - (dx / rect.width) * v.w, y: p.vy - (dy / rect.height) * v.h }));
  };
  const onPanEnd = () => {
    if (panRef.current?.moved) draggedRef.current = true;
    panRef.current = null;
    setPanning(false);
  };
  // Clicking empty map / outside it clears the pinned governorate — unless the
  // click is really the tail of a drag.
  const clearSelection = () => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    setSelectedName(null);
  };

  const { data, isLoading, isError } = useQuery<GeoResponse>({
    queryKey: ["owner-geo"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/admin/owner-dashboard/geo"), { headers: authHeader() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as any)?.error || "تعذّر تحميل الخريطة");
      return d as GeoResponse;
    },
  });

  // Once the static governorate paths are in the DOM, measure their true
  // bounding box and adopt it as the base view — trims the empty margins that
  // EGYPT_VIEWBOX pads around the country outline. Then EXPAND the base box to
  // the container's aspect ratio: the map keeps its on-screen size, centered,
  // while the deficient axis (usually horizontal) gains empty pan/zoom canvas so
  // a zoomed view reads as a wide landscape strip and fills the card edge-to-edge.
  // Matching aspect ratios keeps the SVG a 1:1 fill of the box → popup math stays simple.
  useLayoutEffect(() => {
    if (isLoading || isError) return;
    const g = pathsRef.current;
    const boxEl = boxRef.current;
    if (!g || !boxEl) return;
    const recompute = () => {
      try {
        const bb = g.getBBox();
        if (!bb.width || !bb.height) return;
        const rect = boxEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pad = Math.max(bb.width, bb.height) * 0.01; // hairline so strokes aren't clipped
        let x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
        const contAspect = rect.width / rect.height;
        if (contAspect > w / h) {
          const tw = h * contAspect; x -= (tw - w) / 2; w = tw; // container wider → horizontal canvas
        } else {
          const th = w / contAspect; y -= (th - h) / 2; h = th; // container taller → vertical canvas
        }
        const box = { x, y, w, h };
        setBase(box);
        setView(box);
      } catch { /* getBBox unavailable (e.g. detached) — keep the declared viewBox */ }
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(boxEl);
    return () => ro.disconnect();
  }, [isLoading, isError]);

  const byName = useMemo(() => {
    const m = new Map<string, GovRow>();
    for (const g of data?.governorates ?? []) m.set(g.name, g);
    return m;
  }, [data]);

  const maxVal = useMemo(() => {
    let mx = 0;
    for (const g of data?.governorates ?? []) mx = Math.max(mx, g[metric]);
    return mx || 1;
  }, [data, metric]);

  const emptyFill = isDark ? "#222831" : "#E9EDF2";
  const stroke = isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";
  // Live: the popup tracks whatever governorate you're pointing at; falls back to
  // the pinned (clicked) one when not hovering, and stays anchored as you zoom.
  // A pinned (clicked) governorate stays shown even while hovering others; hover only
  // drives the card when nothing is pinned.
  const focusName = selectedName ?? hovered;
  const active = focusName ? byName.get(focusName) : null;
  const activeCentroid = focusName ? EGYPT_GOV_CENTROIDS[focusName] : null;
  // popup position as % of the (zoomed) viewBox; flip below the point near the top
  const popLeft = activeCentroid ? ((activeCentroid[0] - view.x) / view.w) * 100 : 0;
  const popTop = activeCentroid ? ((activeCentroid[1] - view.y) / view.h) * 100 : 0;
  const popBelow = popTop < 26;
  // "Highest by X" must not list governorates whose X is zero — the list now spans
  // the union of user-governorates and order-governorates, so a place we only ship
  // to would otherwise show up ranked in a users chart with a flat 0.
  const topList = useMemo(
    () => [...(data?.governorates ?? [])].filter((g) => g[metric] > 0).sort((a, b) => b[metric] - a[metric]).slice(0, 5),
    [data, metric],
  );

  const expandedRow = expandedGov ? byName.get(expandedGov) ?? null : null;

  // The active metric decides which vocabulary the whole card speaks: the summary
  // strip, the ranking subtitle and the empty state all follow the store/education
  // split rather than being hard-wired to the user counts.
  const metricDef = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const isStoreMetric = activeGroup === "store";
  const noStoreData = isStoreMetric && (data?.totals.totalOrders ?? 0) === 0;
  const summaryStats = isStoreMetric
    ? [
        { label: "محافظات فيها طلبات", value: data?.totals.governoratesWithOrders ?? 0 },
        { label: "طلبات", value: data?.totals.totalOrders ?? 0 },
        { label: metric === "salesEgp" ? "مبيعات (ج.م)" : "كتب مُباعة", value: metric === "salesEgp" ? (data?.totals.totalSalesEgp ?? 0) : (data?.totals.totalBooksSold ?? 0) },
      ]
    : [
        { label: "محافظات مغطّاة", value: data?.totals.coveredGovernorates ?? 0 },
        { label: "مستخدمون", value: data?.totals.totalUsersWithGov ?? 0 },
        { label: "اشتراكات", value: data?.totals.totalSubscriptions ?? 0 },
      ];

  return (
    <LayoutGroup>
    <div className="glass-card p-5 relative">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-display font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-rose-500" />التوزيع الجغرافي عبر المحافظات</h3>
        {/* Two groups of metrics — education, then the store — split by a hairline
            so six chips still read as two short lists instead of one long row. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {METRICS.map((m, i) => (
            <div key={m.key} className="flex items-center gap-1.5">
              {i > 0 && METRICS[i - 1].group !== m.group && (
                <span className="w-px h-5 bg-slate-300/70 dark:bg-white/15 mx-0.5" aria-hidden />
              )}
              <button onClick={() => setMetric(m.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${metric === m.key ? "bg-primary text-white border-primary" : "bg-white/50 dark:bg-white/[0.06] text-muted-foreground border-white/60 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10"}`}>
                <m.icon className="w-3.5 h-3.5" />{m.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-72 bg-muted/40 rounded-2xl" />
      ) : isError ? (
        <p className="text-sm text-rose-600 text-center py-10">تعذّر تحميل بيانات الخريطة</p>
      ) : (
        <div className={`grid gap-5 ${expanded ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[1.4fr_1fr]"}`}>
          {/* Map */}
          <div onClick={clearSelection} className="rounded-2xl p-3 bg-gradient-to-b from-slate-50 to-white dark:from-[#0e1217] dark:to-[#141a21] border border-white/60 dark:border-white/10">
            {/* Fill the card width at a fixed height. The base box is expanded (in the
                layout effect) to this container's aspect ratio, so the SVG fills it 1:1
                — no letterbox — keeping the popup % math valid while the map keeps its
                size and the extra width becomes pan/zoom canvas. */}
            <div ref={boxRef} className={`relative w-full rounded-xl transition-[height] duration-300 ease-out ${expanded ? "h-[clamp(520px,70vh,820px)]" : "h-[clamp(300px,40vw,440px)]"}`}>
              {/* Inner wrapper clips the pan/zoom SVG; the popup lives OUTSIDE it so it
                  can overflow the map frame instead of being cut off at the edges. */}
              <div className="absolute inset-0 overflow-hidden rounded-xl">
              <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="absolute inset-0 w-full h-full"
                style={{ cursor: (panMode || isZoomed) ? (panning ? "grabbing" : "grab") : "default", touchAction: "none" }}
                onPointerDown={onPanStart} onPointerMove={onPanMove} onPointerUp={onPanEnd} onPointerLeave={onPanEnd}
                onClick={clearSelection}>
                <g ref={pathsRef}>
                  {Object.entries(EGYPT_GOV_PATHS).map(([name, d]) => {
                    const row = byName.get(name);
                    const v = row ? row[metric] : 0;
                    const fill = v > 0 ? rampColor(v / maxVal) : emptyFill;
                    const isActive = selectedName === name;
                    const isHover = hovered === name;
                    const dim = (hovered || selectedName) && !isActive && !isHover;
                    return (
                      <path key={name} d={d} fill={fill}
                        stroke={isActive ? "#0f172a" : isHover ? "#334155" : stroke}
                        strokeWidth={isActive ? 2.4 : isHover ? 1.6 : 0.8}
                        vectorEffect="non-scaling-stroke"
                        style={{ cursor: "pointer", opacity: dim ? 0.65 : 1, transition: "opacity .15s" }}
                        onMouseEnter={() => setHovered(name)} onMouseLeave={() => setHovered(null)}
                        onClick={(e) => { e.stopPropagation(); if (panMode || draggedRef.current) { draggedRef.current = false; return; } setSelectedName((cur) => (cur === name ? null : name)); }} />
                    );
                  })}
                </g>
                <g pointerEvents="none">
                  {Object.entries(EGYPT_GOV_CENTROIDS).map(([name, [cx, cy]]) => {
                    const row = byName.get(name);
                    if (!row || row[metric] <= 0) return null;
                    return (
                      <text key={name} x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: 13, fontWeight: 800, fill: "#fff", paintOrder: "stroke" }}
                        stroke="rgba(0,0,0,0.35)" strokeWidth={0.6}>{fmtCompact(row[metric])}</text>
                    );
                  })}
                </g>
              </svg>
              </div>

              {/* Floating popup above the clicked governorate */}
              {active && activeCentroid && !expandedGov && popLeft >= 0 && popLeft <= 100 && popTop >= 0 && popTop <= 100 && (
                <div className="absolute z-20 w-[210px] pointer-events-none" style={{ left: `${popLeft}%`, top: `${popTop}%`, transform: `translate(-50%, ${popBelow ? "14px" : "calc(-100% - 14px)"})` }}>
                  <motion.div layoutId={selectedName ? "gov-detail-card" : undefined} className="relative rounded-xl bg-white/97 dark:bg-[#11151b]/97 backdrop-blur border border-white/70 dark:border-white/10 shadow-2xl px-3 py-2.5">
                    {selectedName && (
                      <div className="pointer-events-auto absolute top-1.5 left-1.5 flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }} title="إعدادات البطاقة" className="w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"><Settings2 className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setExpandedGov(selectedName); }} title="توسيع" className="w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"><Maximize2 className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedName(null); }} title="إغلاق" className="w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="w-3 h-3" /></button>
                      </div>
                    )}
                    <p className="text-sm font-bold text-foreground pr-1">{active.name}</p>
                    <div className="text-[11px] text-muted-foreground mt-1.5 space-y-1">
                      {shownFields.length === 0 ? (
                        <div className="text-center py-1">لا عناصر مختارة</div>
                      ) : shownFields.map((f) => (
                        <div key={f.key} className="flex justify-between gap-2">
                          <span>{f.label}</span>
                          <span className="font-bold text-foreground">{fmt(f.get(active))}{f.suffix ?? ""}</span>
                        </div>
                      ))}
                    </div>
                    {/* caret — same translucency + blur as the bubble so the
                        protruding tip matches the card's shade (a solid fill read
                        as a mismatched diamond in dark mode). */}
                    <div className={`absolute ${popBelow ? "-top-1.5" : "-bottom-1.5"} left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white/97 dark:bg-[#11151b]/97 backdrop-blur border-white/70 dark:border-white/10 ${popBelow ? "border-t border-r" : "border-b border-l"}`} />
                  </motion.div>
                </div>
              )}

              {/* Zoom controls — bottom far-left, just above the legend (reset on top) */}
              <div onClick={(e) => e.stopPropagation()} className="absolute left-1 bottom-2 z-20 flex flex-col gap-1">
                {isZoomed && (
                  <button onClick={resetView} title="إعادة الضبط"
                    className="w-8 h-8 rounded-lg bg-white/90 dark:bg-[#11151b]/90 backdrop-blur border border-white/70 dark:border-white/10 shadow flex items-center justify-center text-foreground hover:bg-white dark:hover:bg-[#1a1f27]"><RotateCcw className="w-4 h-4" /></button>
                )}
                <button onClick={() => zoomBy(1.5, activeCentroid ?? undefined)} title="تكبير"
                  className="w-8 h-8 rounded-lg bg-white/90 dark:bg-[#11151b]/90 backdrop-blur border border-white/70 dark:border-white/10 shadow flex items-center justify-center text-foreground hover:bg-white dark:hover:bg-[#1a1f27]"><Plus className="w-4 h-4" /></button>
                <button onClick={() => zoomBy(1 / 1.5)} title="تصغير"
                  className="w-8 h-8 rounded-lg bg-white/90 dark:bg-[#11151b]/90 backdrop-blur border border-white/70 dark:border-white/10 shadow flex items-center justify-center text-foreground hover:bg-white dark:hover:bg-[#1a1f27]"><Minus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Legend: yellow (low) → blue → red (high) */}
            <div dir="ltr" className="flex items-center gap-2 mt-2 px-1">
              <span className="text-[10px] text-muted-foreground">منخفض</span>
              <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.33)}, ${rampColor(0.66)}, ${rampColor(1)})` }} />
              <span className="text-[10px] text-muted-foreground">مرتفع</span>
            </div>
          </div>

          {/* Ranking side panel */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {summaryStats.map((s) => (
                <Stat key={s.label} label={s.label} value={s.value} />
              ))}
            </div>
            <p className="text-xs font-bold text-muted-foreground">الأعلى حسب {metricDef.label}</p>
            <div className={expanded ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2" : "space-y-2"}>
              {topList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {noStoreData ? "لسه مفيش طلبات من المتجر" : isStoreMetric ? "مفيش بيانات للمتجر بعد" : "لا توجد بيانات جغرافية بعد"}
                </p>
              ) : topList.map((g, i) => (
                <div key={g.name} onMouseEnter={() => setHovered(g.name)} onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelectedName(g.name)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${selectedName === g.name ? "bg-primary/10 border-primary/40" : "bg-white dark:bg-white/[0.06] border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none hover:bg-slate-50 dark:hover:bg-white/10"}`}>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: rampColor(g[metric] / maxVal) }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                    {/* The subtitle answers "the top what?" for the metric in view —
                        best-selling book on the store tabs, top subject otherwise. */}
                    <p className="text-[11px] text-muted-foreground truncate">
                      {isStoreMetric
                        ? (g.topBook ? `الأكثر مبيعًا: ${g.topBook}` : "—")
                        : (g.topSubject ? `الأكثر اشتراكًا: ${g.topSubject}` : "—")}
                    </p>
                  </div>
                  <span className="font-display font-black text-primary text-lg">{fmt(g[metric])}{metricDef.suffix ?? ""}</span>
                  <button onClick={(e) => { e.stopPropagation(); setExpandedGov(g.name); }} title="توسيع"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0"><Maximize2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            {(data?.unknownUsers ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground text-center">{fmt(data!.unknownUsers)} مستخدم بدون محافظة محددة</p>
            )}
          </div>
        </div>
      )}

      {/* Expand / collapse toggle — centred at the bottom; chevron points down to
          expand, flips up to collapse. */}
      <div className="flex justify-center mt-4">
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "تصغير" : "تكبير"}
          aria-expanded={expanded}
          title={expanded ? "تصغير" : "تكبير"}
          className="w-10 h-10 rounded-full bg-white/70 dark:bg-white/[0.06] border border-white/60 dark:border-white/10 shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/90 dark:hover:bg-white/10 transition-colors">
          <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Card-fields settings popover */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div className="absolute inset-0 z-40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] rounded-[1.25rem]" onClick={() => setSettingsOpen(false)} />
            <motion.div className="relative w-[310px] max-w-full rounded-2xl bg-white dark:bg-[#11151b] border border-white/70 dark:border-white/10 shadow-2xl p-4"
              initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 8 }}>
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-bold text-sm flex items-center gap-1.5"><Settings2 className="w-4 h-4 text-primary" />بيانات البطاقة</h4>
                <button onClick={() => setSettingsOpen(false)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                اختَر اللي يظهر في بطاقة <span className="font-bold text-foreground">{GROUP_LABEL[activeGroup]}</span> — بحد أقصى {CARD_FIELD_LIMIT} عناصر.
              </p>
              {/* Only the open tab's fields: the card shows that group, so offering
                  the other group's toggles here would edit something invisible. */}
              <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pl-1">
                {groupFields.map((f) => {
                  const on = visibleFields[f.key];
                  const disabled = !on && enabledCount >= CARD_FIELD_LIMIT;
                  return (
                    <button key={f.key} onClick={() => toggleField(f.key)} disabled={disabled}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${on ? "bg-primary/10 border-primary/40 text-foreground" : disabled ? "opacity-40 cursor-not-allowed border-white/60 dark:border-white/10 text-muted-foreground" : "border-white/60 dark:border-white/10 text-muted-foreground hover:bg-muted/50"}`}>
                      <span>{f.label}</span>
                      <span className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-primary" : "bg-muted"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "left-0.5"}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 text-center">{enabledCount} / {CARD_FIELD_LIMIT} مُفعّل</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded two-pane governorate card */}
      <AnimatePresence>
        {expandedGov && expandedRow && (
          <motion.div className="absolute inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm rounded-[1.25rem]" onClick={() => setExpandedGov(null)} />
            <motion.div layoutId="gov-detail-card" transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-[#11151b] border border-white/70 dark:border-white/10 shadow-2xl overflow-hidden">
              <button onClick={() => setExpandedGov(null)} title="إغلاق" className="absolute top-3 left-3 z-10 w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 border border-white/60 dark:border-white/10 flex items-center justify-center text-foreground hover:bg-white dark:hover:bg-white/20"><X className="w-4 h-4" /></button>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.2 }} className="grid grid-cols-1 md:grid-cols-2">
                {/* Right pane (first child = right in RTL): zoomed governorate shape + name */}
                <div className="relative h-[240px] md:h-[440px] bg-gradient-to-b from-slate-50 to-white dark:from-[#0e1217] dark:to-[#141a21] border-b md:border-b-0 md:border-l border-white/60 dark:border-white/10 p-4">
                  <GovernorateShape name={expandedGov} isDark={isDark} metricValue={expandedRow[metric]} maxVal={maxVal} />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="px-4 py-1.5 rounded-full bg-white/85 dark:bg-[#11151b]/85 backdrop-blur border border-white/70 dark:border-white/10 text-base font-black text-foreground shadow">{expandedGov}</span>
                  </div>
                </div>
                {/* Left pane: ALL the governorate data */}
                <div className="p-5 md:p-6 max-h-[70vh] md:max-h-[440px] overflow-y-auto">
                  <h3 className="font-display font-black text-xl text-foreground mb-1">{expandedGov}</h3>
                  <p className="text-xs text-muted-foreground mb-4">كل بيانات المحافظة</p>
                  <div className="space-y-2">
                    {CARD_FIELDS.map((f, i) => {
                      const startsGroup = i === 0 || CARD_FIELDS[i - 1].group !== f.group;
                      return (
                        <div key={f.key} className="space-y-2">
                          {startsGroup && (
                            <p className={`text-[11px] font-black text-muted-foreground/70 px-1 ${i === 0 ? "" : "pt-2"}`}>{GROUP_LABEL[f.group]}</p>
                          )}
                          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/50 dark:bg-white/[0.06] border border-white/60 dark:border-white/10">
                            <span className="text-sm text-muted-foreground">{f.label}</span>
                            <span className="text-base font-black text-foreground">{fmt(f.get(expandedRow))}{f.suffix ?? ""}</span>
                          </div>
                          {/* Each group closes with its own "top" highlight row. */}
                          {i === CARD_FIELDS.length - 1 || CARD_FIELDS[i + 1].group !== f.group ? (
                            f.group === "edu" ? (
                              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                                <span className="text-sm text-muted-foreground">الأكثر اشتراكًا</span>
                                <span className="text-base font-black text-primary truncate max-w-[150px]">{expandedRow.topSubject || "—"}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                                <span className="text-sm text-muted-foreground">الأكثر مبيعًا</span>
                                <span className="text-base font-black text-primary truncate max-w-[150px]">{expandedRow.topBook || "—"}</span>
                              </div>
                            )
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </LayoutGroup>
  );
}

function GovernorateShape({ name, isDark, metricValue, maxVal }: { name: string; isDark: boolean; metricValue: number; maxVal: number }) {
  const ref = useRef<SVGPathElement>(null);
  const [vb, setVb] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const bb = el.getBBox();
      if (!bb.width || !bb.height) return;
      const pad = Math.max(bb.width, bb.height) * 0.12;
      setVb(`${bb.x - pad} ${bb.y - pad} ${bb.width + pad * 2} ${bb.height + pad * 2}`);
    } catch {
      /* getBBox unavailable — keep full viewBox */
    }
  }, [name]);
  const d = EGYPT_GOV_PATHS[name];
  if (!d) return null;
  const fill = metricValue > 0 ? rampColor(metricValue / (maxVal || 1)) : isDark ? "#222831" : "#E9EDF2";
  return (
    <svg viewBox={vb ?? EGYPT_VIEWBOX} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <path ref={ref} d={d} fill={fill} stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(15,23,42,0.45)"} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none p-2.5 text-center">
      <p className="font-display font-black text-lg text-foreground">{fmt(value)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
