import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, Activity, GraduationCap } from "lucide-react";
import { EGYPT_VIEWBOX, EGYPT_GOV_PATHS, EGYPT_GOV_CENTROIDS } from "@/data/egypt-governorates";

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

// Weather-radar-style precipitation ramp: low→high = blue→violet→magenta→orange→yellow
const RAMP: [number, [number, number, number]][] = [
  [0.0, [37, 99, 235]],
  [0.3, [124, 58, 237]],
  [0.55, [219, 39, 119]],
  [0.8, [245, 158, 11]],
  [1.0, [253, 224, 71]],
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
  const selected = hovered ? byName.get(hovered) : null;
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
          <div className="relative rounded-2xl p-3 bg-gradient-to-b from-slate-50 to-white dark:from-[#0e1217] dark:to-[#141a21] border border-white/60 dark:border-white/10">
            <svg viewBox={EGYPT_VIEWBOX} className="w-full h-auto" style={{ maxHeight: 420 }}>
              <g>
                {Object.entries(EGYPT_GOV_PATHS).map(([name, d]) => {
                  const row = byName.get(name);
                  const v = row ? row[metric] : 0;
                  const isHot = v > 0;
                  const fill = isHot ? rampColor(v / maxVal) : emptyFill;
                  const isSel = hovered === name;
                  return (
                    <path key={name} d={d} fill={fill} stroke={isSel ? "#0f172a" : stroke}
                      strokeWidth={isSel ? 2.2 : 0.8}
                      style={{ cursor: "pointer", opacity: hovered && !isSel ? 0.72 : 1, transition: "opacity .15s, stroke-width .15s" }}
                      onMouseEnter={() => setHovered(name)} onMouseLeave={() => setHovered(null)} />
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

            {/* Legend */}
            <div className="flex items-center gap-2 mt-2 px-1">
              <span className="text-[10px] text-muted-foreground">منخفض</span>
              <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.3)}, ${rampColor(0.55)}, ${rampColor(0.8)}, ${rampColor(1)})` }} />
              <span className="text-[10px] text-muted-foreground">مرتفع</span>
            </div>

            {/* Hover tooltip */}
            {selected && (
              <div className="absolute top-3 right-3 max-w-[60%] rounded-xl bg-white/95 dark:bg-[#0e1217]/95 backdrop-blur border border-white/70 dark:border-white/10 shadow-xl px-3 py-2 pointer-events-none">
                <p className="text-sm font-bold text-foreground">{selected.name}</p>
                <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                  <p>المستخدمون: <span className="font-bold text-foreground">{fmt(selected.users)}</span> · النشطون: <span className="font-bold text-foreground">{fmt(selected.activeUsers)}</span></p>
                  <p>الاشتراكات: <span className="font-bold text-foreground">{fmt(selected.subscriptions)}</span></p>
                  <p>الأكثر اشتراكًا: <span className="font-bold text-primary">{selected.topSubject || "—"}</span></p>
                </div>
              </div>
            )}
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
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-white/50 dark:bg-white/[0.06] border border-white/60 dark:border-white/10 cursor-default">
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
