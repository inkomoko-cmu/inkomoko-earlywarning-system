// import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? "");
    // if (s.includes(",") || s.includes("\n") || s.includes(""")) return `"${s.replace(/"/g, """")}"`;
    return s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  // saveAs(blob, `${filename}.csv`);
}

export function exportExcel(filename: string, rows: Record<string, any>[], sheetName = "Report") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  // saveAs(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
}

export function exportPDF(filename: string, title: string, rows: Record<string, any>[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(new Date().toLocaleString(), 40, 58);

  const headers = rows.length ? Object.keys(rows[0]) : [];
  const body = rows.map((r) => headers.map((h) => String(r[h] ?? "")));

  autoTable(doc, {
    head: [headers],
    body,
    startY: 80,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [11, 46, 91] },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${filename}.pdf`);
}

type DonorPackPayload = {
  title: string;
  subtitle?: string;
  generatedAt: string;
  source?: string;
  kpis: {
    enterprises: number;
    projectedRevenue: number;
    netJobs: number;
    avgRiskScore: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
  };
  takeaways: string[];
  horizonData: Array<{
    label: string;
    totalRevenue: number;
    netJobs: number;
    avgRiskScore: number;
  }>;
  actionItems: Array<{ priority?: string; action?: string; deadline?: string }>;
};

export function exportDonorPackPDF(filename: string, payload: DonorPackPayload) {
  const rows: Record<string, any>[] = [
    { Section: "Report", Item: "Title", Value: payload.title },
    { Section: "Report", Item: "Subtitle", Value: payload.subtitle ?? "" },
    { Section: "Report", Item: "Generated", Value: new Date(payload.generatedAt).toLocaleString() },
    { Section: "Report", Item: "Source", Value: payload.source ?? "" },
    { Section: "KPIs", Item: "Enterprises", Value: payload.kpis.enterprises },
    { Section: "KPIs", Item: "Projected Revenue", Value: payload.kpis.projectedRevenue },
    { Section: "KPIs", Item: "Net Jobs", Value: payload.kpis.netJobs },
    { Section: "KPIs", Item: "Average Risk Score", Value: payload.kpis.avgRiskScore },
    { Section: "KPIs", Item: "High Risk", Value: payload.kpis.highRisk },
    { Section: "KPIs", Item: "Medium Risk", Value: payload.kpis.mediumRisk },
    { Section: "KPIs", Item: "Low Risk", Value: payload.kpis.lowRisk },
    ...payload.takeaways.map((text, idx) => ({
      Section: "Takeaways",
      Item: `T${idx + 1}`,
      Value: text,
    })),
    ...payload.horizonData.map((row) => ({
      Section: "Horizon",
      Item: row.label,
      Value: `Revenue ${row.totalRevenue}, Net jobs ${row.netJobs}, Avg risk ${row.avgRiskScore}`,
    })),
    ...payload.actionItems.map((row, idx) => ({
      Section: "Action",
      Item: `${row.priority ?? ""} ${idx + 1}`.trim(),
      Value: `${row.action ?? ""} ${row.deadline ? `(Due ${row.deadline})` : ""}`.trim(),
    })),
  ];

  exportPDF(filename, payload.title, rows);
}
