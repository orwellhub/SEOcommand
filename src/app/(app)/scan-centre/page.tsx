"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, Bot, Check, ChevronRight, CircleDollarSign, Clock3, Database, Globe2, Link2, Loader2, MapPin, Play, Radar, RefreshCcw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { useDomain } from "@/components/shell/domain-context";
import { cn } from "@/lib/cn";
import type { ScanModule } from "@/platform/types";

type ModuleMeta = { id: ScanModule; label: string; description: string; paid: boolean; estimatedUsd: number; color: string };
type ScanJob = { id: string; siteSlug: string; kind: string; status: string; progress: Record<string, unknown>; attempts: number; requestedBy: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; lastError: string | null };
type Payload = { site: { id: string; name: string; spendApproval: string; forecastMonthlyUsd: number; approvedMonthlyUsd: number | null }; modules: ModuleMeta[]; jobs: ScanJob[] };

const ICONS: Record<ScanModule, React.ComponentType<{ className?: string }>> = {
  google: Globe2, rankings: Radar, keywords: Search, competitors: Activity, technical: ShieldCheck,
  backlinks: Link2, ai: Bot, local: MapPin, reliability: Activity,
};
const RESULT_LINKS: Record<ScanModule, string> = {
  google: "/domain", rankings: "/rankings", keywords: "/keyword-research", competitors: "/competitors",
  technical: "/site-audit", backlinks: "/backlinks", ai: "/ai-visibility", local: "/local-seo", reliability: "/monitoring",
};
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value); }
function ago(value: string) { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1_440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1_440)}d ago`; }

export default function ScanCentrePage() {
  const { activeDomain, sites, setScope } = useDomain();
  const searchParams = useSearchParams();
  const requestedModule = searchParams.get("module") as ScanModule | null;
  const [siteSlug, setSiteSlug] = useState(activeDomain?.id ?? "");
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<ScanModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeDomain?.id) setSiteSlug(activeDomain.id);
  }, [activeDomain?.id]);
  const load = useCallback(async () => {
    if (!siteSlug) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/scan-centre?site=${encodeURIComponent(siteSlug)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load the scan centre.");
      setData(body as Payload);
      setSelected((current) => current.length ? current : requestedModule && (body.modules as ModuleMeta[]).some((module) => module.id === requestedModule) ? [requestedModule] : (body.modules as ModuleMeta[]).map((module) => module.id));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the scan centre."); }
    finally { setLoading(false); }
  }, [requestedModule, siteSlug]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!data?.jobs.some((job) => ["queued", "running"].includes(job.status))) return;
    const timer = window.setInterval(() => void load(), 8_000);
    return () => window.clearInterval(timer);
  }, [data?.jobs, load]);

  const estimate = useMemo(() => data?.modules.filter((module) => selected.includes(module.id)).reduce((sum, module) => sum + module.estimatedUsd, 0) ?? 0, [data?.modules, selected]);
  const paidSelected = data?.modules.some((module) => selected.includes(module.id) && module.paid) ?? false;
  const blocked = paidSelected && data?.site.spendApproval !== "approved";
  async function run(modules = selected) {
    if (!siteSlug || !modules.length || running) return;
    setRunning(true); setError(null);
    try {
      const response = await fetch("/api/scan-centre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteSlug, modules, label: modules.length === data?.modules.length ? "Full website scan" : "Selected tool scan" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not queue the scan.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not queue the scan."); }
    finally { setRunning(false); }
  }
  async function manage(jobId: string, action: "cancel" | "retry") {
    const response = await fetch("/api/scan-centre", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, action }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setError(body.error ?? `Could not ${action} the scan.`); else await load();
  }

  return <div>
    <PageHeader title="Scan Centre" description="Refresh one tool or run a complete website scan—with cost preview, live progress and direct links to the evidence." actions={
      <select value={siteSlug} onChange={(event) => { setSiteSlug(event.target.value); setScope(event.target.value); }} className="h-9 min-w-52 rounded-md border border-border bg-card px-3 text-sm font-semibold text-ink outline-none focus:border-purple">
        <option value="" disabled>Choose a website</option>
        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
    } />
    <section className="mb-5 overflow-hidden rounded-xl border border-border bg-ink text-white shadow-card">
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1fr_auto] lg:items-end"><div>
        <div className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.16em] text-white/55"><Sparkles className="h-3.5 w-3.5 text-[#7DE3D1]" /> Website evidence refresh</div>
        <h2 className="max-w-2xl text-2xl font-extrabold tracking-tight">Choose the evidence you need. Keep the spend visible.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Free checks and approved provider calls run through the same auditable queue. Technical scans include rendered browser evidence.</p>
      </div><div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-3">
        <div><div className="text-[10px] uppercase tracking-wide text-white/45">Estimated call cost</div><div className="mt-0.5 text-xl font-black tnum">{money(estimate)}</div></div><div className="h-9 w-px bg-white/10" />
        <Button variant="primary" disabled={running || selected.length === 0 || blocked} onClick={() => void run()} className="bg-[#6B5BFF] hover:bg-[#7B6DFF]">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{selected.length === data?.modules.length ? "Run full scan" : `Run ${selected.length} tools`}</Button>
      </div></div><div className="h-1 bg-gradient-to-r from-[#335CFF] via-[#12B8C4] to-[#FF6B5E]" />
    </section>
    {error && <div className="mb-5 flex items-start gap-2 rounded-lg border border-critical/25 bg-critical/5 px-4 py-3 text-sm text-critical"><X className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
    {blocked && <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3"><div className="flex items-center gap-2 text-sm text-ink"><CircleDollarSign className="h-4 w-4 text-warning" /><span>Paid modules are locked until this website’s spending ceiling is approved.</span></div><Link href={`/sites/${siteSlug}/settings?tab=budgets`} className="text-xs font-bold text-purple hover:underline">Review budget</Link></div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"><div>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-ink">Scan modules</h2><button onClick={() => setSelected(selected.length === data?.modules.length ? [] : data?.modules.map((module) => module.id) ?? [])} className="text-xs font-semibold text-purple">{selected.length === data?.modules.length ? "Clear selection" : "Select all"}</button></div>
      {loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 9 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-lg border border-border bg-card" />)}</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data?.modules.map((module) => {
        const Icon = ICONS[module.id]; const active = selected.includes(module.id);
        return <button key={module.id} onClick={() => setSelected((current) => current.includes(module.id) ? current.filter((id) => id !== module.id) : [...current, module.id])} className={cn("group relative overflow-hidden rounded-lg border bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop", active ? "ring-2 ring-offset-0" : "border-border")} style={{ borderColor: active ? module.color : undefined, "--tw-ring-color": `${module.color}20` } as React.CSSProperties}>
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: module.color }} /><div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: module.color, background: `${module.color}16` }}><Icon className="h-4 w-4" /></span><span className="flex h-5 w-5 items-center justify-center rounded border text-white" style={{ borderColor: active ? module.color : undefined, background: active ? module.color : "transparent" }}>{active && <Check className="h-3.5 w-3.5" />}</span></div>
          <div className="mt-3 text-sm font-bold text-ink">{module.label}</div><p className="mt-1 min-h-9 text-xs leading-4 text-muted">{module.description}</p><div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span className={module.paid ? "text-[#B9791A]" : "text-success"}>{module.paid ? "Provider call" : "Free check"}</span><span className="text-muted">{module.paid ? money(module.estimatedUsd) : "$0"}</span></div>
        </button>;
      })}</div>}
    </div><Card className="h-fit overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-bold text-ink">Recent runs</h2><p className="mt-0.5 text-2xs text-muted">Live queue and completed evidence</p></div><button onClick={() => void load()} className="rounded-md p-2 text-muted hover:bg-workspace"><RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} /></button></div><div className="max-h-[720px] divide-y divide-border overflow-y-auto">
      {!loading && !data?.jobs.length && <div className="p-4"><EmptyState icon={<Database className="h-6 w-6" />} title="No scans yet" description="Select the evidence you need and run the first refresh." /></div>}
      {data?.jobs.map((job) => { const modules = (Array.isArray(job.progress.modules) ? job.progress.modules : []) as ScanModule[]; const active = ["queued", "running"].includes(job.status); return <div key={job.id} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-bold text-ink">{String(job.progress.label ?? (job.kind === "initial_site_scan" ? "Initial website scan" : "Website scan"))}</div><div className="mt-1 flex items-center gap-1.5 text-2xs text-muted"><Clock3 className="h-3 w-3" /> {ago(job.createdAt)} · {modules.length} modules</div></div><StatusBadge label={job.status} tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : active ? "info" : "neutral"} /></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{modules.map((module) => { const meta = data.modules.find((item) => item.id === module); const Icon = ICONS[module]; return <Link title={`Open ${meta?.label ?? module}`} key={module} href={`${RESULT_LINKS[module]}?site=${siteSlug}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-workspace" style={{ color: meta?.color }}><Icon className="h-3.5 w-3.5" /></Link>; })}</div>
        {active && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-workspace"><div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-[#335CFF] to-[#12B8C4]" /></div>}{job.lastError && <p className="mt-2 text-xs leading-5 text-critical">{job.lastError}</p>}
        <div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-muted">{job.requestedBy ? `By ${job.requestedBy}` : "Scheduled"}</span>{active ? <button onClick={() => void manage(job.id, "cancel")} className="text-xs font-semibold text-critical">Cancel</button> : ["failed", "cancelled"].includes(job.status) ? <button onClick={() => void manage(job.id, "retry")} className="text-xs font-semibold text-purple">Retry</button> : <Link href={`/sites/${siteSlug}`} className="flex items-center gap-1 text-xs font-semibold text-purple">Website overview <ChevronRight className="h-3 w-3" /></Link>}</div>
      </div>; })}
    </div></Card></div>
  </div>;
}
