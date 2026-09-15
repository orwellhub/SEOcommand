"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { History, Trash2, Loader2, MapPin } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface SavedScan {
  id: string;
  projectId?: string | null;
  label?: string | null;
  sourceType?: string;
  seed: string;
  locationCode: number;
  languageCode: string;
  locationLabel: string;
  rowCount: number;
  totalVolume: number;
  reportedVolumeCount?:number;
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
  onDelete, onRename, onMerge, lists = false,
}: {
  scans: SavedScan[];
  loading: boolean;
  activeId: string | null;
  busyId: string | null;
  onOpen: (scan: SavedScan) => void;
  onDelete: (scan: SavedScan) => void;
  onRename?: (scan: SavedScan, name: string) => Promise<void>;
  onMerge?: (scans: SavedScan[], name: string) => Promise<void>;
  lists?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]), [editing, setEditing] = useState<SavedScan | null>(null), [name, setName] = useState(""), [merging, setMerging] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function save() { setBusy(true); setError(""); try { if (editing) await onRename?.(editing, name); else await onMerge?.(scans.filter(row => selected.includes(row.id)), name); setEditing(null); setMerging(false); setSelected([]); } catch (e) { setError(e instanceof Error ? e.message : "Could not save list."); } finally { setBusy(false); } }
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="h-4 w-4 text-muted" />
          {lists ? "Keyword lists" : "Saved searches"}
        </h3>
        {scans.length > 0 && (
          <span className="text-2xs text-muted tnum">{scans.length}</span>
        )}
      </div>

      {lists && onMerge && <div className="mb-3 flex flex-wrap gap-2"><Button size="sm" disabled={!selected.length} onClick={()=>{setMerging(true);setName(selected.length===1?"Deduplicated list":"Merged keyword list");}}>Merge / remove duplicates ({selected.length})</Button><p className="self-center text-xs text-muted">Saves a new list; the originals are retained. Reopen a list to refresh metrics, track keywords or plan content.</p></div>}
      {(editing || merging) && <form onSubmit={e=>{e.preventDefault();void save();}} className="mb-3 flex flex-wrap gap-2"><input aria-label={editing?"Rename keyword list":"Merged list name"} className="h-9 rounded border border-border bg-card px-3 text-sm" value={name} onChange={e=>setName(e.target.value)} maxLength={160}/><Button type="submit" disabled={busy||!name.trim()}>Save</Button><Button disabled={busy} onClick={()=>{setEditing(null);setMerging(false);}}>Cancel</Button></form>}
      {error && <p role="alert" className="mb-3 text-xs text-critical">{error}</p>}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <EmptyState
          title={lists ? "No keyword lists yet" : "No saved searches yet"}
          description={lists?"Select keywords in a research report and save a list. Reopening a list uses its saved evidence.":"Every completed search is saved automatically. Reopening it replays stored results without calling DataForSEO."}
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
                  {lists && <input type="checkbox" aria-label={`Select ${scan.label || scan.seed}`} checked={selected.includes(scan.id)} onChange={e=>setSelected(e.target.checked?[...selected,scan.id]:selected.filter(id=>id!==scan.id))}/>}
                  <button
                    type="button"
                    onClick={() => onOpen(scan)}
                    disabled={busy}
                    className="min-w-0 flex-1 text-left"
                    title="Reopen this search (no DataForSEO call)"
                  >
                    <div className="flex items-center gap-2">
                      {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted" />}
                      <span className="truncate text-sm font-medium text-ink">{scan.label || scan.seed}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {scan.locationLabel}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="tnum">{scan.rowCount} keywords</span>
                      <span aria-hidden>·</span>
                      <span className="tnum">{scan.reportedVolumeCount===0?"Volume not measured":`${compactNumber(scan.totalVolume)} reported vol`}{scan.reportedVolumeCount!=null&&scan.reportedVolumeCount>0&&scan.reportedVolumeCount<scan.rowCount?` (${scan.reportedVolumeCount}/${scan.rowCount})`:""}</span>
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
                  {onRename && <Button size="sm" aria-label={`Rename ${scan.label || scan.seed}`} onClick={()=>{setEditing(scan);setName(scan.label || scan.seed);setMerging(false);}}>Rename</Button>}
                  <button
                    type="button"
                    onClick={() => onDelete(scan)}
                    disabled={busy}
                    aria-label={`Delete ${lists?"keyword list":"saved search"} "${scan.label||scan.seed}"`}
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
