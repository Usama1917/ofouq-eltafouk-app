import { useEffect, useState } from "react";
import { ArrowRight, CheckCheck, Mail, RefreshCw, Users } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiPath = (path: string) => `${BASE}${path}`;
const authHeader = (): Record<string, string> => {
  const token = localStorage.getItem("ofouq_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const dateFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

interface Campaign {
  id: number;
  kind: string;
  sourceKey: string | null;
  title: string;
  body: string;
  audienceSummary: string | null;
  sentByUserId: number | null;
  pushSentCount: number;
  createdAt: string;
  recipientCount: number;
  readCount: number;
}

interface Recipient {
  userId: number;
  name: string;
  avatarUrl: string | null;
  title: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}

function kindBadge(kind: string) {
  if (kind === "manual") return { label: "يدوي", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  return { label: "مؤتمت", cls: "bg-violet-50 text-violet-700 border-violet-200" };
}

export default function NotificationReportTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [openCampaign, setOpenCampaign] = useState<Campaign | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiPath("/api/admin/notification-report"), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل التقرير");
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openDrill(c: Campaign) {
    setOpenId(c.id);
    setOpenCampaign(c);
    setRecipientsLoading(true);
    setRecipients([]);
    try {
      const res = await fetch(apiPath(`/api/admin/notification-report/${c.id}`), { headers: authHeader() });
      if (!res.ok) throw new Error("تعذّر تحميل المستلمين");
      const data = await res.json();
      setRecipients(data.recipients ?? []);
    } catch {
      setRecipients([]);
    } finally {
      setRecipientsLoading(false);
    }
  }

  function closeDrill() {
    setOpenId(null);
    setOpenCampaign(null);
    setRecipients([]);
  }

  if (loading) {
    return <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>;
  }

  // ---- Drill-down: one campaign's recipients ----
  if (openId !== null && openCampaign) {
    const c = openCampaign;
    return (
      <div className="space-y-4">
        <button onClick={closeDrill} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
          <ArrowRight className="w-4 h-4" /> رجوع لكل الإرسالات
        </button>

        <div className="glass-card p-5 space-y-2 border-primary/20">
          <h3 className="font-display font-bold text-lg">{c.title}</h3>
          <p className="text-sm text-muted-foreground leading-7">{c.body}</p>
          <div className="flex flex-wrap gap-4 pt-2 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-foreground"><Users className="w-4 h-4 text-primary" /> {c.recipientCount} مستلم</span>
            <span className="flex items-center gap-1.5 text-emerald-600"><CheckCheck className="w-4 h-4" /> {c.readCount} فتحوا الرسالة</span>
            <span className="text-muted-foreground">{fmtDate(c.createdAt)}</span>
          </div>
        </div>

        {recipientsLoading ? (
          <div className="glass-card p-8 text-center text-sm font-bold text-muted-foreground">جاري التحميل...</div>
        ) : (
          <div className="glass-card p-0 overflow-hidden border-primary/20">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right">الطالب</th>
                  <th className="px-4 py-3 text-right">وقت الإرسال</th>
                  <th className="px-4 py-3 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.userId} className="border-t border-border/60">
                    <td className="px-4 py-3 font-semibold">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.sentAt)}</td>
                    <td className="px-4 py-3">
                      {r.readAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          <CheckCheck className="w-3 h-3" /> فتحها {fmtDate(r.readAt)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          لم تُفتح بعد
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {recipients.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">لا يوجد مستلمون.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---- Campaign list ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-bold text-muted-foreground">كل الرسائل اللي اتبعتت (يدوي ومؤتمت). دوس على أي واحدة تشوف مين وصلته وإمتى ومين فتحها.</p>
        <button onClick={() => void load()} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

      {campaigns.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-2">
          <Mail className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-bold text-muted-foreground">لسه مفيش رسائل اتبعتت.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const badge = kindBadge(c.kind);
            const readPct = c.recipientCount > 0 ? Math.round((c.readCount / c.recipientCount) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => void openDrill(c)}
                className="w-full text-right glass-card p-4 border-primary/15 hover:border-primary/40 transition flex items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                    <h4 className="font-bold text-sm truncate">{c.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.body}</p>
                  <div className="flex flex-wrap gap-3 text-[11px] font-bold text-muted-foreground pt-1">
                    {c.audienceSummary ? <span>{c.audienceSummary}</span> : null}
                    <span>{fmtDate(c.createdAt)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-foreground justify-end">
                    <Users className="w-4 h-4 text-primary" /> {c.recipientCount}
                  </div>
                  <div className="text-[11px] font-bold text-emerald-600 mt-1">فتحوها {readPct}%</div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
