"use client";

import { useMemo, useState } from "react";
import { FileText, TrendingDown, TrendingUp, ExternalLink, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  SourceBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { getDomain } from "@/data/domains";
import type { Ga4LandingPage, GscMover, GscRow } from "@/lib/types";

/* ------------------------------- helpers -------------------------------- */

/** Strip the scheme so long page URLs stay legible in dense tables. */
function displayPath(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function MoverList({
  movers,
  tone,
}: {
  movers: GscMover[];
  tone: "critical" | "success";
}) {
  return (
    <div className="space-y-1.5">
      {movers.map((m) => (
        <div
          key={m.key}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-workspace"
        >
          <span
            className="min-w-0 truncate font-mono text-xs text-ink"
            title={m.key}
          >
            {displayPath(m.key)}
          </span>
          <div className="flex items-center gap-3 whitespace-nowrap">
            <span className="text-2xs text-muted tnum">
              {fullNumber(m.clicksBefore)} → {fullNumber(m.clicksNow)}
            </span>
            <span
              className={cn(
                "text-xs font-semibold tnum",
                tone === "critical" ? "text-critical" : "text-success",
              )}
            >
              {m.change > 0 ? "+" : ""}
              {fullNumber(m.change)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- page ---------------------------------- */

export default function ContentIntelligencePage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);

  const [selected, setSelected] = useState<GscRow | null>(null);

  const datasets = bundle?.datasets;
  const pagesDs = datasets?.gsc_pages;
  const moversDs = datasets?.gsc_page_movers;
  const ga4LandingDs = datasets?.ga4_landing_pages;
  const ga4Mapped = getDomain(domain.id).ga4PropertyId != null;

  const pages = pagesDs?.data;
  const movers = moversDs?.data;

  /* ----------------------------- KPI values ----------------------------- */
  const totalClicks = useMemo(
    () => (pages ? pages.reduce((s, p) => s + p.clicks, 0) : null),
    [pages],
  );

  const losses = useMemo(
    () => (movers ? [...movers.losses].sort((a, b) => a.change - b.change) : null),
    [movers],
  );
  const gains = useMemo(
    () => (movers ? [...movers.gains].sort((a, b) => b.change - a.change) : null),
    [movers],
  );

  /** Mover entry for the selected page, if it gained or declined. */
  const selectedMover = useMemo<{ mover: GscMover; direction: "gain" | "loss" } | null>(() => {
    if (!selected || !movers) return null;
    const gain = movers.gains.find((m) => m.key === selected.key);
    if (gain) return { mover: gain, direction: "gain" };
    const loss = movers.losses.find((m) => m.key === selected.key);
    if (loss) return { mover: loss, direction: "loss" };
    return null;
  }, [selected, movers]);

  /* ------------------------------ Columns ------------------------------- */
  const pageCols = useMemo<Column<GscRow>[]>(
    () => [
      {
        key: "page",
        header: "Page",
        sortValue: (r) => r.key,
        render: (r) => (
          <span
            className="block max-w-[340px] truncate font-mono text-xs text-ink"
            title={r.key}
          >
            {displayPath(r.key)}
          </span>
        ),
      },
      {
        key: "clicks",
        header: "Clicks",
        align: "right",
        sortValue: (r) => r.clicks,
        render: (r) => fullNumber(r.clicks),
      },
      {
        key: "impressions",
        header: "Impressions",
        align: "right",
        sortValue: (r) => r.impressions,
        render: (r) => fullNumber(r.impressions),
      },
      {
        key: "ctr",
        header: "CTR",
        align: "right",
        sortValue: (r) => r.ctr,
        render: (r) => percent(r.ctr),
      },
      {
        key: "position",
        header: "Avg position",
        align: "right",
        sortValue: (r) => r.position,
        render: (r) => r.position.toFixed(1),
      },
    ],
    [],
  );

  const ga4Cols = useMemo<Column<Ga4LandingPage>[]>(
    () => [
      {
        key: "landingPage",
        header: "Landing page",
        sortValue: (r) => r.landingPage,
        render: (r) => (
          <span
            className="block max-w-[340px] truncate font-mono text-xs text-ink"
            title={r.landingPage}
          >
            {r.landingPage}
          </span>
        ),
      },
      {
        key: "sessions",
        header: "Sessions",
        align: "right",
        sortValue: (r) => r.sessions,
        render: (r) => fullNumber(r.sessions),
      },
      {
        key: "engagementRate",
        header: "Engagement rate",
        align: "right",
        sortValue: (r) => r.engagementRate,
        render: (r) => percent(r.engagementRate),
      },
      {
        key: "conversions",
        header: "Conversions",
        align: "right",
        sortValue: (r) => r.conversions,
        render: (r) => fullNumber(r.conversions),
      },
    ],
    [],
  );

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Content Intelligence"
        description={`Page-level search performance for ${domain.host} — real Search Console page data: traffic, decay and rising pages, plus GA4 landing-page outcomes.`}
        lastSync={bundle?.lastSync ?? null}
        loading={loading}
      />

      {scope === "portfolio" && (
        <p className="text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the
          domain rail selection.
        </p>
      )}

      {loading && !bundle ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-80" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </>
      ) : error ? (
        <EmptyState title="Could not load live data" description={error} />
      ) : (
        <>
          {/* KPI row — measured values only; "—" until the dataset syncs. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Pages with traffic"
              value={pages ? fullNumber(pages.length) : "—"}
              hint="GSC pages, last 28 days"
              accent
            />
            <KpiCard
              label="Total page clicks"
              value={totalClicks != null ? compactNumber(totalClicks) : "—"}
              hint="Sum across tracked pages"
            />
            <KpiCard
              label="Pages gaining"
              value={gains ? fullNumber(gains.length) : "—"}
              hint="Clicks up vs previous 28 days"
            />
            <KpiCard
              label="Pages declining"
              value={losses ? fullNumber(losses.length) : "—"}
              hint="Clicks down vs previous 28 days"
            />
          </div>

          {/* --------------------------- Page inventory ------------------------ */}
          {!pagesDs ? (
            <EmptyState
              title="Page inventory not yet synced"
              description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
              icon={<FileText className="h-5 w-5" />}
            />
          ) : (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Page inventory</h3>
                  <p className="mt-0.5 text-2xs text-muted">
                    Every page with search traffic in the last 28 days — from Search Console.
                  </p>
                </div>
                <SourceBadge
                  source={pagesDs.provenance.source}
                  mode={pagesDs.provenance.mode}
                  freshness={pagesDs.provenance.freshness}
                />
              </div>
              <DataTable
                rows={pagesDs.data}
                columns={pageCols}
                searchKeys={(r) => r.key}
                searchPlaceholder="Search pages…"
                onRowClick={setSelected}
                exportName={`${domain.id}-gsc-pages`}
                pageSize={12}
              />
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* --------------------------- Content decay ----------------------- */}
            <Card>
              <CardHeader
                title="Content decay"
                subtitle="Measured click decline vs previous 28 days"
              />
              <div className="p-4">
                {!moversDs ? (
                  <EmptyState
                    title="No data yet"
                    description="Page movers populate on the next scheduled sync."
                    icon={<TrendingDown className="h-5 w-5" />}
                  />
                ) : losses && losses.length === 0 ? (
                  <EmptyState
                    title="No declining pages detected"
                    description="No page lost clicks versus the previous 28-day window."
                    icon={<TrendingDown className="h-5 w-5" />}
                  />
                ) : (
                  losses && <MoverList movers={losses} tone="critical" />
                )}
              </div>
            </Card>

            {/* --------------------------- Rising pages ------------------------ */}
            <Card>
              <CardHeader
                title="Rising pages"
                subtitle="Measured click growth vs previous 28 days"
              />
              <div className="p-4">
                {!moversDs ? (
                  <EmptyState
                    title="No data yet"
                    description="Page movers populate on the next scheduled sync."
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                ) : gains && gains.length === 0 ? (
                  <EmptyState
                    title="No rising pages detected"
                    description="No page gained clicks versus the previous 28-day window."
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                ) : (
                  gains && <MoverList movers={gains} tone="success" />
                )}
              </div>
            </Card>
          </div>

          {/* ---------------------- GA4 landing performance --------------------- */}
          {!ga4Mapped ? (
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 shrink-0 text-muted" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">GA4 landing performance</h3>
                  <p className="mt-0.5 text-2xs text-muted">
                    No GA4 property is connected for this domain.
                  </p>
                </div>
              </div>
            </Card>
          ) : !ga4LandingDs ? (
            <EmptyState
              title="GA4 landing pages not yet synced"
              description="No data for this domain in the current window — refreshes on the next scheduled sync or a manual pull."
              icon={<BarChart3 className="h-5 w-5" />}
            />
          ) : (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">GA4 landing performance</h3>
                  <p className="mt-0.5 text-2xs text-muted">
                    Organic landing pages from Google Analytics 4 — sessions, engagement and
                    conversions.
                  </p>
                </div>
                <SourceBadge
                  source={ga4LandingDs.provenance.source}
                  mode={ga4LandingDs.provenance.mode}
                  freshness={ga4LandingDs.provenance.freshness}
                />
              </div>
              <DataTable
                rows={ga4LandingDs.data}
                columns={ga4Cols}
                searchKeys={(r) => r.landingPage}
                searchPlaceholder="Search landing pages…"
                exportName={`${domain.id}-ga4-landing-pages`}
                pageSize={12}
              />
            </Card>
          )}
        </>
      )}

      {/* ----------------------------- Page drawer --------------------------- */}
      <Drawer
        open={selected != null}
        onClose={() => setSelected(null)}
        title="Page detail"
        subtitle={selected ? displayPath(selected.key) : undefined}
        width="max-w-xl"
      >
        {selected && (
          <div>
            <DrawerField label="URL">
              <a
                href={selected.key}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all font-mono text-xs text-[color:var(--accent)] hover:underline"
              >
                {selected.key}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            </DrawerField>

            <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border border-border bg-workspace/50 p-3">
              <div>
                <div className="text-2xs text-muted">Clicks (28d)</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {fullNumber(selected.clicks)}
                </div>
              </div>
              <div>
                <div className="text-2xs text-muted">Impressions (28d)</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {fullNumber(selected.impressions)}
                </div>
              </div>
              <div>
                <div className="text-2xs text-muted">CTR</div>
                <div className="text-sm font-semibold text-ink tnum">{percent(selected.ctr)}</div>
              </div>
              <div>
                <div className="text-2xs text-muted">Avg position</div>
                <div className="text-sm font-semibold text-ink tnum">
                  {selected.position.toFixed(1)}
                </div>
              </div>
            </div>

            {selectedMover && (
              <DrawerField
                label={selectedMover.direction === "gain" ? "Click growth" : "Click decline"}
              >
                <span className="tnum">
                  {fullNumber(selectedMover.mover.clicksBefore)} →{" "}
                  {fullNumber(selectedMover.mover.clicksNow)}{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      selectedMover.direction === "gain" ? "text-success" : "text-critical",
                    )}
                  >
                    ({selectedMover.mover.change > 0 ? "+" : ""}
                    {fullNumber(selectedMover.mover.change)})
                  </span>
                </span>
                <p className="mt-1 text-2xs text-muted">vs previous 28 days</p>
              </DrawerField>
            )}

            <p className="mt-3 text-2xs text-muted">
              Metrics are measured Search Console data for the last 28 days.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
