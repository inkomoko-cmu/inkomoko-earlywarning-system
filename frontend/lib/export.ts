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
