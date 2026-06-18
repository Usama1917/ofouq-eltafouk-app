// Reports-page export — Excel (full day-by-day detail) + PDF (one-page summary)
// for a single report card (تقرير المستخدمين / الاشتراكات / المحتوى / الدعم) over a
// chosen date range. Files are generated client-side so Arabic/RTL renders right.
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export type MetricColumn = { key: string; label: string; series: { day: string; value: number }[] };
export type ReportExport = {
  title: string;          // card title, e.g. "تقرير المستخدمين"
  from: string;           // YYYY-MM-DD
  to: string;             // YYYY-MM-DD
  days: number;
  color: string;          // accent hex
  metrics: MetricColumn[];
};

const dFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
function fmtDay(v: string): string { const d = new Date(`${v}T00:00:00`); return Number.isNaN(d.getTime()) ? v : dFmt.format(d); }
function firstLast(m: MetricColumn): { first: number; last: number } {
  return { first: m.series[0]?.value ?? 0, last: m.series[m.series.length - 1]?.value ?? 0 };
}
function fileBase(r: ReportExport): string { return `${r.title} ${r.from} إلى ${r.to}`; }

// ── Excel: a summary sheet + a day-by-day sheet covering every metric ──────────
export function exportReportExcel(r: ReportExport): void {
  const wb = XLSX.utils.book_new();
  (wb as any).Workbook = { Views: [{ RTL: true }] };

  const summary: (string | number)[][] = [
    [r.title],
    [],
    ["الفترة", `من ${r.from} إلى ${r.to} (${r.days} يوم)`],
    ["تاريخ الإنشاء", dFmt.format(new Date())],
    [],
    ["المؤشر", "قيمة البداية", "قيمة النهاية", "صافي التغيّر"],
    ...r.metrics.map((m) => { const { first, last } = firstLast(m); return [m.label, first, last, last - first]; }),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "ملخص");

  const days = r.metrics[0]?.series.map((s) => s.day) ?? [];
  const header = ["التاريخ", ...r.metrics.map((m) => m.label)];

  // Sheet 2 — cumulative value of every metric, day by day.
  const rows = days.map((day, i) => [fmtDay(day), ...r.metrics.map((m) => m.series[i]?.value ?? 0)]);
  const ws2 = XLSX.utils.aoa_to_sheet([header, ...(rows.length ? rows : [["لا توجد بيانات في هذه الفترة"]])]);
  ws2["!cols"] = [{ wch: 18 }, ...r.metrics.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, ws2, "تفصيل يومي (تراكمي)");

  // Sheet 3 — the day-by-day change (new items added each day) per metric.
  const changeRows = days.map((day, i) => [
    fmtDay(day),
    ...r.metrics.map((m) => (i === 0 ? 0 : (m.series[i]?.value ?? 0) - (m.series[i - 1]?.value ?? 0))),
  ]);
  const ws3 = XLSX.utils.aoa_to_sheet([header, ...(changeRows.length ? changeRows : [["لا توجد بيانات في هذه الفترة"]])]);
  ws3["!cols"] = [{ wch: 18 }, ...r.metrics.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, ws3, "التغيّر اليومي");

  XLSX.writeFile(wb, `${fileBase(r)}.xlsx`);
}

// ── PDF: a SHORT one-page summary — headline figures only, no day-by-day table.
function buildPdfHtml(r: ReportExport): string {
  const statBox = (m: MetricColumn) => {
    const { first, last } = firstLast(m);
    const delta = last - first;
    const deltaColor = delta > 0 ? "#1e63ff" : delta < 0 ? "#b45309" : "#94a3b8";
    const deltaTxt = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "— بدون تغيّر";
    return `<div style="background:#fff;border:1px solid #eef0f2;border-radius:16px;padding:20px 14px;text-align:center;">
      <div style="font-size:34px;font-weight:800;color:${r.color};line-height:1;">${last}</div>
      <div style="font-size:13px;color:#64748b;margin-top:8px;">${m.label}</div>
      <div style="font-size:12px;font-weight:700;color:${deltaColor};margin-top:6px;">${deltaTxt}</div>
    </div>`;
  };

  return `
  <div style="width:794px;box-sizing:border-box;padding:44px;font-family:'Cairo','Tajawal',sans-serif;direction:rtl;background:#fff;color:#0f172a;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${r.color};padding-bottom:18px;margin-bottom:30px;">
      <div>
        <div style="font-size:28px;font-weight:800;">${r.title}</div>
        <div style="font-size:13px;color:#64748b;margin-top:6px;">الفترة: ${r.from} ← ${r.to} (${r.days} يوم)</div>
      </div>
      <div style="text-align:left;font-size:12px;color:#64748b;">
        <div>تاريخ الإنشاء: ${dFmt.format(new Date())}</div>
        <div>أفق التفوّق — ملخّص زمني</div>
      </div>
    </div>

    <div style="font-size:16px;font-weight:800;margin-bottom:16px;">أهم المؤشرات في نهاية الفترة</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px;">
      ${r.metrics.map(statBox).join("")}
    </div>

    <div style="font-size:11px;color:#94a3b8;border-top:1px solid #eef0f2;padding-top:14px;line-height:1.8;">
      الرقم الكبير = القيمة في نهاية الفترة، والسطر تحته = صافي التغيّر خلالها. للتفاصيل اليومية الكاملة راجِع ملف Excel.
      جميع الأرقام تراكمية ومستخرجة مباشرةً من قاعدة البيانات.
    </div>
  </div>`;
}

export async function exportReportPdf(r: ReportExport): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.innerHTML = buildPdfHtml(r);
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
    pdf.save(`${fileBase(r)}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
