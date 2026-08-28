"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, ExternalLink, Loader2, MessageSquare, UserRound } from "lucide-react";
import { useDomain } from "@/components/shell/domain-context";
import { Drawer } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { VerificationPanel } from "@/components/workflow/verification-panel";
import type { VerificationState } from "@/platform/workflow-verification";

const STAGES = ["approved", "in_progress", "shipped", "verifying", "done"] as const;
type Stage = typeof STAGES[number];
type WorkflowItem = {
  id: string; domainSlug: string; title: string; module: string; priorityScore: number; status: Stage | null;
  sourceUrl: string | null; sourceEvidence: Record<string, unknown>; executionType: string | null; ownerEmail: string | null;
  dueDate: string | null; pageMode: string | null; targetUrl: string | null; plannedUrl: string | null;
  executionData: { targetKeywords?: string[]; qualificationNotes?: string | null; duplicateWarning?: { severity?: string; summary?: string; matches?: unknown[] } };
  verification?: VerificationState;
  updatedAt: string;
};
type Comment = { id: string; actorEmail: string | null; body: string; createdAt: string };
type History = { id: string; fromStatus: string | null; toStatus: string; changedBy: string | null; note: string | null; createdAt: string };

const STAGE_LABELS: Record<Stage, string> = { approved: "Approved", in_progress: "In progress", shipped: "Shipped", verifying: "Verifying", done: "Verified" };
const STAGE_TONES: Record<Stage, "neutral" | "info" | "warning" | "success"> = { approved: "neutral", in_progress: "info", shipped: "warning", verifying: "info", done: "success" };

function formatType(value: string | null) { return value ? value.replace(/_/g, " ") : "General task"; }
function displayDate(value: string | null) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "No date"; }

export default function WorkPage() {
  const { sites } = useDomain();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkflowItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [comment, setComment] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [workResponse, sessionResponse] = await Promise.all([fetch("/api/workflow/tasks", { cache: "no-store" }), fetch("/api/auth/session", { cache: "no-store" })]);
      const [work, session] = await Promise.all([workResponse.json(), sessionResponse.json()]);
      if (!workResponse.ok) throw new Error(work.error ?? "Execution work could not be loaded.");
      setItems(work.items ?? []); setUserEmail(session.user?.email?.toLowerCase() ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Execution work could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const requested = searchParams.get("item");
    const item = requested ? items.find((candidate) => candidate.id === requested) : null;
    if (item && selected?.id !== item.id) void openItem(item);
  }, [items, searchParams, selected?.id]);

  const visible = useMemo(() => scope === "mine" ? items.filter((item) => item.ownerEmail?.toLowerCase() === userEmail) : items, [items, scope, userEmail]);
  const siteName = (slug: string) => sites.find((site) => site.id === slug)?.name ?? slug;

  async function openItem(item: WorkflowItem) {
    setSelected(item); setOwnerEmail(item.ownerEmail ?? ""); setDueDate(item.dueDate ?? ""); setComments([]); setHistory([]); setError(null);
    const response = await fetch(`/api/workflow/tasks/${item.id}/activity`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setComments(body.comments ?? []); setHistory(body.history ?? []); }
  }

  async function updateItem(payload: Record<string, unknown>, busyKey: string) {
    if (!selected) return;
    setBusy(busyKey); setError(null);
    try {
      const response = await fetch("/api/workflow/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, ...payload }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.item) throw new Error(body.error ?? "The execution item could not be updated.");
      setItems((current) => current.map((item) => item.id === selected.id ? body.item : item)); setSelected(body.item); setOwnerEmail(body.item.ownerEmail ?? ""); setDueDate(body.item.dueDate ?? "");
      await openItem(body.item);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The execution item could not be updated."); }
    finally { setBusy(null); }
  }

  async function addComment() {
    if (!selected || !comment.trim()) return;
    setBusy("comment"); setError(null);
    try {
      const response = await fetch(`/api/workflow/tasks/${selected.id}/activity`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: comment.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.comment) throw new Error(body.error ?? "The comment could not be added.");
      setComments((current) => [...current, body.comment]); setComment("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The comment could not be added."); }
    finally { setBusy(null); }
  }

  const currentStage = (selected?.status ?? "approved") as Stage;
  const nextStage = STAGES[STAGES.indexOf(currentStage) + 1];
  const outcomeReviewed = Boolean(selected?.verification?.outcome && selected.verification.outcome !== "awaiting_data");
  const duplicateWarning = selected?.executionData?.duplicateWarning;
  const applyVerificationUpdate = (patch: Partial<WorkflowItem> & { id: string }) => { setItems((current) => current.map((item) => item.id === patch.id ? { ...item, ...patch } : item)); setSelected((current) => current?.id === patch.id ? { ...current, ...patch } : current); };

  return <div className="animate-in space-y-6">
    <PageHeader title="Continue work" description="Resume approved SEO execution with the research evidence, destination and ownership still attached." actions={<Button onClick={() => void load()}>Refresh work</Button>} />
    {error && <div role="alert" className="rounded-md border border-critical/25 bg-critical/5 px-4 py-3 text-xs font-semibold text-critical">{error}</div>}

    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-md border border-border bg-card p-0.5">{(["mine", "all"] as const).map((value) => <button key={value} onClick={() => setScope(value)} className={cn("rounded px-3 py-1.5 text-xs font-semibold capitalize", scope === value ? "bg-ink text-card" : "text-muted hover:text-ink")}>{value === "mine" ? "My work" : "All accessible work"}</button>)}</div><div className="text-xs text-muted">{visible.filter((item) => item.status !== "done").length} active · {visible.filter((item) => item.status === "done").length} verified</div></div>

    {loading ? <div className="grid gap-4 lg:grid-cols-5">{STAGES.map((stage) => <Skeleton key={stage} className="h-64" />)}</div> : visible.length === 0 ? <Card className="p-6"><EmptyState title={scope === "mine" ? "No work assigned to you" : "No approved work yet"} description="Approve a mapped opportunity in Action Centre, or change the ownership filter." icon={<CheckCircle2 className="h-7 w-7 text-success" />} /></Card> : <div className="grid gap-4 xl:grid-cols-5">{STAGES.map((stage) => { const rows = visible.filter((item) => (item.status ?? "approved") === stage); return <section key={stage} className="min-w-0 rounded-lg border border-border bg-workspace/45"><div className="flex items-center justify-between border-b border-border px-3 py-3"><div className="text-xs font-bold text-ink">{STAGE_LABELS[stage]}</div><span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-card px-1 text-[10px] font-bold text-muted">{rows.length}</span></div><div className="space-y-2 p-2">{rows.map((item) => <button key={item.id} onClick={() => void openItem(item)} className="w-full rounded-md border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-purple/35 hover:shadow-card"><div className="flex items-center justify-between gap-2"><StatusBadge label={formatType(item.executionType)} tone="info" /><span className="text-[10px] font-bold text-purple tnum">{item.priorityScore}</span></div><div className="mt-2 text-xs font-bold leading-5 text-ink">{item.title}</div><div className="mt-3 space-y-1 text-[10px] text-muted"><div className="flex items-center gap-1.5"><UserRound className="h-3 w-3" />{item.ownerEmail ?? "Unassigned"}</div><div className="flex items-center gap-1.5"><CalendarDays className="h-3 w-3" />{displayDate(item.dueDate)}</div><div className="truncate">{siteName(item.domainSlug)}</div></div></button>)}{rows.length === 0 && <div className="px-2 py-8 text-center text-[10px] text-muted">No items</div>}</div></section>; })}</div>}

    {selected && <Drawer open onClose={() => setSelected(null)} title={selected.title} subtitle={`${siteName(selected.domainSlug)} · ${formatType(selected.executionType)}`} width="max-w-2xl" footer={<div className="flex items-center justify-between gap-3"><StatusBadge label={STAGE_LABELS[currentStage]} tone={STAGE_TONES[currentStage]} />{currentStage === "verifying" && !outcomeReviewed ? <span className="text-xs font-semibold text-muted">Review a checkpoint and classify the outcome above</span> : nextStage ? <Button variant="primary" onClick={() => void updateItem({ status: nextStage }, "stage")} disabled={busy === "stage"}>{busy === "stage" && <Loader2 className="h-4 w-4 animate-spin" />}Move to {STAGE_LABELS[nextStage]}</Button> : <span className="inline-flex items-center gap-1 text-xs font-bold text-success"><CheckCircle2 className="h-4 w-4" />Verification complete</span>}</div>}>
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-1">{STAGES.map((stage, index) => <div key={stage}><div className={cn("h-1.5 rounded-full", index <= STAGES.indexOf(currentStage) ? "bg-purple" : "bg-workspace")} /><div className="mt-1 truncate text-[9px] font-semibold text-muted">{STAGE_LABELS[stage]}</div></div>)}</div>

        <section className="rounded-lg border border-border bg-workspace/45 p-4"><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">Evidence and destination</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><div className="text-[10px] font-semibold text-muted">Research source</div><div className="mt-1 text-sm font-bold text-ink">{String(selected.sourceEvidence.sourceValue ?? "Attached evidence")}</div><div className="mt-0.5 text-xs text-muted">{String(selected.sourceEvidence.market ?? "")}</div></div><div><div className="text-[10px] font-semibold text-muted">Destination</div><div className="mt-1 break-all text-sm font-bold text-ink">{selected.targetUrl ?? selected.plannedUrl ?? "Site-wide"}</div><div className="mt-0.5 text-xs capitalize text-muted">{formatType(selected.pageMode)}</div></div></div>{selected.sourceUrl && <Link href={selected.sourceUrl} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-purple">Open original evidence <ExternalLink className="h-3.5 w-3.5" /></Link>}</section>

        {duplicateWarning?.severity === "warning" && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><div className="text-xs font-bold text-ink">Overlap requires attention</div><p className="mt-1 text-xs leading-5 text-muted">{duplicateWarning.summary}</p></div></div></div>}

        <section><div className="mb-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted">Assignment</div><div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]"><input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} aria-label="Owner email" className="h-10 rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date" className="h-10 rounded-md border border-border bg-card px-3 text-sm text-ink outline-none focus:border-purple" /><Button onClick={() => void updateItem({ ownerEmail, dueDate: dueDate || null }, "assign")} disabled={!ownerEmail.trim() || busy === "assign"}>{busy === "assign" && <Loader2 className="h-4 w-4 animate-spin" />}Save</Button></div></section>

        <VerificationPanel item={selected} onUpdate={applyVerificationUpdate} />

        <section><div className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.12em] text-muted"><MessageSquare className="h-3.5 w-3.5" />Discussion</div><div className="space-y-2">{comments.map((entry) => <div key={entry.id} className="rounded-md bg-workspace p-3"><div className="flex justify-between gap-2 text-[10px] text-muted"><span className="font-bold text-ink">{entry.actorEmail ?? "Team member"}</span><time>{new Date(entry.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink">{entry.body}</p></div>)}{comments.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}<div className="flex gap-2"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add context, a decision or a hand-off note" rows={2} className="min-w-0 flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-purple" /><Button onClick={() => void addComment()} disabled={!comment.trim() || busy === "comment"}>{busy === "comment" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button></div></div></section>

        <section><div className="mb-3 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.12em] text-muted"><Clock3 className="h-3.5 w-3.5" />Status history</div><div className="space-y-2">{history.map((entry) => <div key={entry.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-purple" /><div><div className="text-xs font-semibold text-ink">{entry.fromStatus ? `${STAGE_LABELS[entry.fromStatus as Stage] ?? entry.fromStatus} → ` : ""}{STAGE_LABELS[entry.toStatus as Stage] ?? entry.toStatus}</div><div className="mt-0.5 text-[10px] text-muted">{entry.changedBy ?? "System"} · {new Date(entry.createdAt).toLocaleString()}</div>{entry.note && <p className="mt-1 text-xs text-muted">{entry.note}</p>}</div></div>)}{history.length === 0 && <p className="text-xs text-muted">No recorded changes yet.</p>}</div></section>
      </div>
    </Drawer>}
  </div>;
}
