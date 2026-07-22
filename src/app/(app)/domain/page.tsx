"use client";

import { useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ExternalLink,
  Link2,
  Sparkles,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, SeverityBadge, EmptyState } from "@/components/ui/primitives";
import { AreaTrend } from "@/components/charts/charts";
import { SEED } from "@/data/seed";
import { domainMetrics, clicksSeries, winnersLosers } from "@/data/metrics";
import { compactNumber, fullNumber } from "@/lib/format";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import type { Severity, Trend } from "@/lib/types";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function TrendArrow({ trend }: { trend: Trend }) {
  if (trend === "up")
    return <ArrowUpRight className="h-3.5 w-3.5 text-success" aria-label="up" />;
  if (trend === "down")
    return <ArrowDownRight className="h-3.5 w-3.5 text-critical" aria-label="down" />;
  return <Minus className="h-3.5 w-3.5 text-muted" aria-label="flat" />;
}

export default function DomainOverviewPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();

  const metrics = useMemo(() => domainMetrics(domain.id), [domain.id]);
  const clicks = useMemo(() => clicksSeries(domain.id), [domain.id]);
  const movers = useMemo(() => winnersLosers(domain.id), [domain.id]);
  const clicksSpark = useMemo(() => clicks.map((c) => c.clicks), [clicks]);

  const topPages = useMemo(
    () =>
      [...SEED.content[domain.id]]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 6),
    [domain.id],
  );

  const competitors = useMemo(
    () => [...SEED.competitors[domain.id]].sort((a, b) => b.commonKeywords - a.commonKeywords).slice(0, 5),
    [domain.id],
  );

  const issues = useMemo(() => SEED.technicalIssues[domain.id], [domain.id]);
  const issueCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of issues) {
      if (i.status === "open" || i.status === "in_progress") counts[i.severity] += 1;
    }
    return counts;
  }, [issues]);
  const topIssues = useMemo(
    () =>
      [...issues]
        .filter((i) => i.status === "open" || i.status === "in_progress")
        .sort(
          (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
        )
        .slice(0, 3),
    [issues],
  );

  const recommendations = useMemo(
    () =>
      [...SEED.recommendations[domain.id]]
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 3),
    [domain.id],
  );

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`${domain.name} — Domain overview`}
        description={`Single-domain SEO snapshot for ${domain.host} — organic performance, rankings, competitors and priority actions.`}
      />

      {scope === "portfolio" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-workspace/60 px-3 py-2 text-2xs text-muted">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain selected in the rail. Switch domains there to change scope.
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Site health" value={String(metrics.health)} accent hint="Composite audit score" />
        <KpiCard
          label="Organic clicks"
          value={compactNumber(metrics.organicClicks)}
          delta={metrics.organicClicksDeltaPct}
          spark={clicksSpark}
          hint="Last 90 days"
        />
        <KpiCard label="Impressions" value={compactNumber(metrics.impressions)} hint="Search appearances" />
        <KpiCard
          label="Visibility / SOV"
          value={`${metrics.visibility}%`}
          delta={metrics.visibilityDeltaPct}
          hint="Share of voice index"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Estimated traffic" value={compactNumber(metrics.estTraffic)} hint="Modelled monthly sessions" />
        <KpiCard
          label="Organic conversions"
          value={fullNumber(metrics.conversions)}
          delta={metrics.conversionsDeltaPct}
          hint="Leads from organic"
        />
        <KpiCard label="Tracked keywords" value={fullNumber(metrics.trackedKeywords)} hint={`${metrics.top3} in top 3`} />
        <KpiCard label="Referring domains" value={fullNumber(metrics.referringDomains)} hint="Unique linking hosts" />
      </div>

      {/* Trend chart + technical issues */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Organic clicks & impressions"
            subtitle="Daily organic clicks over 90 days — reconciled to headline volume"
          />
          <div className="px-3 pb-3 pt-4">
            <AreaTrend data={clicks} dataKey="clicks" color="var(--accent)" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Technical issues</h3>
            <ShieldAlert className="h-4 w-4 text-warning" />
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {SEVERITY_ORDER.map((sev) => (
              <div key={sev} className="rounded-md border border-border bg-workspace/50 px-2 py-2 text-center">
                <div className="text-lg font-semibold text-ink tnum">{issueCounts[sev]}</div>
                <div className="text-2xs capitalize text-muted">{sev}</div>
              </div>
            ))}
          </div>
          {topIssues.length === 0 ? (
            <EmptyState title="No open issues" description="This domain has no open technical issues." />
          ) : (
            <div className="space-y-2">
              {topIssues.map((i) => (
                <div key={i.id} className="rounded-md border border-border p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <SeverityBadge severity={i.severity} />
                    <span className="text-2xs text-muted tnum">{fullNumber(i.affectedPages)} pages</span>
                  </div>
                  <div className="truncate text-xs font-medium text-ink">{i.title}</div>
                  <div className="truncate text-2xs text-muted">{i.category}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Top pages + ranking movement */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Top pages</h3>
            <span className="text-2xs text-muted">By organic clicks</span>
          </div>
          {topPages.length === 0 ? (
            <EmptyState title="No page data" />
          ) : (
            <div className="space-y-1.5">
              {topPages.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-workspace"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate text-sm text-ink" title={p.url}>
                      {p.url}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 whitespace-nowrap text-xs">
                    <span className="text-ink tnum">{fullNumber(p.clicks)}</span>
                    <span className="w-10 text-right text-muted tnum">#{p.avgPosition.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Ranking movement</h3>
            <Trophy className="h-4 w-4 text-[color:var(--accent)]" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-success">Winners</div>
              {movers.winners.length === 0 ? (
                <p className="text-xs text-muted">No gains this period.</p>
              ) : (
                <div className="space-y-1.5">
                  {movers.winners.slice(0, 4).map((m) => (
                    <div key={m.keywordId} className="rounded-md px-2 py-1.5 hover:bg-workspace">
                      <div className="truncate text-xs text-ink">{m.keyword}</div>
                      <div className="flex items-center justify-between text-2xs text-muted">
                        <span className="tnum">
                          {m.prevPosition} → {m.position}
                        </span>
                        <span className="inline-flex items-center gap-0.5 font-medium text-success tnum">
                          <ArrowUpRight className="h-3 w-3" />
                          {m.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-critical">Losers</div>
              {movers.losers.length === 0 ? (
                <p className="text-xs text-muted">No drops this period.</p>
              ) : (
                <div className="space-y-1.5">
                  {movers.losers.slice(0, 4).map((m) => (
                    <div key={m.keywordId} className="rounded-md px-2 py-1.5 hover:bg-workspace">
                      <div className="truncate text-xs text-ink">{m.keyword}</div>
                      <div className="flex items-center justify-between text-2xs text-muted">
                        <span className="tnum">
                          {m.prevPosition} → {m.position}
                        </span>
                        <span className="inline-flex items-center gap-0.5 font-medium text-critical tnum">
                          <ArrowDownRight className="h-3 w-3" />
                          {Math.abs(m.delta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Competitor movement + mini stats */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Competitor movement</h3>
            <span className="text-2xs text-muted">Top overlapping rivals</span>
          </div>
          {competitors.length === 0 ? (
            <EmptyState title="No competitors tracked" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted">
                    <th className="py-2 text-left font-medium">Competitor</th>
                    <th className="py-2 text-right font-medium">Common kw</th>
                    <th className="py-2 text-right font-medium">Authority</th>
                    <th className="py-2 text-right font-medium">Est. traffic</th>
                    <th className="py-2 text-right font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {competitors.map((c) => (
                    <tr key={c.id} className="hover:bg-workspace">
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-1.5 text-ink">
                          <Link2 className="h-3.5 w-3.5 text-muted" />
                          {c.host}
                        </span>
                      </td>
                      <td className="py-2 text-right text-ink tnum">{fullNumber(c.commonKeywords)}</td>
                      <td className="py-2 text-right text-muted tnum">{c.authority}</td>
                      <td className="py-2 text-right text-muted tnum">{compactNumber(c.estTraffic)}</td>
                      <td className="py-2">
                        <span className="flex justify-end">
                          <TrendArrow trend={c.trend} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">Referring-domain growth</span>
              <Link2 className="h-4 w-4 text-[color:var(--accent)]" />
            </div>
            <div className="mt-2 text-2xl font-semibold text-ink tnum">
              {fullNumber(metrics.referringDomains)}
            </div>
            <p className="mt-1 text-2xs text-muted">
              <span className="font-medium text-success">+{metrics.newBacklinks}</span> new /
              <span className="ml-1 font-medium text-critical">−{metrics.lostBacklinks}</span> lost backlinks
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">AI mentions & citations</span>
              <Sparkles className="h-4 w-4 text-[color:var(--accent)]" />
            </div>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <div className="text-2xl font-semibold text-ink tnum">{metrics.aiMentionRate}%</div>
                <div className="text-2xs text-muted">Mention rate</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-ink tnum">{metrics.aiCitationRate}%</div>
                <div className="text-2xs text-muted">Citation rate</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Priority recommendations */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Priority recommendations</h3>
          <span className="text-2xs text-muted">Top actions for {domain.name}</span>
        </div>
        {recommendations.length === 0 ? (
          <EmptyState title="No recommendations" description="No open recommendations for this domain." />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {recommendations.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <SeverityBadge
                    severity={r.priorityScore > 80 ? "critical" : r.priorityScore > 65 ? "high" : "medium"}
                  />
                  <span className="text-2xs font-semibold text-ink tnum">Score {r.priorityScore}</span>
                </div>
                <div className="text-sm font-medium text-ink">{r.title}</div>
                <div className="mt-1.5 flex items-center justify-between text-2xs text-muted">
                  <span className="capitalize">{r.module}</span>
                  <span>{r.estImpact}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
