"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, ArrowDownRight, Radio } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, SeverityBadge, StatusBadge } from "@/components/ui/primitives";
import { MultiLine } from "@/components/charts/charts";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DOMAINS } from "@/data/domains";
import { portfolioMetrics, portfolioVisibilitySeries, type DomainMetrics } from "@/data/metrics";
import { SEED } from "@/data/seed";
import { compactNumber, fullNumber } from "@/lib/format";
import { relativeFromNow } from "@/lib/dates";
import { useDomain } from "@/components/shell/domain-context";

export default function PortfolioPage() {
  const { setScope } = useDomain();
  const pm = useMemo(() => portfolioMetrics(), []);
  const visSeries = useMemo(() => portfolioVisibilitySeries(), []);
  const [tab, setTab] = useState<"winners" | "losers">("winners");

  const movers = useMemo(() => {
    const all = DOMAINS.flatMap((d) =>
      SEED.rankSnapshots[d.id].map((s) => ({
        ...s,
        domainId: d.id,
        domainName: d.name,
        accent: d.accent,
        delta: s.prevPosition - s.position,
      })),
    );
    return {
      winners: [...all].sort((a, b) => b.delta - a.delta).slice(0, 6),
      losers: [...all].sort((a, b) => a.delta - b.delta).slice(0, 6),
    };
  }, []);

  const leaderboardCols: Column<DomainMetrics>[] = [
    {
      key: "domain",
      header: "Domain",
      sortValue: (r) => DOMAINS.find((d) => d.id === r.domainId)!.name,
      render: (r) => {
        const d = DOMAINS.find((x) => x.id === r.domainId)!;
        return (
          <button onClick={() => setScope(r.domainId)} className="flex items-center gap-2 text-left hover:underline">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.accent }} />
            <span className="font-medium text-ink">{d.name}</span>
          </button>
        );
      },
    },
    { key: "health", header: "Health", align: "right", sortValue: (r) => r.health, render: (r) => r.health },
    {
      key: "clicks",
      header: "Organic clicks",
      align: "right",
      sortValue: (r) => r.organicClicks,
      render: (r) => fullNumber(r.organicClicks),
    },
    {
      key: "vis",
      header: "Visibility",
      align: "right",
      sortValue: (r) => r.visibility,
      render: (r) => `${r.visibility}%`,
    },
    {
      key: "top3",
      header: "Top 3",
      align: "right",
      sortValue: (r) => r.top3,
      render: (r) => r.top3,
    },
    {
      key: "critical",
      header: "Critical",
      align: "right",
      sortValue: (r) => r.criticalIssues,
      render: (r) => (
        <span className={r.criticalIssues > 0 ? "font-medium text-critical" : "text-muted"}>
          {r.criticalIssues}
        </span>
      ),
    },
    {
      key: "authority",
      header: "Authority",
      align: "right",
      sortValue: (r) => r.authorityScore,
      render: (r) => r.authorityScore,
    },
  ];

  const priorityRecs = useMemo(
    () =>
      DOMAINS.flatMap((d) => SEED.recommendations[d.id].map((r) => ({ ...r, domainName: d.name })))
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 5),
    [],
  );

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Portfolio Command Centre"
        description="Cross-domain SEO health, visibility and priority actions across all pilot brands."
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Average site health" value={String(pm.avgHealth)} delta={2.1} hint="Weighted across 3 domains" />
        <KpiCard label="Total organic clicks" value={compactNumber(pm.totalClicks)} delta={6.4} hint="Last 28 days" />
        <KpiCard label="Avg search visibility" value={`${pm.avgVisibility}%`} delta={3.2} hint="Share of voice index" />
        <KpiCard label="Organic conversions" value={fullNumber(pm.totalConversions)} delta={9.1} hint="Leads from organic" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Critical issues" value={String(pm.criticalIssues)} delta={-12.5} invertDelta hint="Open, high + critical" />
        <KpiCard label="Referring domains" value={fullNumber(pm.totalReferringDomains)} delta={4.0} hint="Portfolio total" />
        <KpiCard label="New / lost backlinks" value={`${pm.newBacklinks} / ${pm.lostBacklinks}`} hint="Last 7 days" />
        <KpiCard label="Avg AI mention rate" value={`${pm.avgAiMentionRate}%`} delta={5.5} hint="Across AI platforms" />
      </div>

      {/* Visibility comparison + data source health */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Visibility comparison" subtitle="Search visibility index over 90 days — one line per domain" />
          <div className="px-3 pb-3 pt-4">
            <MultiLine
              data={visSeries}
              series={DOMAINS.map((d) => ({ key: d.id, name: d.name, color: d.accent }))}
            />
            <div className="mt-2 flex flex-wrap gap-4 px-1">
              {DOMAINS.map((d) => (
                <span key={d.id} className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.accent }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Data-source health" subtitle="Provider connection state" />
          <div className="divide-y divide-border">
            {SEED.providerConnections.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Radio className={c.connected ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"} />
                  <div>
                    <div className="text-sm font-medium text-ink">{c.label}</div>
                    <div className="text-2xs text-muted">
                      {c.lastSync ? `Synced ${relativeFromNow(c.lastSync)}` : "Never synced"}
                    </div>
                  </div>
                </div>
                <StatusBadge label={c.status} tone={c.connected ? "success" : "neutral"} />
              </div>
            ))}
            <div className="px-4 py-3 text-2xs text-muted">
              All modules currently render seeded demo data. Live activation is configured in Settings → Data connections.
            </div>
          </div>
        </Card>
      </div>

      {/* Leaderboard + movers */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Domain leaderboard</h3>
            <span className="text-2xs text-muted">Click a domain to switch scope</span>
          </div>
          <DataTable rows={pm.domains} columns={leaderboardCols} pageSize={5} exportName="portfolio-leaderboard" />
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Ranking movers</h3>
            <div className="flex rounded-md border border-border bg-workspace p-0.5">
              <button
                onClick={() => setTab("winners")}
                className={`rounded px-2.5 py-1 text-xs font-medium ${tab === "winners" ? "bg-card text-ink shadow-sm" : "text-muted"}`}
              >
                Winners
              </button>
              <button
                onClick={() => setTab("losers")}
                className={`rounded px-2.5 py-1 text-xs font-medium ${tab === "losers" ? "bg-card text-ink shadow-sm" : "text-muted"}`}
              >
                Losers
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {(tab === "winners" ? movers.winners : movers.losers).map((m) => (
              <div key={`${m.domainId}-${m.keywordId}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-workspace">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{m.keyword}</div>
                  <div className="flex items-center gap-1.5 text-2xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.accent }} />
                    {m.domainName}
                  </div>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-xs text-muted tnum">
                    {m.prevPosition} → {m.position}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-medium tnum ${m.delta >= 0 ? "text-success" : "text-critical"}`}
                  >
                    {m.delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {Math.abs(m.delta)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Priority actions */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Priority actions across the portfolio</h3>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {priorityRecs.map((r) => (
            <div key={r.id} className="rounded-md border border-border p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <SeverityBadge severity={r.priorityScore > 80 ? "critical" : r.priorityScore > 65 ? "high" : "medium"} />
                <span className="text-2xs font-semibold text-ink tnum">Score {r.priorityScore}</span>
              </div>
              <div className="text-sm font-medium text-ink">{r.title}</div>
              <div className="mt-1.5 flex items-center justify-between text-2xs text-muted">
                <span>{r.domainName}</span>
                <span>{r.estImpact}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
