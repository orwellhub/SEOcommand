"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button, Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { ScopeNote } from "@/components/ui/scope-note";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useScopedLive } from "@/lib/use-live";
import type { DerivedRecommendation } from "@/lib/live";
import type { RecConfidence, RecEffort } from "@/lib/types";
import { cn } from "@/lib/cn";

const EFFORT_LABEL: Record<RecEffort, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

const CONFIDENCE_COLOR: Record<RecConfidence, string> = {
  high: "text-success",
  medium: "text-[#B9791A]",
  low: "text-muted",
};

type WorkflowStatus = "approved" | "in_progress" | "done";

interface WorkflowItem {
  id: string;
  recommendationKey: string;
  decision: "approved" | "dismissed";
  title: string;
  module: string;
  effort: RecEffort;
  priorityScore: number;
  status: WorkflowStatus | null;
}

type WorkflowTask = WorkflowItem & { status: WorkflowStatus };

const BOARD_COLUMNS: { status: WorkflowStatus; label: string }[] = [
  { status: "approved", label: "Approved" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

const NEXT_STATUS: Partial<Record<WorkflowStatus, WorkflowStatus>> = {
  approved: "in_progress",
  in_progress: "done",
};

export default function RecommendationsPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error, isPortfolio, scopeLabel, scopeHost, scopeId } = useScopedLive();

  const [selected, setSelected] = useState<DerivedRecommendation | null>(null);
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const ds = bundle?.datasets.recommendations;

  const recs = useMemo(
    () => [...(ds?.data ?? [])].sort((a, b) => b.priorityScore - a.priorityScore),
    [ds],
  );

  useEffect(() => {
    let active = true;
    setWorkflowError(null);
    fetch(`/api/workflow/tasks?domain=${encodeURIComponent(domain.id)}`)
      .then(async (response) => {
        const body = (await response.json()) as { items?: WorkflowItem[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load workflow tasks.");
        if (active) setWorkflowItems(body.items ?? []);
      })
      .catch((err) => {
        if (active) setWorkflowError(err instanceof Error ? err.message : "Could not load workflow tasks.");
      });
    return () => {
      active = false;
    };
  }, [domain.id]);

  const tasks = useMemo(
    () =>
      workflowItems.filter(
        (item): item is WorkflowTask => item.decision === "approved" && item.status !== null,
      ),
    [workflowItems],
  );
  const dismissed = useMemo(
    () => workflowItems.filter((item) => item.decision === "dismissed").map((item) => item.recommendationKey),
    [workflowItems],
  );

  const queue = useMemo(() => {
    const decided = new Set([...tasks.map((t) => t.recommendationKey), ...dismissed]);
    return recs.filter((r) => !decided.has(r.id));
  }, [recs, tasks, dismissed]);

  // KPIs reflect the OPEN queue so they update as recs are approved/dismissed.
  const kpis = useMemo(() => {
    const avg = queue.length
      ? Math.round(queue.reduce((sum, r) => sum + r.priorityScore, 0) / queue.length)
      : null;
    return {
      open: queue.length,
      highPriority: queue.filter((r) => r.priorityScore >= 70).length,
      modules: new Set(queue.map((r) => r.module)).size,
      avgPriority: avg,
    };
  }, [queue]);

  const board = useMemo(() => {
    const map: Record<WorkflowStatus, WorkflowTask[]> = { approved: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  async function decide(rec: DerivedRecommendation, action: "approve" | "dismiss") {
    setWorkflowError(null);
    try {
      const response = await fetch("/api/workflow/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domainId: domain.id, action, recommendation: rec }),
      });
      const body = (await response.json()) as { item?: WorkflowItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Could not save the workflow decision.");
      setWorkflowItems((prev) => [body.item!, ...prev.filter((item) => item.id !== body.item!.id)]);
      setSelected(null);
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Could not save the workflow decision.");
    }
  }

  async function advance(item: WorkflowTask) {
    const next = NEXT_STATUS[item.status];
    if (!next) return;
    setWorkflowError(null);
    try {
      const response = await fetch("/api/workflow/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, status: next }),
      });
      const body = (await response.json()) as { item?: WorkflowItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Could not update the task.");
      setWorkflowItems((prev) => prev.map((current) => (current.id === body.item!.id ? body.item! : current)));
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : "Could not update the task.");
    }
  }

  const header = (
    <PageHeader
      title={`${scopeLabel} — Recommendations & Tasks`}
      description="Priority-scored actions derived from measured signals, with a human approval workflow."
      lastSync={bundle?.lastSync ?? null}
      loading={loading}
    />
  );

  const scopeNote = <ScopeNote isPortfolio={isPortfolio} noun="recommendations" />;

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in space-y-5">
        {header}
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  if (!ds) {
    return (
      <div className="animate-in space-y-5">
        {header}
        {scopeNote}
        <EmptyState
          title="No recommendations yet — they are derived from live signals at each sync"
          description="Recommendations are computed from measured Search Console, crawl and backlink signals at each sync. Nothing to show until the first sync completes."
          icon={<Lightbulb className="h-5 w-5" />}
        />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      {header}
      {scopeNote}
      {workflowError && (
        <p role="alert" className="rounded-md border border-critical/20 bg-critical/10 px-3 py-2 text-xs text-critical">
          {workflowError}
        </p>
      )}

      {/* Provenance / policy banner */}
      <Card className="flex items-start gap-3 border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
        <div>
          <div className="text-sm font-semibold text-ink">Derived from live signals</div>
          <p className="mt-0.5 text-xs text-muted">
            Recommendations are derived from live measured signals (Search Console, crawls,
            backlinks) at each sync. Humans approve implementation — nothing changes automatically.
          </p>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open recommendations" value={String(kpis.open)} hint="Open now (excludes decided)" />
        <KpiCard
          label="High priority"
          value={String(kpis.highPriority)}
          hint="Priority score ≥ 70"
        />
        <KpiCard label="Modules covered" value={String(kpis.modules)} hint="Distinct source modules" />
        <KpiCard
          label="Avg priority"
          value={kpis.avgPriority == null ? "—" : String(kpis.avgPriority)}
          accent
          hint="Across open recommendations"
        />
      </div>

      {/* Recommendation queue */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Lightbulb className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Recommendation queue</h3>
          <span className="text-2xs text-muted">
            Sorted by priority — click one to review, then approve or dismiss
          </span>
          {dismissed.length > 0 && (
            <span className="ml-auto text-2xs text-muted tnum">
              {dismissed.length} dismissed
            </span>
          )}
        </div>
        {queue.length === 0 ? (
          <EmptyState
            title={
              recs.length === 0
                ? "No recommendations were derived at the last sync"
                : "Queue clear"
            }
            description={
              recs.length === 0
                ? "The last sync did not surface any actions from the measured signals for this domain."
                : "Every derived recommendation has been approved or dismissed in this session."
            }
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        ) : (
          <div className="space-y-2.5">
            {queue.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="block w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-workspace"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-[color:var(--accent)] tnum">
                    {r.priorityScore}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {r.title}
                  </span>
                  <span className="inline-flex items-center rounded border border-border bg-workspace px-1.5 py-0.5 text-2xs font-medium text-muted">
                    {r.module}
                  </span>
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-workspace text-2xs font-semibold text-ink"
                    title={`Effort: ${EFFORT_LABEL[r.effort]}`}
                  >
                    {r.effort}
                  </span>
                  <span
                    className={cn("text-xs font-medium capitalize", CONFIDENCE_COLOR[r.confidence])}
                  >
                    {r.confidence}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                  <span className="font-medium text-ink">{r.estImpact}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.evidence}>
                    {r.evidence}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Persisted task board */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Task board</h3>
          <span className="text-2xs text-muted">
            Decisions and status changes are stored in Postgres
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {BOARD_COLUMNS.map((col) => {
            const items = board[col.status];
            return (
              <div
                key={col.status}
                className="flex flex-col rounded-md border border-border bg-workspace/40"
              >
                <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted">
                    {col.label}
                  </span>
                  <span className="rounded-full bg-card px-1.5 text-2xs font-medium text-muted tnum">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <EmptyState
                      title="No tasks yet"
                      description="Approve a recommendation to create one."
                    />
                  ) : (
                    items.map((t) => {
                      const next = NEXT_STATUS[t.status];
                      return (
                        <div
                          key={t.id}
                          className="rounded-md border border-border bg-card p-2.5 shadow-card"
                        >
                          <div className="text-xs font-medium leading-snug text-ink">{t.title}</div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-2xs text-muted">{t.module}</span>
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-workspace text-[10px] font-semibold text-ink"
                              title={`Effort: ${EFFORT_LABEL[t.effort]}`}
                            >
                              {t.effort}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-2xs text-muted tnum">
                              Priority {t.priorityScore}
                            </span>
                            {next ? (
                              <Button variant="ghost" size="sm" onClick={() => advance(t)}>
                                {next === "in_progress" ? "Start" : "Mark done"}
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-2xs font-medium text-success">
                                <CheckCircle2 className="h-3 w-3" /> Done
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recommendation detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected ? `${selected.module} · Priority ${selected.priorityScore}` : undefined}
        footer={
          selected ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs text-muted">The decision is saved to the shared workflow</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => decide(selected, "dismiss")}>
                  <XCircle className="h-3.5 w-3.5" /> Dismiss
                </Button>
                <Button variant="primary" size="sm" onClick={() => decide(selected, "approve")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; create task
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StatusBadge label={selected.module} tone="neutral" />
              <span className="text-2xs text-muted">{selected.relatedMetric}</span>
            </div>
            <DrawerField label="Evidence (measured)">{selected.evidence}</DrawerField>
            <DrawerField label="Estimated impact">{selected.estImpact}</DrawerField>
            <div className="grid grid-cols-2 gap-2">
              <DrawerField label="Confidence">
                <span className={cn("capitalize", CONFIDENCE_COLOR[selected.confidence])}>
                  {selected.confidence}
                </span>
              </DrawerField>
              <DrawerField label="Effort">
                {EFFORT_LABEL[selected.effort]} ({selected.effort})
              </DrawerField>
            </div>
            <DrawerField label="Priority score">
              <span className="font-semibold text-[color:var(--accent)] tnum">
                {selected.priorityScore}
              </span>
              <span className="text-2xs text-muted"> / 100</span>
            </DrawerField>
            <p className="pt-2 text-2xs text-muted">
              Derived from live measured signals at the last sync. Approving creates a
              persisted task on the shared board below. No change is made automatically to the live
              site.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
