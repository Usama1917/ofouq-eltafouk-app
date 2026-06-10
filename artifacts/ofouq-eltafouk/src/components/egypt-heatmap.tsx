import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, Activity, GraduationCap, Plus, Minus, X, RotateCcw } from "lucide-react";
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

// Ramp: low → high = yellow → blue → red (per request).
const RAMP: [number, [number, number, number]][] = [
  [0.0, [250, 204, 21]],  // أصفر — أقل
  [0.5, [37, 99, 235]],   // أزرق — متوسط
  [1.0, [239, 68, 68]],   // أحمر — أعلى
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Zoom is driven by the SVG viewBox (vector strokes stay crisp).
  const [view, setView] = useState({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const MIN_W = MAP_W / 5; // up to 5× zoom

  const clampView = (v: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(MAP_W, Math.max(MIN_W, v.w));
    const h = w * (MAP_H / MAP_W);
    const x = Math.min(Math.max(0, v.x), MAP_W - w);
    const y = Math.min(Math.max(0, v.y), MAP_H - h);
    return { x, y, w, h };
  };
  const zoomBy = (factor: number, center?: [number, number]) => {
    setView((v) => {
      const cx = center ? center[0] : v.x + v.w / 2;
      const cy = center ? center[1] : v.y + v.h / 2;
      const w = Math.min(MAP_W, Math.max(MIN_W, v.w / factor));
      const h = w * (MAP_H / MAP_W);
      return clampView({ x: cx - w / 2, y: cy - h / 2, w, h });
    });
  };
  const resetView = () => setView({ x: 0, y: 0, w: MAP_W, h: MAP_H });

  const { data, isLoading, isError } = useQuery<GeoResponse>({
    queryKey: ["owner-geo"],
    queryFn: async () => {
      const res = await fetch(apiPath("/api/admin/owner-dashboard/geo"), { headers: authHeader() });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as any)?.error || "تعذّر تحميل الخريطة");
      return d as GeoResponse;
    },
  });

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
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
          {/* Map */}
          <div className="rounded-2xl p-3 bg-gradient-to-b from-slate-50 to-white dark:from-[#0e1217] dark:to-[#141a21] border border-white/60 dark:border-white/10">
            <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: `${MAP_W} / ${MAP_H}`, maxHeight: 440 }}>
              <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="absolute inset-0 w-full h-full" onClick={() => setSelectedName(null)}>
                <g>
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
                        onClick={(e) => { e.stopPropagation(); setSelectedName((cur) => (cur === name ? null : name)); }} />
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
                    {/* caret */}
                    <div className={`absolute ${popBelow ? "-top-1.5" : "-bottom-1.5"} left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white dark:bg-[#11151b] border-white/70 dark:border-white/10 ${popBelow ? "border-t border-r" : "border-b border-l"}`} />
                  </div>
                </div>
              )}

              {/* Zoom controls — bottom-left corner (reset on top) */}
              <div className="absolute bottom-2 left-2 z-20 flex flex-col gap-1">
                {(view.w < MAP_W - 1) && (
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
              <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
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
            <div className="space-y-2">
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
