"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  FileWarning,
  Gauge,
  Layers,
  CheckCircle2,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  SeverityBadge,
  StatusBadge,
  EmptyState,
  Button,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { SEED, healthScore } from "@/data/seed";
import { formatDate } from "@/lib/dates";
import { fullNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type { CrawlRun, Severity, TechnicalIssue } from "@/lib/types";

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_FILTERS: Array<"all" | Severity> = ["all", "critical", "high", "medium", "low"];

function crawlTone(status: CrawlRun["status"]): "success" | "info" | "critical" {
  return status === "completed" ? "success" : status === "running" ? "info" : "critical";
}

function issueTone(
  status: TechnicalIssue["status"],
): "warning" | "info" | "success" | "neutral" {
  switch (status) {
    case "open":
      return "warning";
    case "in_progress":
      return "info";
    case "resolved":
      return "success";
    case "ignored":
      return "neutral";
  }
}

function barTone(score: number): { bar: string; text: string } {
  if (score >= 85) return { bar: "bg-success", text: "text-success" };
  if (score >= 70) return { bar: "bg-warning", text: "text-[#B9791A]" };
  return { bar: "bg-critical", text: "text-critical" };
}

export default function SiteAuditPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();

  const issues = SEED.technicalIssues[domain.id];
  const breakdown = SEED.healthBreakdown[domain.id];
  const crawlRuns = SEED.crawlRuns[domain.id];
  const latestCrawl = crawlRuns[0];
  const overall = healthScore(domain.id);

  const criticalHighOpen = useMemo(
    () =>
      issues.filter(
        (i) =>
          (i.severity === "critical" || i.severity === "high") &&
          i.status !== "resolved" &&
          i.status !== "ignored",
      ).length,
    [issues],
  );

  const categories = useMemo(
    () => Array.from(new Set(issues.map((i) => i.category))).sort(),
    [issues],
  );

  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<TechnicalIssue | null>(null);
  const [taskCreated, setTaskCreated] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const filteredIssues = useMemo(
    () =>
      issues.filter(
        (i) =>
          (severityFilter === "all" || i.severity === severityFilter) &&
          (categoryFilter === "all" || i.category === categoryFilter),
      ),
    [issues, severityFilter, categoryFilter],
  );

  const issueColumns: Column<TechnicalIssue>[] = [
    {
      key: "severity",
      header: "Severity",
      width: "108px",
      sortValue: (r) => SEVERITY_RANK[r.severity],
      render: (r) => <SeverityBadge severity={r.severity} />,
    },
    {
      key: "title",
      header: "Issue",
      sortValue: (r) => r.title,
      render: (r) => <span className="font-medium text-ink">{r.title}</span>,
    },
    {
      key: "category",
      header: "Category",
      sortValue: (r) => r.category,
      render: (r) => <span className="text-muted">{r.category}</span>,
    },
    {
      key: "affectedPages",
      header: "Affected",
      align: "right",
      sortValue: (r) => r.affectedPages,
      render: (r) => fullNumber(r.affectedPages),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status} tone={issueTone(r.status)} />,
    },
    {
      key: "lastSeen",
      header: "Last seen",
      align: "right",
      width: "128px",
      sortValue: (r) => r.lastSeen,
      render: (r) => <span className="text-muted">{formatDate(r.lastSeen)}</span>,
    },
  ];

  function openIssue(issue: TechnicalIssue) {
    setSelected(issue);
    setTaskCreated(false);
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Site Audit"
        description="Technical SEO health, crawl history and prioritised issues — with a transparent, weighted health score."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" /> Configure crawl
          </Button>
        }
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — audit data follows the
          domain rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Overall health score" value={String(overall)} accent hint="Weighted average, 0–100" />
        <KpiCard label="Total issues" value={String(issues.length)} hint="All severities & statuses" />
        <KpiCard
          label="Critical + high open"
          value={String(criticalHighOpen)}
          hint="Open or in progress"
        />
        <KpiCard
          label="Pages crawled"
          value={latestCrawl ? fullNumber(latestCrawl.pagesCrawled) : "—"}
          hint={latestCrawl ? `Latest crawl ${formatDate(latestCrawl.startedAt)}` : "No crawl yet"}
        />
      </div>

      {/* Health breakdown + crawl history */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Health score breakdown"
            subtitle="Category scores that compose the overall Orwell health score"
            action={<Gauge className="h-4 w-4 text-[color:var(--accent)]" />}
          />
          <div className="divide-y divide-border">
            {breakdown.map((b) => {
              const tone = barTone(b.score);
              return (
                <div key={b.category} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{b.category}</span>
                    <div className="flex items-center gap-3 text-2xs text-muted tnum">
                      <span>weight {Math.round(b.weight * 100)}%</span>
                      <span>
                        {b.issues} issue{b.issues === 1 ? "" : "s"}
                      </span>
                      <span className={cn("w-8 text-right font-semibold", tone.text)}>{b.score}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-workspace">
                    <div
                      className={cn("h-full rounded-full", tone.bar)}
                      style={{ width: `${b.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="border-t border-border px-4 py-3 text-2xs leading-relaxed text-muted">
            The Orwell health score is a transparent weighted average of category scores. Weights are
            shown per row and documented in docs/scoring-methodology.md — there is no hidden formula.
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Crawl history"
            subtitle="Recent crawler runs for this domain"
            action={<Activity className="h-4 w-4 text-muted" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-workspace/70 text-2xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-left">Started</th>
                  <th className="px-3 py-2 text-right">Pages</th>
                  <th className="px-3 py-2 text-right">Health</th>
                  <th className="px-3 py-2 text-right">+ / −</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {crawlRuns.map((c) => (
                  <tr key={c.id} className="border-b border-border/70 last:border-0">
                    <td className="px-3 py-2.5 text-ink">{formatDate(c.startedAt)}</td>
                    <td className="px-3 py-2.5 text-right text-ink tabular-nums tnum">
                      {fullNumber(c.pagesCrawled)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink tabular-nums tnum">{c.healthScore}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums tnum">
                      <span className="text-success">+{c.newIssues}</span>
                      <span className="text-muted"> / </span>
                      <span className="text-critical">−{c.resolvedIssues}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusBadge label={c.status} tone={crawlTone(c.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-3 py-2 text-2xs text-muted">
            + new issues detected / − issues resolved since the previous crawl.
          </p>
        </Card>
      </div>

      {/* Issues table */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-ink">Technical issues</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border bg-workspace p-0.5">
              {SEVERITY_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    severityFilter === s ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-ink focus:outline-none focus-visible:outline-2"
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <EmptyState
            title="No issues match these filters"
            description="Try a different severity or category — or clear the filters to see every detected issue."
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        ) : (
          <DataTable
            rows={filteredIssues}
            columns={issueColumns}
            searchKeys={(r) => `${r.title} ${r.category}`}
            searchPlaceholder="Search issues…"
            exportName={`site-audit-issues-${domain.id}`}
            onRowClick={openIssue}
            pageSize={12}
          />
        )}
      </Card>

      {/* Issue detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected ? `${selected.category} · ${selected.affectedPages} pages affected` : undefined}
        footer={
          <div className="flex items-center justify-between gap-3">
            {taskCreated ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Task created from this issue (demo)
              </span>
            ) : (
              <span className="text-2xs text-muted">Turn this issue into a tracked remediation task.</span>
            )}
            <Button variant="primary" size="sm" onClick={() => setTaskCreated(true)} disabled={taskCreated}>
              {taskCreated ? "Created" : "Create task"}
            </Button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <SeverityBadge severity={selected.severity} />
              <StatusBadge label={selected.status} tone={issueTone(selected.status)} />
            </div>
            <DrawerField label="Explanation">{selected.explanation}</DrawerField>
            <DrawerField label="Evidence">{selected.evidence}</DrawerField>
            <DrawerField label="Recommended fix">{selected.recommendedFix}</DrawerField>
            <DrawerField label="Potential impact">{selected.potentialImpact}</DrawerField>
            <div className="grid grid-cols-2 gap-2">
              <DrawerField label="First seen">{formatDate(selected.firstSeen)}</DrawerField>
              <DrawerField label="Last seen">{formatDate(selected.lastSeen)}</DrawerField>
            </div>
            <DrawerField label="Affected pages">
              <span className="tnum">{fullNumber(selected.affectedPages)}</span>
            </DrawerField>
            <DrawerField label={`Sample pages (${selected.samplePages.length})`}>
              <ul className="space-y-1">
                {selected.samplePages.map((p) => (
                  <li key={p}>
                    <a
                      href={`https://${domain.host}${p}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all text-xs text-[color:var(--accent)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </DrawerField>
          </div>
        )}
      </Drawer>

      {/* Configure crawl drawer (read-only demo) */}
      <Drawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Crawl configuration"
        subtitle={`${domain.name} · read-only demo controls`}
        width="max-w-md"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs text-muted">Settings are illustrative in this demo build.</span>
            <Button variant="secondary" size="sm" onClick={() => setConfigOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-workspace/50 px-3 py-2 text-2xs text-muted">
            <Layers className="h-3.5 w-3.5" />
            These controls are disabled in the demo — no live crawl is scheduled.
          </div>
          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">Frequency</div>
                <div className="text-2xs text-muted">How often the crawler runs</div>
              </div>
              <StatusBadge label="Weekly" tone="info" />
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">Crawl depth</div>
                <div className="text-2xs text-muted">Max link depth from the homepage</div>
              </div>
              <span className="text-sm font-medium text-ink tnum">5 levels</span>
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">Respect robots.txt</div>
                <div className="text-2xs text-muted">Honour crawl directives</div>
              </div>
              <StatusBadge label="Enabled" tone="success" />
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-ink">Max pages</div>
                <div className="text-2xs text-muted">Upper bound per crawl run</div>
              </div>
              <span className="text-sm font-medium text-ink tnum">25,000</span>
            </div>
          </div>
          <div className="flex items-start gap-2 text-2xs text-muted">
            <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            When live providers are connected, crawl configuration is managed in Settings → Data
            connections and applied per domain.
          </div>
        </div>
      </Drawer>
    </div>
  );
}
