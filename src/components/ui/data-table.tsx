"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortValue?: (row: T) => number | string;
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
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

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
    const header = columns.map((c) => `"${c.header}"`).join(",");
    const body = filtered
      .map((r) =>
        columns
          .map((c) => {
            const v = c.sortValue ? c.sortValue(r) : "";
            return `"${String(v).replace(/"/g, '""')}"`;
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
        <div className="flex items-center gap-2">
          {searchKeys && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
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
          <span className="text-2xs text-muted tnum">{filtered.length ? `${clampedPage * pageSize + 1}–${Math.min((clampedPage + 1) * pageSize, filtered.length)} of ` : ""}{filtered.length} rows</span>
          {exportName && (
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-workspace/70">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={cn(
                    "px-3 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  )}
                >
                  {c.sortValue ? (
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-ink",
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
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={rowKey?.(row) ?? i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-border/70 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-workspace/60",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 text-ink",
                      c.align === "right" ? "text-right tabular-nums tnum" : c.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-xs text-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between px-1 pt-3">
          <span className="text-2xs text-muted tnum">
            Page {clampedPage + 1} of {pageCount}
          </span>
          <div className="flex gap-1.5">
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
