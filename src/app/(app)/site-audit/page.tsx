"use client";

import { useMemo, useState } from "react";
import { Activity, CheckCircle2, FileWarning, Gauge, Hourglass } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  SeverityBadge,
  StatusBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { formatDate } from "@/lib/dates";
import { fullNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CrawlRun, Severity, TechnicalIssue } from "@/lib/types";

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_FILTERS: Array<"all" | Severity> = ["all", "critical", "high", "medium", "low"];

function crawlTone(status: CrawlRun["status"]): "success" | "info" | "critical" {
  return status === "completed" ? "success" : status === "running" ? "info" : "critical";
}

/** Bar + text tone for a 0–100 category score. */
function barTone(score: number): { bar: string; text: string } {
  if (score >= 85) return { bar: "bg-success", text: "text-success" };
  if (score >= 70) return { bar: "bg-warning", text: "text-[#B9791A]" };
  return { bar: "bg-critical", text: "text-critical" };
}

export default function SiteAuditPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);

  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [selected, setSelected] = useState<TechnicalIssue | null>(null);

  const onpage = bundle?.datasets.onpage?.data ?? null;
  const crawlRun = onpage?.crawlRun ?? null;

  const issues = useMemo<TechnicalIssue[]>(() => onpage?.issues ?? [], [onpage]);

  const criticalHigh = useMemo(
    () => issues.filter((i) => i.severity === "critical" || i.severity === "high").length,
    [issues],
  );

  const filteredIssues = useMemo(
    () => (severityFilter === "all" ? issues : issues.filter((i) => i.severity === severityFilter)),
    [issues, severityFilter],
  );

  const issueColumns = useMemo<Column<TechnicalIssue>[]>(
    () => [
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
        header: "Affected pages",
        align: "right",
        sortValue: (r) => r.affectedPages,
        render: (r) => fullNumber(r.affectedPages),
      },
      {
        key: "lastSeen",
        header: "Last seen",
        align: "right",
        width: "128px",
        sortValue: (r) => r.lastSeen,
        render: (r) => <span className="text-muted">{formatDate(r.lastSeen)}</span>,
      },
    ],
    [],
  );

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Site Audit"
          description="Technical SEO health, latest crawl and prioritised issues — scored with a transparent, weighted method."
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Skeleton className="h-72 xl:col-span-3" />
          <Skeleton className="h-72 xl:col-span-2" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Site Audit"
          description="Technical SEO health, latest crawl and prioritised issues — scored with a transparent, weighted method."
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Site Audit"
        description="Technical SEO health, latest crawl and prioritised issues — scored with a transparent, weighted method."
        lastSync={bundle?.lastSync ?? null}
        loading={loading}
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — audit data follows the
          domain rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Overall health score"
          value={onpage ? String(onpage.healthScore) : "—"}
          accent
          hint="Weighted average, 0–100"
        />
        <KpiCard
          label="Total issues"
          value={onpage ? fullNumber(issues.length) : "—"}
          hint="All severities"
        />
        <KpiCard
          label="Critical + high"
          value={onpage ? fullNumber(criticalHigh) : "—"}
          hint="Highest-priority issues"
        />
        <KpiCard
          label="Pages crawled"
          value={crawlRun ? fullNumber(crawlRun.pagesCrawled) : "—"}
          hint={crawlRun ? `Crawl started ${formatDate(crawlRun.startedAt)}` : "No crawl completed yet"}
        />
      </div>

      {/* No-crawl notice (crawls are async — first results arrive when the crawl finishes) */}
      {!onpage && (
        <Card className="flex items-start gap-3 border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 p-4">
          <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
          <div>
            <p className="text-sm font-semibold text-ink">No crawl completed yet</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              The OnPage crawl runs on first sync and weekly thereafter; results appear here when the
              crawl finishes. Crawls are asynchronous, so a sync may complete while the crawl is still
              pending.
            </p>
          </div>
        </Card>
      )}

      {/* Health breakdown + latest crawl */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Health score breakdown"
            subtitle="Category scores that compose the overall Orwell health score"
            action={<Gauge className="h-4 w-4 text-[color:var(--accent)]" />}
          />
          {onpage && onpage.breakdown.length > 0 ? (
            <div className="divide-y divide-border">
              {onpage.breakdown.map((b) => {
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
                        style={{ width: `${Math.max(0, Math.min(100, b.score))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No crawl data yet"
                description="Category scores populate once the first OnPage crawl completes."
              />
            </div>
          )}
          <p className="border-t border-border px-4 py-3 text-2xs leading-relaxed text-muted">
            The Orwell health score is a transparent weighted average of category scores. Weights are
            shown per row and documented in docs/scoring-methodology.md — there is no hidden formula.
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Latest crawl"
            subtitle="Most recent OnPage crawler run for this domain"
            action={<Activity className="h-4 w-4 text-muted" />}
          />
          {crawlRun ? (
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Status</span>
                <StatusBadge label={crawlRun.status} tone={crawlTone(crawlRun.status)} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Started</span>
                <span className="text-sm font-medium text-ink tnum">{formatDate(crawlRun.startedAt)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Completed</span>
                <span className="text-sm font-medium text-ink tnum">
                  {formatDate(crawlRun.completedAt)}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted">Pages crawled</span>
                <span className="text-sm font-medium text-ink tnum">
                  {fullNumber(crawlRun.pagesCrawled)}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No crawl run recorded"
                description="Crawl metadata appears here once the first OnPage crawl finishes."
              />
            </div>
          )}
        </Card>
      </div>

      {/* Issues table */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-ink">Technical issues</h3>
          </div>
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
        </div>

        {!onpage ? (
          <EmptyState
            title="No crawl completed yet"
            description="Issues appear here when the first OnPage crawl finishes."
          />
        ) : filteredIssues.length === 0 ? (
          <EmptyState
            title={
              severityFilter === "all" ? "No issues detected" : "No issues match this severity"
            }
            description={
              severityFilter === "all"
                ? "The latest crawl did not report any technical issues."
                : "Try a different severity — or select all to see every detected issue."
            }
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        ) : (
          <DataTable
            rows={filteredIssues}
            columns={issueColumns}
            searchKeys={(r) => `${r.title} ${r.category}`}
            searchPlaceholder="Search issues…"
            exportName={`site-audit-issues-${domain.id}`}
            onRowClick={setSelected}
            pageSize={12}
          />
        )}
      </Card>

      {/* Issue detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={
          selected
            ? `${selected.category} · ${fullNumber(selected.affectedPages)} page${
                selected.affectedPages === 1 ? "" : "s"
              } affected`
            : undefined
        }
      >
        {selected && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <SeverityBadge severity={selected.severity} />
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
          </div>
        )}
      </Drawer>
    </div>
  );
}
