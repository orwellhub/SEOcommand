import { csvCell } from "./csv";

export function downloadReport(filename: string, body: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportRows(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  downloadReport(filename, [headers, ...rows].map(row => row.map(value => csvCell(value ?? "")).join(",")).join("\n"));
}
