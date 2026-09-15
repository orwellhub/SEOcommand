"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight, ScanLine } from "lucide-react";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { useJson } from "@/lib/use-live";

type ScanJob = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  lastError: string | null;
  progress: { label?: string };
};

/** A compact view of saved scan activity; opening an overview never starts a scan. */
export function SiteScanCentre({ siteId }: { siteId: string }) {
  const { data, loading, error, refresh } = useJson<{ jobs: ScanJob[] }>(`/api/scan-centre?site=${encodeURIComponent(siteId)}`, 0);
  const jobs = data?.jobs ?? [];
  const running = jobs.filter((job) => job.status === "running").length;
  const queued = jobs.filter((job) => job.status === "queued").length;
  const active = running + queued;
  const latest = jobs.find((job) => job.status === "running") ?? jobs.find((job) => job.status === "queued") ?? jobs[0];

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const label = latest?.kind === "browser_crawl" ? "Technical browser crawl" : latest?.progress.label ?? "Website scan";
  const status = latest?.status === "queued" && latest.lastError ? "Waiting to retry" : latest?.status;
  const activity = active
    ? [running ? `${running} running` : null, queued ? `${queued} queued` : null].filter(Boolean).join(" · ")
    : "Latest scan";

  return <Card id="website-scan-centre" role="region" aria-label="Website Scan Centre" className="border-purple/25 border-l-4 border-l-purple bg-card px-4 py-2.5">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple/10 text-purple"><ScanLine className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0"><h2 className="text-sm font-bold text-ink">Scan Centre</h2></div>
      </div>
      <div className="col-span-2 row-start-2 min-w-0 text-xs" aria-live="polite">
        {error ? <p className="text-muted">Scan status unavailable. <button type="button" onClick={refresh} className="font-semibold text-purple underline underline-offset-2">Retry</button></p>
          : loading && !data ? <p className="text-muted">Checking scan activity…</p>
          : latest ? <><div className="flex flex-wrap items-center gap-2"><span className="text-muted">{activity}</span><span className="truncate text-ink">{label}</span><StatusBadge label={status!} tone={latest.status === "completed" ? "success" : latest.status === "failed" ? "critical" : active ? "info" : "neutral"} /></div></>
          : <p className="text-muted">No scans yet. Choose tools and preview the cost.</p>}
      </div>
      <Link href={`/scan-centre?site=${encodeURIComponent(siteId)}`} className="col-start-2 row-start-1 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-purple hover:bg-workspace">
        Scan Centre <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  </Card>;
}
