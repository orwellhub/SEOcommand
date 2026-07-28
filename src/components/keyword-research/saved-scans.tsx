"use client";

import { History, Trash2, Loader2, MapPin } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface SavedScan {
  id: string;
  seed: string;
  locationCode: number;
  languageCode: string;
  locationLabel: string;
  rowCount: number;
  totalVolume: number;
  avgDifficulty: number | null;
  createdBy: string | null;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Previous keyword searches. Selecting one replays the stored result from the
 * database — it never re-queries DataForSEO, so revisiting past work is free.
 */
export function SavedScans({
  scans,
  loading,
  activeId,
  busyId,
  onOpen,
  onDelete,
}: {
  scans: SavedScan[];
  loading: boolean;
  activeId: string | null;
  busyId: string | null;
  onOpen: (scan: SavedScan) => void;
  onDelete: (scan: SavedScan) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="h-4 w-4 text-muted" />
          Saved searches
        </h3>
        {scans.length > 0 && (
          <span className="text-2xs text-muted tnum">{scans.length}</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <EmptyState
          title="No saved searches yet"
          description="Every scan you run is saved here automatically. Reopening one is free — it replays stored results instead of calling DataForSEO again."
          icon={<History className="h-5 w-5" />}
        />
      ) : (
        <ul className="space-y-1.5">
          {scans.map((scan) => {
            const active = scan.id === activeId;
            const busy = scan.id === busyId;
            return (
              <li key={scan.id}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-md border px-3 py-2 transition-colors",
                    active
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                      : "border-border bg-card hover:bg-workspace",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(scan)}
                    disabled={busy}
                    className="min-w-0 flex-1 text-left"
                    title="Reopen this search (no DataForSEO call)"
                  >
                    <div className="flex items-center gap-2">
                      {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />}
                      <span className="truncate text-sm font-medium text-ink">{scan.seed}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {scan.locationLabel}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="tnum">{scan.rowCount} keywords</span>
                      <span aria-hidden>·</span>
                      <span className="tnum">{compactNumber(scan.totalVolume)} vol</span>
                      {scan.avgDifficulty != null && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tnum">KD {scan.avgDifficulty}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span>{relativeTime(scan.createdAt)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(scan)}
                    disabled={busy}
                    aria-label={`Delete saved search "${scan.seed}"`}
                    title="Delete saved search"
                    className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:bg-critical/10 hover:text-critical focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
