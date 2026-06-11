// Admin activity export — Excel (detailed) + PDF (summary) generation.
// Data comes from the secure backend endpoint GET /api/admin/reports/activity.
// Files are generated client-side: the browser shapes Arabic/RTL correctly,
// avoiding the well-known pain of Arabic text in server-side PDF libraries.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export type ActivityRow = {
  at: string | null;
  actionType: string;
  actionLabel: string;
  category: string;
  entityType: string;
  entityId: string;
  target: string;
  oldValue: string;
  newValue: string;
  status: string;
  detail: string;
  ip: string;
  userAgent: string;
};

export type ReportData = {
  range: { from: string; to: string; days: number };
  generatedAt: string;
  generatedBy: { name: string; email: string; role: string } | null;
  user: {
    id: number; name: string; email: string; role: string; status: string;
    phone: string | null; governorate: string | null; joinedAt: string | null; lastActiveAt: string | null;
    expectationStars?: number; scoringFrozen?: boolean;
  };
  stats: {
    totalActions: number; subscriptionsReviewed: number; subscriptionsApproved: number;
    subscriptionsRejected: number; subscriptionsGranted: number; supportReplies: number;
    supportResolved: number; notificationsSent: number; contentActions: number;
    videosAdded: number;
    usersCreated: number; usersSuspended: number; usersDeleted: number;
    requestsSubmitted: number; lessonsWatched: number; activeDays: number;
  };
  score:
    | { available: false; reason: string; frozen?: boolean }
    | {
        available: true; value: number; label: string; stars: number;
        breakdown: { poolCount: number; poolTotal: number; equalShare: number; multiplier: number; expected: number; actual: number };
      };
  byActionType: Record<string, number>;
  byCategory: Record<string, number>;
  topActionTypes: { type: string; label: string; count: number }[];
  byDay: { day: string; count: number }[];
  activities: ActivityRow[];
  auditCoverage: { rows: number; since: string | null; note: string };
};

const ROLE_AR: Record<string, string> = { owner: "مالك", admin: "مشرف", teacher: "معلم", parent: "ولي أمر", student: "طالب" };

const dtFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const dFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : dtFmt.format(d);
}
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : dFmt.format(d);
}

export async function fetchReport(opts: {
  apiPath: (p: string) => string;
  headers: HeadersInit;
  userId: number;
  from: string;
  to: string;
}): Promise<ReportData> {
  const url = opts.apiPath(`/api/admin/reports/activity?from=${encodeURIComponent(opts.from)}&to=${encodeURIComponent(opts.to)}&adminId=${opts.userId}`);
  const res = await fetch(url, { headers: opts.headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || "تعذّر إنشاء التقرير");
  return data as ReportData;
}

export function reportFilenameBase(report: ReportData, kind: "" | "summary"): string {
  const slug = `admin-activity${kind ? `-${kind}` : ""}`;
  return `${slug}-${report.range.from}-to-${report.range.to}`;
}

// ── Excel (detailed, multi-sheet) ─────────────────────────────────────────────
export function exportExcel(report: ReportData): void {
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };

  // 1) ملخص
  const s = report.stats;
  const scoreLine = report.score.available
    ? [`${report.score.value}% من المتوقّع (${report.score.label})`]
    : [report.score.reason];
  const scoreDetailRows: (string | number)[][] = report.score.available
    ? [
        ["المستوى المتوقَّع (نجوم)", report.score.stars],
        ["النصيب العادل لكل مشرف", report.score.breakdown.equalShare],
        ["مُعامل المستوى", report.score.breakdown.multiplier],
        ["المتوقَّع من هذا المشرف", report.score.breakdown.expected],
        ["المُنجَز فعليًا", report.score.breakdown.actual],
        ["عدد المشرفين في التوزيع", report.score.breakdown.poolCount],
        ["إجمالي مهام الشهر", report.score.breakdown.poolTotal],
      ]
    : [];
  const summaryAoA: (string | number)[][] = [
    ["تقرير نشاط المشرف"],
    [],
    ["الفترة", `من ${report.range.from} إلى ${report.range.to} (${report.range.days} يوم)`],
    ["تاريخ الإنشاء", fmtDateTime(report.generatedAt)],
    ["أنشئ بواسطة", report.generatedBy ? `${report.generatedBy.name} (${report.generatedBy.email})` : "—"],
    ["المشرف / المستخدم", `${report.user.name} (${report.user.email})`],
    ["الدور", ROLE_AR[report.user.role] || report.user.role],
    ["الحالة", report.user.status === "active" ? "نشط" : "موقوف"],
    [],
    ["إجمالي الإجراءات", s.totalActions],
    ["أيام النشاط", s.activeDays],
    ["طلبات اشتراك راجعها", s.subscriptionsReviewed],
    ["— منها بالموافقة", s.subscriptionsApproved],
    ["— منها بالرفض", s.subscriptionsRejected],
    ["منح اشتراك مباشر", s.subscriptionsGranted],
    ["ردود الدعم", s.supportReplies],
    ["محادثات دعم تم حلّها", s.supportResolved],
    ["إشعارات مُرسلة", s.notificationsSent],
    ["إجراءات محتوى أكاديمي", s.contentActions],
    ["فيديوهات تعليمية مُضافة", s.videosAdded],
    ["مستخدمون أُنشئوا", s.usersCreated],
    ["مستخدمون أُوقفوا", s.usersSuspended],
    ["مستخدمون حُذفوا", s.usersDeleted],
    [],
    ["التقييم الشهري", ...scoreLine],
    ...scoreDetailRows,
    [],
    ["ملاحظة التدقيق", report.auditCoverage.note],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص");

  // shared detailed-rows builder
  const header = ["التاريخ والوقت", "نوع الإجراء", "الوصف", "التصنيف", "المستهدف", "نوع الكيان", "معرّف الكيان", "القيمة القديمة", "القيمة الجديدة", "الحالة", "التفاصيل", "IP"];
  const catAr: Record<string, string> = { subscription: "اشتراكات", support: "دعم", academic: "محتوى أكاديمي", user: "مستخدمون", notification: "إشعارات", auth: "دخول/خروج", other: "أخرى" };
  const toRow = (r: ActivityRow) => [
    fmtDateTime(r.at), r.actionLabel, r.actionType, catAr[r.category] || r.category,
    r.target, r.entityType, r.entityId, r.oldValue, r.newValue, r.status, r.detail, r.ip,
  ];
  const sheetFrom = (rows: ActivityRow[], emptyMsg: string) => {
    const body = rows.length ? rows.map(toRow) : [[emptyMsg]];
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 40 }, { wch: 16 }];
    return ws;
  };

  XLSX.utils.book_append_sheet(wb, sheetFrom(report.activities, "لا توجد أنشطة في هذه الفترة"), "كل الأنشطة");
  XLSX.utils.book_append_sheet(wb, sheetFrom(report.activities.filter((r) => r.category === "subscription"), "لا توجد إجراءات اشتراكات في هذه الفترة"), "الاشتراكات");
  XLSX.utils.book_append_sheet(wb, sheetFrom(report.activities.filter((r) => r.category === "support"), "لا توجد إجراءات دعم في هذه الفترة"), "الدعم والرسائل");
  XLSX.utils.book_append_sheet(wb, sheetFrom(report.activities.filter((r) => r.category === "academic"), "لا توجد إجراءات محتوى أكاديمي في هذه الفترة"), "المحتوى الأكاديمي");

  XLSX.writeFile(wb, `${reportFilenameBase(report, "")}.xlsx`);
}

// ── PDF (summary report, Arabic via DOM rendering) ────────────────────────────
function buildPdfHtml(report: ReportData): string {
  const s = report.stats;
  const stars = report.score.available ? "★".repeat(report.score.stars) + "☆".repeat(5 - report.score.stars) : "";
  const bd = report.score.available ? report.score.breakdown : null;
  const scoreBlock = report.score.available
    ? `<div style="display:flex;align-items:center;gap:16px;background:#f0f7ff;border:1px solid #cfe3ff;border-radius:16px;padding:18px 22px;">
         <div style="width:92px;height:92px;border-radius:50%;background:#1e63ff;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
           <div style="font-size:28px;font-weight:800;line-height:1;">${report.score.value}%</div>
           <div style="font-size:10px;opacity:.85;">من المتوقّع</div>
         </div>
         <div style="flex:1;">
           <div style="font-size:13px;color:#64748b;">التقييم الشهري (توزيع عادل للمهام)</div>
           <div style="font-size:24px;font-weight:800;color:#0f172a;">${report.score.label}</div>
           <div style="font-size:12px;color:#b45309;margin-top:2px;">المستوى المتوقَّع: ${stars}</div>
           <div style="font-size:11px;color:#64748b;margin-top:4px;">النصيب العادل: ${bd!.equalShare} مهمة × ${bd!.multiplier} = متوقَّع ${bd!.expected} · المُنجَز: ${bd!.actual} · عدد المشرفين: ${bd!.poolCount}</div>
         </div>
       </div>`
    : `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:18px 22px;color:#9a3412;font-weight:600;">${report.score.reason}</div>`;

  const statItem = (label: string, value: number, color = "#1e63ff") =>
    `<div style="background:#fff;border:1px solid #eef0f2;border-radius:14px;padding:14px 12px;text-align:center;">
       <div style="font-size:24px;font-weight:800;color:${color};line-height:1;">${value}</div>
       <div style="font-size:12px;color:#64748b;margin-top:6px;">${label}</div>
     </div>`;

  const topRows = report.topActionTypes.length
    ? report.topActionTypes.map((t) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eef0f2;">${t.label}</td><td style="padding:8px 12px;border-bottom:1px solid #eef0f2;text-align:left;font-weight:700;color:#1e63ff;">${t.count}</td></tr>`).join("")
    : `<tr><td colspan="2" style="padding:14px;text-align:center;color:#94a3b8;">لا توجد أنشطة في هذه الفترة</td></tr>`;

  const dayRows = report.byDay.length
    ? report.byDay.map((d) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;">${d.day}</td><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:left;font-weight:600;">${d.count}</td></tr>`).join("")
    : `<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8;">—</td></tr>`;

  const evalText = report.score.available
    ? `جرى توزيع إجمالي مهام الشهر (${bd!.poolTotal} مهمة) بالتساوي على ${bd!.poolCount} مشرفًا، فكان النصيب العادل لكل مشرف ${bd!.equalShare} مهمة. وبحسب المستوى المتوقَّع لهذا المشرف (${report.score.stars}★ = ${Math.round(bd!.multiplier * 100)}% من النصيب) يكون المتوقَّع منه ${bd!.expected} مهمة. أنجز فعليًا ${bd!.actual} مهمة، أي ${report.score.value}% من المتوقَّع — التقييم: «${report.score.label}». يشمل ذلك ${s.subscriptionsReviewed} مراجعة اشتراك و${s.supportReplies} ردًّا على الدعم.`
    : report.score.reason;

  return `
  <div style="width:794px;box-sizing:border-box;padding:40px;font-family:'Cairo','Tajawal',sans-serif;direction:rtl;background:#fff;color:#0f172a;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e63ff;padding-bottom:16px;margin-bottom:24px;">
      <div>
        <div style="font-size:26px;font-weight:800;">تقرير نشاط المشرف</div>
        <div style="font-size:13px;color:#64748b;margin-top:6px;">الفترة: ${report.range.from} ← ${report.range.to} (${report.range.days} يوم)</div>
      </div>
      <div style="text-align:left;font-size:12px;color:#64748b;">
        <div>تاريخ الإنشاء: ${fmtDateTime(report.generatedAt)}</div>
        <div>أنشئ بواسطة: ${report.generatedBy ? report.generatedBy.name : "—"}</div>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #eef0f2;border-radius:16px;padding:18px 22px;margin-bottom:22px;">
      <div style="font-size:18px;font-weight:800;">${report.user.name}</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">${report.user.email} · ${ROLE_AR[report.user.role] || report.user.role} · ${report.user.status === "active" ? "نشط" : "موقوف"}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:6px;">تاريخ الانضمام: ${fmtDate(report.user.joinedAt)} · آخر نشاط: ${fmtDateTime(report.user.lastActiveAt)}</div>
    </div>

    <div style="margin-bottom:22px;">${scoreBlock}</div>

    <div style="font-size:15px;font-weight:800;margin-bottom:12px;">مؤشرات الأداء</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;">
      ${statItem("إجمالي الإجراءات", s.totalActions)}
      ${statItem("أيام النشاط", s.activeDays, "#7c3aed")}
      ${statItem("مراجعات اشتراك", s.subscriptionsReviewed, "#0891b2")}
      ${statItem("موافقات", s.subscriptionsApproved, "#16a34a")}
      ${statItem("رفض", s.subscriptionsRejected, "#dc2626")}
      ${statItem("منح اشتراك", s.subscriptionsGranted, "#ca8a04")}
      ${statItem("ردود دعم", s.supportReplies, "#2563eb")}
      ${statItem("إشعارات", s.notificationsSent, "#db2777")}
      ${statItem("فيديوهات مُضافة", s.videosAdded, "#0d9488")}
    </div>

    <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-bottom:24px;">
      <div>
        <div style="font-size:15px;font-weight:800;margin-bottom:10px;">أكثر الإجراءات تكرارًا</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #eef0f2;border-radius:12px;overflow:hidden;">${topRows}</table>
      </div>
      <div>
        <div style="font-size:15px;font-weight:800;margin-bottom:10px;">النشاط حسب اليوم</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #eef0f2;border-radius:12px;overflow:hidden;">${dayRows}</table>
      </div>
    </div>

    <div style="background:#f0f7ff;border-right:4px solid #1e63ff;border-radius:12px;padding:16px 18px;margin-bottom:18px;">
      <div style="font-size:14px;font-weight:800;margin-bottom:6px;">خلاصة التقييم</div>
      <div style="font-size:13px;color:#334155;line-height:1.9;">${evalText}</div>
    </div>

    <div style="font-size:11px;color:#94a3b8;border-top:1px solid #eef0f2;padding-top:12px;line-height:1.7;">${report.auditCoverage.note}</div>
  </div>`;
}

export async function exportPdf(report: ReportData): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.innerHTML = buildPdfHtml(report);
  document.body.appendChild(host);
  try {
    const target = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/png");
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
    }
    pdf.save(`${reportFilenameBase(report, "summary")}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
