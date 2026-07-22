"use client";

import { useMemo } from "react";
import { CloudOff, Database } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DOMAINS } from "@/data/domains";
import type { DomainHeadline } from "@/lib/live";
import { useLivePortfolio } from "@/lib/use-live";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { relativeFromNow } from "@/lib/dates";
import { useDomain } from "@/components/shell/domain-context";

/** Leaderboard row: live headline joined with the domain registry entry. */
interface LeaderboardRow extends DomainHeadline {
  name: string;
  accent: string;
  host: string;
}

function num(v: number | null): string {
  return v == null ? "—" : fullNumber(v);
}

export default function PortfolioPage() {
  const { setScope } = useDomain();
  const { data: pm, loading, error } = useLivePortfolio();

  // Latest sync across all domains — null when nothing has synced yet.
  const lastSync = useMemo(() => {
    if (!pm) return null;
    return pm.domains.reduce<string | null>(
      (max, d) => (d.lastSync && (!max || d.lastSync > max) ? d.lastSync : max),
      null,
    );
  }, [pm]);

  const rows = useMemo<LeaderboardRow[]>(() => {
    if (!pm) return [];
    return pm.domains
      .map((d) => {
        const meta = DOMAINS.find((x) => x.id === d.domainId);
        return {
          ...d,
          name: meta?.name ?? d.domainId,
          accent: meta?.accent ?? "var(--accent)",
          host: meta?.host ?? d.domainId,
        };
      })
      .sort((a, b) => (b.clicks28d ?? -1) - (a.clicks28d ?? -1));
  }, [pm]);

  const ga4Coverage = useMemo(() => {
    const mapped = rows.filter((r) => r.ga4Mapped).length;
    return { mapped, gscOnly: rows.length - mapped };
  }, [rows]);

  const awaitingSync = pm != null && pm.totals.domainsSynced === 0;
  // KPI totals are only honest once at least one domain has synced.
  const synced = pm != null && pm.totals.domainsSynced > 0;

  const leaderboardCols: Column<LeaderboardRow>[] = [
    {
      key: "domain",
      header: "Domain",
      sortValue: (r) => r.name,
      render: (r) => {
        const id = DOMAINS.find((x) => x.id === r.domainId)?.id;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => id && setScope(id)}
              className="flex items-center gap-2 text-left hover:underline"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.accent }} />
              <span className="font-medium text-ink">{r.name}</span>
            </button>
            {!r.ga4Mapped && (
              <span className="inline-flex items-center rounded-full border border-border bg-workspace px-1.5 py-px text-2xs font-medium text-muted">
                GSC only
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "clicks",
      header: "Clicks 28d",
      align: "right",
      sortValue: (r) => r.clicks28d ?? -1,
      render: (r) => num(r.clicks28d),
    },
    {
      key: "sessions",
      header: "Sessions 28d",
      align: "right",
      sortValue: (r) => r.sessions28d ?? -1,
      render: (r) => num(r.sessions28d),
    },
    {
      key: "conversions",
      header: "Conv. 28d",
      align: "right",
      sortValue: (r) => r.conversions28d ?? -1,
      render: (r) => num(r.conversions28d),
    },
    {
      key: "avgPosition",
      header: "Avg pos.",
      align: "right",
      sortValue: (r) => r.avgPosition ?? -1,
      render: (r) => (r.avgPosition == null ? "—" : r.avgPosition.toFixed(1)),
    },
    {
      key: "health",
      header: "Health",
      align: "right",
      sortValue: (r) => r.health ?? -1,
      render: (r) => (r.health == null ? "—" : String(r.health)),
    },
    {
      key: "authority",
      header: "Authority",
      align: "right",
      sortValue: (r) => r.authority ?? -1,
      render: (r) => (r.authority == null ? "—" : String(r.authority)),
    },
    {
      key: "keywords",
      header: "Keywords",
      align: "right",
      sortValue: (r) => r.keywordsTracked ?? -1,
      render: (r) => num(r.keywordsTracked),
    },
    {
      key: "critical",
      header: "Critical",
      align: "right",
      sortValue: (r) => r.criticalIssues ?? -1,
      render: (r) =>
        r.criticalIssues == null ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={r.criticalIssues > 0 ? "font-medium text-critical" : "text-muted"}>
            {r.criticalIssues}
          </span>
        ),
    },
    {
      key: "lastSync",
      header: "Last sync",
      align: "right",
      sortValue: (r) => r.lastSync ?? "",
      render: (r) =>
        r.lastSync ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-success"
            title={`Latest provider sync: ${r.lastSync}`}
          >
            <Database className="h-3 w-3" /> {relativeFromNow(r.lastSync)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted">
            <CloudOff className="h-3 w-3" /> never
          </span>
        ),
    },
  ];

  if (loading && !pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Portfolio Command Centre"
          description="Cross-domain SEO performance from live provider syncs."
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error && !pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Portfolio Command Centre"
          description="Cross-domain SEO performance from live provider syncs."
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  if (!pm) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Portfolio Command Centre"
          description="Cross-domain SEO performance from live provider syncs."
          lastSync={null}
        />
        <EmptyState
          title="No portfolio data available"
          description="The live portfolio read-model returned nothing. Run a sync to populate it."
        />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Portfolio Command Centre"
        description="Cross-domain organic performance, health and coverage — live provider data only."
        lastSync={lastSync}
        loading={loading}
      />

      {awaitingSync && (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6B12]" />
            <div>
              <h3 className="text-sm font-semibold text-ink">No sync has run yet</h3>
              <p className="mt-1 max-w-2xl text-xs text-muted">
                No domain in the portfolio has live data stored. The daily scheduled sync (or a
                manual trigger from Settings → Data connections) pulls Search Console, GA4 and
                ranking data and populates every metric on this page. Until then, all values
                below show “—” — nothing here is estimated or simulated.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* KPI row 1 — organic performance, last 28 days */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Organic clicks"
          value={synced ? compactNumber(pm.totals.clicks28d) : "—"}
          hint="Last 28 days · GSC, portfolio total"
        />
        <KpiCard
          label="Impressions"
          value={synced ? compactNumber(pm.totals.impressions28d) : "—"}
          hint="Last 28 days · GSC, portfolio total"
        />
        <KpiCard
          label="Organic sessions"
          value={synced ? compactNumber(pm.totals.sessions28d) : "—"}
          hint="Last 28 days · GA4-mapped domains only"
        />
        <KpiCard
          label="Organic conversions"
          value={synced ? fullNumber(pm.totals.conversions28d) : "—"}
          hint="Last 28 days · GA4-mapped domains only"
        />
      </div>

      {/* KPI row 2 — health & authority */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Avg site health"
          value={pm.totals.avgHealth == null ? "—" : String(Math.round(pm.totals.avgHealth))}
          hint="Across synced domains"
        />
        <KpiCard
          label="Avg visibility"
          value={pm.totals.avgVisibility == null ? "—" : percent(pm.totals.avgVisibility)}
          hint="Search visibility index"
        />
        <KpiCard
          label="Critical issues"
          value={synced ? fullNumber(pm.totals.criticalIssues) : "—"}
          hint="Open, portfolio total"
        />
        <KpiCard
          label="Referring domains"
          value={synced ? fullNumber(pm.totals.referringDomains) : "—"}
          hint="Portfolio total"
        />
      </div>

      {/* Domain leaderboard */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Domain leaderboard</h3>
          <span className="text-2xs text-muted">
            {pm.totals.domainsSynced} of {rows.length} domains synced · Click a domain to switch
            scope
          </span>
        </div>
        <DataTable
          rows={rows}
          columns={leaderboardCols}
          searchKeys={(r) => `${r.name} ${r.host}`}
          pageSize={12}
          exportName="portfolio-leaderboard"
          emptyLabel="No domains registered."
        />
        <p className="mt-3 px-1 text-2xs text-muted">
          GA4 coverage: {ga4Coverage.mapped} of {rows.length} domains have a GA4 property mapped.
          Domains marked “GSC only” report Search Console data but no sessions or conversions.
        </p>
      </Card>
    </div>
  );
}
