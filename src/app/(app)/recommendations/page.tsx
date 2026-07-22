"use client";

import { useMemo, useState } from "react";
import {
  Lightbulb,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, StatusBadge, EmptyState, Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { SEED } from "@/data/seed";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type { ApprovalStatus, Recommendation, Task, TaskStatus } from "@/lib/types";

function approvalTone(status: ApprovalStatus): "success" | "warning" | "critical" | "neutral" {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "critical";
    default:
      return "neutral";
  }
}

const EFFORT_LABEL: Record<Recommendation["effort"], string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

const CONFIDENCE_COLOR: Record<Recommendation["confidence"], string> = {
  high: "text-success",
  medium: "text-[#B9791A]",
  low: "text-muted",
};

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "approved", label: "Approved" },
  { status: "in_progress", label: "In progress" },
  { status: "review", label: "Review" },
  { status: "done", label: "Done" },
];

export default function RecommendationsPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();

  const [selected, setSelected] = useState<Recommendation | null>(null);
  // Local, in-memory approval overrides — demonstrates the recommendation→task
  // conversion without any persistence or live-site mutation.
  const [overrides, setOverrides] = useState<Record<string, ApprovalStatus>>({});

  const recs = useMemo(
    () => [...(SEED.recommendations[domain.id] ?? [])].sort((a, b) => b.priorityScore - a.priorityScore),
    [domain.id],
  );
  const tasks = useMemo(() => SEED.tasks[domain.id] ?? [], [domain.id]);

  const effectiveApproval = (r: Recommendation): ApprovalStatus => overrides[r.id] ?? r.approval;

  const kpis = useMemo(() => {
    const pending = recs.filter((r) => effectiveApproval(r) === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const avgScore = recs.length
      ? Math.round(recs.reduce((sum, r) => sum + r.priorityScore, 0) / recs.length)
      : 0;
    return { open: recs.length, pending, inProgress, avgScore };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs, tasks, overrides]);

  const board = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      approved: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const columns: Column<Recommendation>[] = [
    {
      key: "title",
      header: "Recommendation",
      sortValue: (r) => r.title,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{r.title}</div>
          <div className="text-2xs text-muted">{r.relatedMetric}</div>
        </div>
      ),
    },
    {
      key: "module",
      header: "Module",
      sortValue: (r) => r.module,
      render: (r) => <span className="text-muted">{r.module}</span>,
    },
    {
      key: "priorityScore",
      header: "Priority",
      align: "right",
      width: "96px",
      sortValue: (r) => r.priorityScore,
      render: (r) => <span className="font-semibold text-[color:var(--accent)] tnum">{r.priorityScore}</span>,
    },
    {
      key: "estImpact",
      header: "Est. impact",
      sortValue: (r) => r.estImpact,
      render: (r) => <span className="text-xs text-ink">{r.estImpact}</span>,
    },
    {
      key: "confidence",
      header: "Confidence",
      width: "112px",
      sortValue: (r) => r.confidence,
      render: (r) => (
        <span className={cn("text-xs font-medium capitalize", CONFIDENCE_COLOR[r.confidence])}>
          {r.confidence}
        </span>
      ),
    },
    {
      key: "effort",
      header: "Effort",
      align: "center",
      width: "80px",
      sortValue: (r) => r.effort,
      render: (r) => (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-workspace text-2xs font-semibold text-ink"
          title={EFFORT_LABEL[r.effort]}
        >
          {r.effort}
        </span>
      ),
    },
    {
      key: "approval",
      header: "Approval",
      width: "120px",
      sortValue: (r) => effectiveApproval(r),
      render: (r) => {
        const a = effectiveApproval(r);
        return <StatusBadge label={a} tone={approvalTone(a)} />;
      },
    },
  ];

  const selApproval = selected ? effectiveApproval(selected) : "draft";

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Recommendations & Tasks"
        description="Agent-drafted, priority-scored actions with a human approval workflow — nothing ships to a live site without sign-off."
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — recommendations follow the
          domain rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Open recommendations" value={String(kpis.open)} hint="Drafted for this domain" />
        <KpiCard label="Pending approval" value={String(kpis.pending)} hint="Awaiting human sign-off" />
        <KpiCard label="Tasks in progress" value={String(kpis.inProgress)} hint="Currently being implemented" />
        <KpiCard label="Avg priority score" value={String(kpis.avgScore)} accent hint="Across open recommendations" />
      </div>

      {/* Action policy note */}
      <Card className="flex items-start gap-3 border-[color:var(--accent)]/30 bg-[color:var(--accent-soft)] p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
        <div>
          <div className="text-sm font-semibold text-ink">Action policy</div>
          <p className="mt-0.5 text-xs text-muted">
            Agents analyse and draft recommendations. Humans approve implementation. The platform never
            automatically modifies live websites.
          </p>
        </div>
      </Card>

      {/* Recommendation queue */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Recommendation queue</h3>
          <span className="text-2xs text-muted">Sorted by priority — click a row to review and approve</span>
        </div>
        {recs.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Agents have not drafted any recommendations for this domain."
            icon={<Lightbulb className="h-5 w-5" />}
          />
        ) : (
          <DataTable
            rows={recs}
            columns={columns}
            searchKeys={(r) => `${r.title} ${r.module} ${r.relatedMetric}`}
            onRowClick={setSelected}
            exportName={`recommendations-${domain.id}`}
            pageSize={10}
          />
        )}
      </Card>

      {/* Task board */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold text-ink">Task board</h3>
          <span className="text-2xs text-muted">Approved recommendations become tracked, owned tasks</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {BOARD_COLUMNS.map((col) => {
            const items = board[col.status];
            return (
              <div key={col.status} className="flex flex-col rounded-md border border-border bg-workspace/40">
                <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{col.label}</span>
                  <span className="rounded-full bg-card px-1.5 text-2xs font-medium text-muted tnum">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-center text-2xs text-muted">No tasks</p>
                  ) : (
                    items.map((t) => (
                      <div key={t.id} className="rounded-md border border-border bg-card p-2.5 shadow-card">
                        <div className="text-xs font-medium leading-snug text-ink">{t.title}</div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-2xs text-muted">{t.owner}</span>
                          <span
                            className="inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-workspace text-[10px] font-semibold text-ink"
                            title={EFFORT_LABEL[t.effort]}
                          >
                            {t.effort}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <StatusBadge label={t.approval} tone={approvalTone(t.approval)} />
                          <span className="text-2xs text-muted tnum">Due {formatDate(t.dueDate)}</span>
                        </div>
                        {t.afterMetric ? (
                          <div className="mt-1.5 rounded border border-success/20 bg-success/5 px-1.5 py-1 text-[10px] text-success">
                            {t.afterMetric}
                          </div>
                        ) : (
                          <div className="mt-1.5 text-[10px] text-muted">{t.beforeMetric}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recommendation detail drawer + approval workflow */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected ? `${selected.module} · Priority ${selected.priorityScore}` : undefined}
        footer={
          selected ? (
            selApproval === "approved" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Task created (approval required before implementation)
              </span>
            ) : selApproval === "rejected" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-critical">
                <XCircle className="h-4 w-4" /> Recommendation rejected — no task created
              </span>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setOverrides((o) => ({ ...o, [selected.id]: "rejected" }))}
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setOverrides((o) => ({ ...o, [selected.id]: "approved" }))}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; create task
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StatusBadge label={selApproval} tone={approvalTone(selApproval)} />
              <span className="text-2xs text-muted">{selected.module}</span>
            </div>
            <DrawerField label="Evidence">{selected.evidence}</DrawerField>
            <DrawerField label="Related metric">{selected.relatedMetric}</DrawerField>
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
              <span className="font-semibold text-[color:var(--accent)] tnum">{selected.priorityScore}</span>
              <span className="text-2xs text-muted"> / 100</span>
            </DrawerField>
            {selApproval === "approved" && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-success/20 bg-success/5 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-xs text-ink">
                  A tracked task was created from this recommendation. It still requires human approval before
                  implementation — the platform will never modify the live site automatically.
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
