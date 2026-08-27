"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronRight, Loader2, ScanLine, X } from "lucide-react";
import { useDomain } from "./domain-context";
import { StatusBadge } from "@/components/ui/primitives";

type Job = { id: string; status: string; createdAt: string; progress: Record<string, unknown> };

export function JobDrawer() {
  const { activeDomain } = useDomain();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const load = useCallback(async () => {
    if (!activeDomain) { setJobs([]); return; }
    const response = await fetch(`/api/scan-centre?site=${encodeURIComponent(activeDomain.id)}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const body = await response.json() as { jobs?: Job[] };
    setJobs(body.jobs ?? []);
  }, [activeDomain]);
  useEffect(() => { void load(); }, [load]);
  const active = jobs.filter((job) => ["queued", "running"].includes(job.status));
  useEffect(() => {
    if (!active.length) return;
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [active.length, load]);
  return <>
    <button type="button" disabled={!activeDomain} onClick={() => setOpen(true)} className="relative rounded-md p-2.5 text-muted hover:bg-workspace hover:text-ink disabled:opacity-35" aria-label="Open scan jobs">
      <ScanLine className="h-4 w-4" />{active.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple px-1 text-[9px] font-bold text-white">{active.length}</span>}
    </button>
    {open && <><button className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px]" onClick={() => setOpen(false)} aria-label="Close scan drawer" /><aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-pop">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-extrabold text-ink">Scan activity</h2><p className="mt-0.5 text-xs text-muted">{activeDomain?.name ?? "Website"}</p></div><button className="rounded-md p-2 text-muted hover:bg-workspace" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
      <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">{!jobs.length && <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted" /><p className="mt-3 text-sm font-semibold text-ink">No scan activity yet</p><p className="mt-1 text-xs text-muted">Run a tool scan or a complete website scan to see progress here.</p></div>}{jobs.slice(0, 12).map((job) => <div key={job.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div className="text-sm font-bold text-ink">{String(job.progress.label ?? "Website scan")}</div><StatusBadge label={job.status} tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : ["queued", "running"].includes(job.status) ? "info" : "neutral"} /></div><div className="mt-2 flex items-center gap-2 text-xs text-muted">{["queued", "running"].includes(job.status) && <Loader2 className="h-3.5 w-3.5 animate-spin text-purple" />}{Array.isArray(job.progress.modules) ? `${job.progress.modules.length} modules` : "Scheduled scan"} · {new Date(job.createdAt).toLocaleString()}</div></div>)}</div>
      {activeDomain && <Link href={`/scan-centre?site=${activeDomain.id}`} onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border px-5 py-4 text-sm font-bold text-purple hover:bg-workspace">Open Scan Centre <ChevronRight className="h-4 w-4" /></Link>}
    </aside></>}
  </>;
}
