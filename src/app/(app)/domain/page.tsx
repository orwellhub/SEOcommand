"use client";

import { useMemo } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Link2,
  PieChart,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  SeverityBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { MultiLine } from "@/components/charts/charts";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { getDomain } from "@/data/domains";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { GscMover, Severity } from "@/lib/types";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const TREND_SERIES = [
  { key: "clicks", name: "Clicks", color: "var(--accent)" },
  { key: "impressions", name: "Impressions", color: "#94A3B8" },
];

function MoverColumn({
  heading,
  movers,
  tone,
}: {
  heading: string;
  movers: GscMover[];
  tone: "success" | "critical";
}) {
  const Icon = tone === "success" ? ArrowUpRight : ArrowDownRight;
  return (
    <div>
      <div
        className={cn(
          "mb-1.5 text-2xs font-semibold uppercase tracking-wide",
          tone === "success" ? "text-success" : "text-critical",
        )}
      >
        {heading}
      </div>
      {movers.length === 0 ? (
        <p className="text-xs text-muted">None in this window.</p>
      ) : (
        <div className="space-y-1.5">
          {movers.map((m) => (
            <div key={m.key} className="rounded-md px-2 py-1.5 hover:bg-workspace">
              <div className="truncate text-xs text-ink" title={m.key}>
                {m.key}
              </div>
              <div className="flex items-center justify-between text-2xs text-muted">
                <span className="tnum">
                  {fullNumber(m.clicksBefore)} → {fullNumber(m.clicksNow)} clicks
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium tnum",
                    tone === "success" ? "text-success" : "text-critical",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {m.change > 0 ? "+" : ""}
                  {fullNumber(m.change)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DomainOverviewPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);

  const ds = bundle?.datasets;
  const gscTotals = ds?.gsc_totals?.data ?? null;
  const ga4 = ds?.ga4_overview?.data ?? null;
  const onpage = ds?.onpage?.data ?? null;
  const som = ds?.share_of_market?.data ?? null;
  const movers = ds?.gsc_movers?.data ?? null;
  const ga4Unmapped = !ds?.ga4_overview && getDomain(domain.id).ga4PropertyId == null;

  const trendData = useMemo(
    () =>
      (bundle?.datasets.gsc_timeseries?.data ?? []).map((p) => ({
        date: p.date,
        clicks: p.clicks,
        impressions: p.impressions,
      })),
    [bundle],
  );

  const topPages = useMemo(
    () =>
      [...(bundle?.datasets.gsc_pages?.data ?? [])]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 8),
    [bundle],
  );

  const landingPages = useMemo(
    () =>
      [...(bundle?.datasets.ga4_landing_pages?.data ?? [])]
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 6),
    [bundle],
  );

  const competitors = useMemo(
    () =>
      [...(bundle?.datasets.competitors?.data ?? [])].sort(
        (a, b) => b.commonKeywords - a.commonKeywords,
      ),
    [bundle],
  );

  const severeIssueCount = useMemo(
    () =>
      (bundle?.datasets.onpage?.data.issues ?? []).filter(
        (i) => i.severity === "critical" || i.severity === "high",
      ).length,
    [bundle],
  );

  const topIssues = useMemo(
    () =>
      [...(bundle?.datasets.onpage?.data.issues ?? [])]
        .sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
            b.affectedPages - a.affectedPages,
        )
        .slice(0, 3),
    [bundle],
  );

  const recommendations = useMemo(
    () =>
      [...(bundle?.datasets.recommendations?.data ?? [])]
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 3),
    [bundle],
  );

  if (error) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title={`${domain.name} — Domain overview`}
          description={`Live SEO snapshot for ${domain.host}.`}
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title={`${domain.name} — Domain overview`}
          description={`Live SEO snapshot for ${domain.host}.`}
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title={`${domain.name} — Domain overview`}
          description={`Live SEO snapshot for ${domain.host}.`}
          lastSync={null}
          loading={loading}
        />
        <EmptyState
          title="No live data yet"
          description="Nothing has been synced for this domain — datasets populate on the next scheduled sync."
        />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`${domain.name} — Domain overview`}
        description={`Live SEO snapshot for ${domain.host} — measured Search Console, GA4 and crawl data.`}
        lastSync={bundle.lastSync ?? null}
        loading={loading}
      />

      {scope === "portfolio" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-workspace/60 px-3 py-2 text-2xs text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain selected in the rail. Switch domains there to change scope.
        </div>
      )}

      {/* GSC KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Clicks (28d)"
          value={gscTotals ? compactNumber(gscTotals.clicks) : "—"}
          accent
          hint="Search Console, last 28 days"
        />
        <KpiCard
          label="Impressions (28d)"
          value={gscTotals ? compactNumber(gscTotals.impressions) : "—"}
          hint="Search Console, last 28 days"
        />
        <KpiCard
          label="Avg CTR"
          value={gscTotals ? percent(gscTotals.ctr) : "—"}
          hint="Clicks / impressions, 28 days"
        />
        <KpiCard
          label="Avg position"
          value={gscTotals ? gscTotals.position.toFixed(1) : "—"}
          hint="Search Console average"
        />
      </div>

      {/* GA4 KPI row */}
      {ga4Unmapped ? (
        <Card className="flex items-center gap-2 px-3 py-2.5">
          <PieChart className="h-4 w-4 shrink-0 text-muted" />
          <p className="text-xs text-muted">
            No GA4 property connected — sessions and conversions unavailable.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Organic sessions"
            value={ga4 ? compactNumber(ga4.sessions) : "—"}
            hint={ga4 ? "GA4 organic, 28 days" : "Awaiting GA4 sync"}
          />
          <KpiCard
            label="Engaged sessions"
            value={ga4 ? compactNumber(ga4.engagedSessions) : "—"}
            hint={ga4 ? "GA4 organic, 28 days" : "Awaiting GA4 sync"}
          />
          <KpiCard
            label="Engagement rate"
            value={ga4 ? percent(ga4.engagementRate) : "—"}
            hint={ga4 ? "Engaged / total sessions" : "Awaiting GA4 sync"}
          />
          <KpiCard
            label="Conversions"
            value={ga4 ? fullNumber(ga4.conversions) : "—"}
            hint={ga4 ? "GA4 key events, 28 days" : "Awaiting GA4 sync"}
          />
        </div>
      )}

      {/* Trend + technical snapshot */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Clicks & impressions trend"
            subtitle="Daily measured Search Console data, last 90 days"
          />
          <div className="px-3 pb-3 pt-4">
            {trendData.length >= 2 ? (
              <MultiLine data={trendData} series={TREND_SERIES} />
            ) : (
              <EmptyState
                title="No search trend yet"
                description="Not yet synced — this dataset populates on the next scheduled sync."
              />
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Technical snapshot</h3>
            <ShieldAlert className="h-4 w-4 text-warning" />
          </div>
          {onpage ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-workspace/50 px-2 py-2 text-center">
                  <div className="text-lg font-semibold text-ink tnum">{onpage.healthScore}</div>
                  <div className="text-2xs text-muted">Health score</div>
                </div>
                <div className="rounded-md border border-border bg-workspace/50 px-2 py-2 text-center">
                  <div className="text-lg font-semibold text-ink tnum">{severeIssueCount}</div>
                  <div className="text-2xs text-muted">High / critical issues</div>
                </div>
              </div>
              {topIssues.length === 0 ? (
                <EmptyState title="No open issues" description="The last crawl found no issues." />
              ) : (
                <div className="space-y-2">
                  {topIssues.map((i) => (
                    <div key={i.id} className="rounded-md border border-border p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <SeverityBadge severity={i.severity} />
                        <span className="text-2xs text-muted tnum">
                          {fullNumber(i.affectedPages)} pages
                        </span>
                      </div>
                      <div className="truncate text-xs font-medium text-ink">{i.title}</div>
                      <div className="truncate text-2xs text-muted">{i.category}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No crawl completed yet" />
          )}
        </Card>
      </div>

      {/* Top pages + query movers */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Top pages</h3>
            <span className="text-2xs text-muted">GSC clicks, 28 days</span>
          </div>
          {topPages.length === 0 ? (
            <EmptyState
              title="No page data"
              description="Not yet synced — this dataset populates on the next scheduled sync."
            />
          ) : (
            <div className="space-y-1.5">
              {topPages.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-workspace"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate text-sm text-ink" title={p.key}>
                      {p.key}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 whitespace-nowrap text-xs">
                    <span className="text-ink tnum">{fullNumber(p.clicks)}</span>
                    <span className="text-muted tnum">{compactNumber(p.impressions)} imp</span>
                    <span className="w-10 text-right text-muted tnum">#{p.position.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Query movers</h3>
            <span className="text-2xs text-muted">Measured clicks vs previous 28 days</span>
          </div>
          {movers ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MoverColumn heading="Gains" movers={movers.gains.slice(0, 5)} tone="success" />
              <MoverColumn heading="Losses" movers={movers.losses.slice(0, 5)} tone="critical" />
            </div>
          ) : (
            <EmptyState
              title="No mover data"
              description="Not yet synced — this dataset populates on the next scheduled sync."
            />
          )}
        </Card>
      </div>

      {/* GA4 landing pages + share of market */}
      {(landingPages.length > 0 || som) && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {landingPages.length > 0 && (
            <Card className={cn("p-4", som ? "xl:col-span-2" : "xl:col-span-3")}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Top landing pages (GA4)</h3>
                <span className="text-2xs text-muted">Organic sessions, 28 days</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted">
                      <th className="py-2 text-left font-medium">Landing page</th>
                      <th className="py-2 text-right font-medium">Sessions</th>
                      <th className="py-2 text-right font-medium">Conversions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {landingPages.map((lp) => (
                      <tr key={lp.landingPage} className="hover:bg-workspace">
                        <td className="max-w-0 truncate py-2 pr-2 text-ink" title={lp.landingPage}>
                          {lp.landingPage}
                        </td>
                        <td className="py-2 text-right text-ink tnum">{fullNumber(lp.sessions)}</td>
                        <td className="py-2 text-right text-muted tnum">
                          {fullNumber(lp.conversions)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {som && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Share of market</h3>
                <PieChart className="h-4 w-4 text-[color:var(--accent)]" />
              </div>
              <div className="mt-3 text-3xl font-semibold text-ink tnum">
                {percent(som.shareOfAvailableClicksPct)}
              </div>
              <p className="mt-0.5 text-2xs text-muted">of available clicks captured</p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Measured clicks ({som.windowDays}d)</dt>
                  <dd className="font-medium text-ink tnum">{fullNumber(som.measuredClicks)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Available clicks in window</dt>
                  <dd className="font-medium text-ink tnum">
                    {fullNumber(som.availableClicksInWindow)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Impression share of demand</dt>
                  <dd className="font-medium text-ink tnum">
                    {percent(som.impressionShareOfDemandPct)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 rounded-md border border-dashed border-border bg-workspace/50 px-2.5 py-2 text-2xs text-muted">
                Measured GSC clicks over the researched keyword pool ({fullNumber(som.keywordCount)}{" "}
                keywords) — not a modelled estimate.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Competitors */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Competitors</h3>
          <span className="text-2xs text-muted">Overlapping organic rivals</span>
        </div>
        {competitors.length === 0 ? (
          <EmptyState
            title="No competitor data"
            description="Not yet synced — this dataset populates on the next scheduled sync."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-muted">
                  <th className="py-2 text-left font-medium">Competitor</th>
                  <th className="py-2 text-right font-medium">Common kw</th>
                  <th className="py-2 text-right font-medium">Keywords</th>
                  <th className="py-2 text-right font-medium">Authority</th>
                  <th className="py-2 text-right font-medium">Est. traffic</th>
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
                    <td className="py-2 text-right text-muted tnum">{fullNumber(c.keywords)}</td>
                    <td className="py-2 text-right text-muted tnum">{c.authority}</td>
                    <td className="py-2 text-right text-muted tnum">{compactNumber(c.estTraffic)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Derived recommendations */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Priority recommendations</h3>
          <span className="text-2xs text-muted">Derived from live signals</span>
        </div>
        {recommendations.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Recommendations are derived from live signals at sync time."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {recommendations.map((r) => (
              <div key={r.id} className="rounded-md border border-border p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <SeverityBadge
                    severity={r.priorityScore > 80 ? "critical" : r.priorityScore > 65 ? "high" : "medium"}
                  />
                  <span className="text-2xs font-semibold text-ink tnum">
                    Score {r.priorityScore}
                  </span>
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
