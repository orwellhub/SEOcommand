"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button, StatusBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export type SiteFinding = {
  key: string;
  title: string;
  module: string;
  executionType: "tracked_keyword_group" | "keyword_page_map" | "content_brief" | "refresh_brief" | "internal_link_task" | "link_prospect_list" | "technical_task";
  priorityScore: number;
  pageMode: "new_page" | "existing_page" | "site_wide";
  targetUrl?: string | null;
  plannedUrl?: string | null;
  targetKeywords?: string[];
  evidenceLabel: string;
  sourceUrl: string;
  sourceEvidence: Record<string, unknown>;
};

function defaultDueDate() { const date = new Date(); date.setDate(date.getDate() + 14); return date.toISOString().slice(0, 10); }
function formatType(value: string) { return value.replace(/_/g, " "); }

export function SiteFindingWorkDrawer({ finding, siteSlug, siteName, onClose }: { finding: SiteFinding | null; siteSlug: string; siteName: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [pageMode, setPageMode] = useState<SiteFinding["pageMode"]>("existing_page");
  const [targetUrl, setTargetUrl] = useState("");
  const [plannedUrl, setPlannedUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [priorityScore, setPriorityScore] = useState(70);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    if (!finding) return;
    setTitle(finding.title); setPageMode(finding.pageMode); setTargetUrl(finding.targetUrl ?? ""); setPlannedUrl(finding.plannedUrl ?? ""); setKeywords((finding.targetKeywords ?? []).join("\n")); setPriorityScore(finding.priorityScore); setError(null); setCreatedId(null); setExisting(false);
  }, [finding]);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.user?.email) setOwnerEmail(body.user.email); }).catch(() => undefined);
  }, []);

  async function createWork() {
    if (!finding || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/workflow/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteSlug,
          findingKey: finding.key,
          title: title.trim(),
          module: finding.module,
          executionType: finding.executionType,
          priorityScore,
          pageMode,
          targetUrl: targetUrl.trim() || null,
          plannedUrl: plannedUrl.trim() || null,
          targetKeywords: keywords.split(/[\n,]/).map((value) => value.trim()).filter(Boolean).slice(0, 50),
          ownerEmail: ownerEmail.trim(),
          dueDate,
          sourceUrl: finding.sourceUrl,
          sourceEvidence: finding.sourceEvidence,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.item) throw new Error(body.error ?? "The work item could not be created.");
      setCreatedId(body.item.id); setExisting(Boolean(body.existing));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The work item could not be created."); }
    finally { setBusy(false); }
  }

  const incomplete = !title.trim() || !ownerEmail.trim() || !dueDate || (pageMode === "existing_page" && !targetUrl.trim()) || (pageMode === "new_page" && !plannedUrl.trim());

  return <Drawer open={Boolean(finding)} onClose={onClose} title="Create work from finding" subtitle={finding ? `${siteName} · ${finding.module}` : undefined} width="max-w-xl" footer={createdId ? <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-success">{existing ? "This finding is already in the workflow." : "Approved work created."}</span><Link href={`/work?item=${encodeURIComponent(createdId)}`} className="inline-flex h-9 items-center gap-1 rounded-md bg-purple px-3 text-xs font-bold text-white">Continue work <ArrowRight className="h-3.5 w-3.5" /></Link></div> : <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-muted">This explicit action creates approved work for the selected site.</span><div className="flex gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void createWork()} disabled={incomplete || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Create approved work</Button></div></div>}>
    {finding && <div className="space-y-5">
      <div className="relative overflow-hidden rounded-lg border border-border bg-workspace/45 p-4 pl-6"><span className="absolute inset-y-0 left-0 w-1.5 bg-[#12B8C4]" /><div className="flex flex-wrap items-center gap-2"><StatusBadge label={formatType(finding.executionType)} tone="info" /><span className="text-[10px] font-bold text-purple tnum">Priority {priorityScore}</span></div><div className="mt-2 text-sm font-bold leading-5 text-ink">{finding.title}</div><div className="mt-1 flex items-center gap-1.5 text-xs text-muted"><FileSearch className="h-3.5 w-3.5" />{finding.evidenceLabel}</div></div>

      <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 gap-y-5"><div className="relative flex justify-center"><span className="z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#12B8C4] text-[9px] font-black text-white">1</span><span className="absolute bottom-[-22px] top-5 w-px bg-border" /></div><section><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Define the work</div><label className="mt-2 block"><span className="mb-1 block text-xs font-semibold text-ink">Task title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></section>

        <div className="relative flex justify-center"><span className="z-10 flex h-5 w-5 items-center justify-center rounded-full bg-purple text-[9px] font-black text-white">2</span><span className="absolute bottom-[-22px] top-5 w-px bg-border" /></div><section><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Choose the destination</div><div className="mt-2 grid grid-cols-3 gap-2">{([['new_page','New page'],['existing_page','Existing page'],['site_wide','Site-wide']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setPageMode(value)} className={cn("rounded-md border px-2 py-2 text-xs font-semibold", pageMode === value ? "border-purple bg-purple/10 text-purple" : "border-border text-muted hover:text-ink")}>{label}</button>)}</div>{pageMode === "existing_page" && <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://site.com/affected-page" aria-label="Target URL" className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" />}{pageMode === "new_page" && <input value={plannedUrl} onChange={(event) => setPlannedUrl(event.target.value)} placeholder="/planned-page" aria-label="Planned URL" className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" />}<textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="Target keywords, one per line" aria-label="Target keywords" rows={3} className="mt-2 w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-purple" /></section>

        <div className="flex justify-center"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[9px] font-black text-card">3</span></div><section><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Own the outcome</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink">Owner email</span><input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label><label><span className="mb-1 block text-xs font-semibold text-ink">Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /></label></div><label className="mt-3 block"><span className="mb-1 flex items-center justify-between text-xs font-semibold text-ink"><span>Priority</span><span className="text-purple tnum">{priorityScore}/100</span></span><input type="range" min="0" max="100" step="5" value={priorityScore} onChange={(event) => setPriorityScore(Number(event.target.value))} className="w-full accent-purple" /></label></section></div>
      {error && <div role="alert" className="rounded-md border border-critical/25 bg-critical/5 px-3 py-2 text-xs font-semibold text-critical">{error}</div>}
    </div>}
  </Drawer>;
}
