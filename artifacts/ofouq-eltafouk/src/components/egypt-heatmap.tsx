import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, Activity, GraduationCap, Plus, Minus, X, RotateCcw, ChevronDown } from "lucide-react";
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

type GovRow = {
  name: string; users: number; students: number; activeUsers: number;
  subscriptions: number; topSubject: string | null; topSubjectCount: number;
};
type GeoResponse = {
  generatedAt: string;
  governorates: GovRow[];
  unknownUsers: number;
  totals: { coveredGovernorates: number; totalUsersWithGov: number; totalSubscriptions: number };
};

type Metric = "users" | "subscriptions" | "activeUsers";
const METRICS: { key: Metric; label: string; icon: React.ElementType }[] = [
  { key: "users", label: "عدد المستخدمين", icon: Users },
  { key: "subscriptions", label: "النشاط (الاشتراكات)", icon: Activity },
  { key: "activeUsers", label: "النشطون", icon: GraduationCap },
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
  const focusName = hovered ?? selectedName;
  const active = focusName ? byName.get(focusName) : null;
  const activeCentroid = focusName ? EGYPT_GOV_CENTROIDS[focusName] : null;
  // popup position as % of the (zoomed) viewBox; flip below the point near the top
  const popLeft = activeCentroid ? ((activeCentroid[0] - view.x) / view.w) * 100 : 0;
  const popTop = activeCentroid ? ((activeCentroid[1] - view.y) / view.h) * 100 : 0;
  const popBelow = popTop < 26;
  const topList = useMemo(
    () => [...(data?.governorates ?? [])].sort((a, b) => b[metric] - a[metric]).slice(0, 5),
    [data, metric],
  );

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-display font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-rose-500" />التوزيع الجغرافي عبر المحافظات</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${metric === m.key ? "bg-primary text-white border-primary" : "bg-white/50 dark:bg-white/[0.06] text-muted-foreground border-white/60 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10"}`}>
              <m.icon className="w-3.5 h-3.5" />{m.label}
            </button>
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
            <div ref={boxRef} className={`relative w-full overflow-hidden rounded-xl transition-[height] duration-300 ease-out ${expanded ? "h-[clamp(520px,70vh,820px)]" : "h-[clamp(300px,40vw,440px)]"}`}>
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
                        stroke="rgba(0,0,0,0.35)" strokeWidth={0.6}>{fmt(row[metric])}</text>
                    );
                  })}
                </g>
              </svg>

              {/* Floating popup above the clicked governorate */}
              {active && activeCentroid && popLeft >= 0 && popLeft <= 100 && popTop >= 0 && popTop <= 100 && (
                <div className="absolute z-20 w-[210px] pointer-events-none" style={{ left: `${popLeft}%`, top: `${popTop}%`, transform: `translate(-50%, ${popBelow ? "14px" : "calc(-100% - 14px)"})` }}>
                  <div className="relative rounded-xl bg-white/97 dark:bg-[#11151b]/97 backdrop-blur border border-white/70 dark:border-white/10 shadow-2xl px-3 py-2.5">
                    {selectedName && <button onClick={() => setSelectedName(null)} className="pointer-events-auto absolute top-2 left-2 w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="w-3 h-3" /></button>}
                    <p className="text-sm font-bold text-foreground pr-1">{active.name}</p>
                    <div className="text-[11px] text-muted-foreground mt-1.5 space-y-1">
                      <div className="flex justify-between gap-2"><span>المستخدمون</span><span className="font-bold text-foreground">{fmt(active.users)}</span></div>
                      <div className="flex justify-between gap-2"><span>النشطون</span><span className="font-bold text-foreground">{fmt(active.activeUsers)}</span></div>
                      <div className="flex justify-between gap-2"><span>الطلاب</span><span className="font-bold text-foreground">{fmt(active.students)}</span></div>
                      <div className="flex justify-between gap-2"><span>الاشتراكات</span><span className="font-bold text-foreground">{fmt(active.subscriptions)}</span></div>
                      <div className="flex justify-between gap-2 pt-1 border-t border-border/60"><span>الأكثر اشتراكًا</span><span className="font-bold text-primary truncate max-w-[100px]">{active.topSubject || "—"}</span></div>
                    </div>
                    {/* caret — same translucency + blur as the bubble so the
                        protruding tip matches the card's shade (a solid fill read
                        as a mismatched diamond in dark mode). */}
                    <div className={`absolute ${popBelow ? "-top-1.5" : "-bottom-1.5"} left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white/97 dark:bg-[#11151b]/97 backdrop-blur border-white/70 dark:border-white/10 ${popBelow ? "border-t border-r" : "border-b border-l"}`} />
                  </div>
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
              <Stat label="محافظات مغطّاة" value={data?.totals.coveredGovernorates ?? 0} />
              <Stat label="مستخدمون" value={data?.totals.totalUsersWithGov ?? 0} />
              <Stat label="اشتراكات" value={data?.totals.totalSubscriptions ?? 0} />
            </div>
            <p className="text-xs font-bold text-muted-foreground">الأعلى حسب {METRICS.find((m) => m.key === metric)?.label}</p>
            <div className={expanded ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2" : "space-y-2"}>
              {topList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات جغرافية بعد</p>
              ) : topList.map((g, i) => (
                <div key={g.name} onMouseEnter={() => setHovered(g.name)} onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelectedName(g.name)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${selectedName === g.name ? "bg-primary/10 border-primary/40" : "bg-white/50 dark:bg-white/[0.06] border-white/60 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10"}`}>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: rampColor(g[metric] / maxVal) }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{g.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{g.topSubject ? `الأكثر اشتراكًا: ${g.topSubject}` : "—"}</p>
                  </div>
                  <span className="font-display font-black text-primary text-lg">{fmt(g[metric])}</span>
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/50 dark:bg-white/[0.06] border border-white/60 dark:border-white/10 p-2.5 text-center">
      <p className="font-display font-black text-lg text-foreground">{fmt(value)}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
