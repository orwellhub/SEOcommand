"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";
import { cellText, csvCell } from "@/lib/csv";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortValue?: (row: T) => number | string;
  exportValue?: (row: T) => number | string | null;
  render: (row: T) => React.ReactNode;
  width?: string;
}

export function DataTable<T>({
  rows,
  columns,
  searchKeys,
  pageSize = 12,
  onRowClick,
  searchPlaceholder = "Search…",
  emptyLabel = "No rows match the current filters.",
  exportName,
  toolbar,
  rowKey,
  columnControls = true,
}: {
  rows: T[];
  columns: Column<T>[];
  searchKeys?: (row: T) => string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
  exportName?: string;
  toolbar?: React.ReactNode;
  rowKey?: (row: T) => string;
  columnControls?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);
  const visibleColumns = columns.filter((column, index) => index === 0 || !hidden.has(column.key));

  const filtered = useMemo(() => {
    let out = rows;
    if (query && searchKeys) {
      const q = query.toLowerCase();
      out = out.filter((r) => searchKeys(r).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return out;
  }, [rows, query, sortKey, sortDir, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * rowsPerPage, (clampedPage + 1) * rowsPerPage);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  function exportCsv() {
    const header = visibleColumns.map((c) => csvCell(c.header)).join(",");
    const body = filtered
      .map((r) =>
        visibleColumns
          .map((c) => {
            const v = c.exportValue ? c.exportValue(r) : cellText(c.render(r)) || c.sortValue?.(r) || "";
            return csvCell(v);
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {searchKeys && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                aria-label={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-full min-w-56 rounded-md border border-border bg-card pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2 sm:w-64"
              />
            </div>
          )}
          {toolbar}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted tnum">{filtered.length ? `${clampedPage * rowsPerPage + 1}–${Math.min((clampedPage + 1) * rowsPerPage, filtered.length)} of ` : ""}{filtered.length} rows</span>
          {columnControls && columns.length > 3 && <details className="relative"><summary className="cursor-pointer rounded border border-border bg-card px-2.5 py-1.5 text-xs">Columns {visibleColumns.length}/{columns.length}</summary><div className="absolute right-0 z-30 mt-1 max-h-72 w-56 overflow-auto rounded border border-border bg-card p-3 shadow-pop">{columns.map((column, index) => <label key={column.key} className="flex gap-2 py-1.5 text-xs"><input type="checkbox" checked={index === 0 || !hidden.has(column.key)} disabled={index === 0} onChange={() => setHidden(current => { const next = new Set(current); if(next.has(column.key)) next.delete(column.key); else next.add(column.key); return next; })}/>{column.header || "Selection / actions"}</label>)}</div></details>}
          {exportName && (
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border" tabIndex={0} role="region" aria-label="Data table; scroll horizontally for more columns">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-workspace">
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sortKey === c.key ? sortDir === "asc" ? "ascending" : "descending" : c.sortValue ? "none" : undefined}
                  style={{ width: c.width }}
                  className={cn(
                    "px-3 py-2.5 text-xs font-semibold text-muted",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  )}
                >
                  {c.sortValue ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1 hover:text-ink",
                        c.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {c.header}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {onRowClick && <th scope="col" className="px-3 py-2 text-right text-xs text-muted">Details</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={rowKey?.(row) ?? i}
                onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button,input,select,textarea")) onRowClick?.(row); }}
                className={cn(
                  "border-b border-border/70 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-workspace/60",
                )}
              >
                {visibleColumns.map((c, columnIndex) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 text-ink",
                      columnIndex === 0 && "sticky left-0 z-10 bg-card shadow-[1px_0_0_rgb(var(--border))]",
                      c.align === "right" ? "text-right tabular-nums tnum" : c.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {onRowClick && <td className="px-3 py-2 text-right"><button className="min-h-9 rounded-md border border-border px-3 text-xs font-semibold text-purple hover:bg-workspace" aria-label={`Open details for ${cellText(columns[0]?.render(row)) || `row ${clampedPage * rowsPerPage + i + 1}`}`} onClick={() => onRowClick(row)}>Open</button></td>}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + (onRowClick ? 1 : 0)} className="px-3 py-10 text-center text-xs text-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3">
          <span className="text-2xs text-muted tnum">
            Page {clampedPage + 1} of {pageCount}
          </span>
          <div className="flex gap-1.5">
            <select aria-label="Rows per page" value={rowsPerPage} onChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }} className="rounded border border-border bg-card px-2 text-xs">{[...new Set([pageSize,25,50,100])].sort((a,b)=>a-b).map(size=><option key={size} value={size}>{size} rows</option>)}</select>
            <Button size="sm" variant="secondary" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={clampedPage >= pageCount - 1}
              onClick={() => setPage(clampedPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
