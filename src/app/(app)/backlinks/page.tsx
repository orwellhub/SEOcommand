"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Link2, Network, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardHeader,
  StatusBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { BarSeries } from "@/components/charts/charts";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { computeAuthorityScore } from "@/lib/scoring";
import { fullNumber, percent } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Backlink, ReferringDomain } from "@/lib/types";

type SubTab = "backlinks" | "referring" | "anchors" | "risk";

interface AnchorRow {
  anchor: string;
  count: number;
  share: number;
}

interface ScoreComponent {
  label: string;
  weight: number;
  value: number;
  penalty: boolean;
}

const TABS: { key: SubTab; label: string }[] = [
  { key: "backlinks", label: "Backlinks" },
  { key: "referring", label: "Referring domains" },
  { key: "anchors", label: "Anchors" },
  { key: "risk", label: "Risk review" },
];

const AWAITING_SYNC = "No backlink data for this domain yet";

/** Tone classes for a 0–100 toxicity (spam score) value. */
function toxClass(t: number): string {
  if (t > 50) return "text-critical";
  if (t > 25) return "text-[#B9791A]";
  return "text-success";
}
function toxBar(t: number): string {
  if (t > 50) return "bg-critical";
  if (t > 25) return "bg-warning";
  return "bg-success";
}

function followTone(follow: boolean): "success" | "neutral" {
  return follow ? "success" : "neutral";
}

/** Small inline toxicity meter used in tables and the drawer. */
function ToxicityMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-workspace">
        <div
          className={cn("h-full rounded-full", toxBar(value))}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className={cn("text-xs font-medium tnum", toxClass(value))}>{value}</span>
    </div>
  );
}

export default function BacklinksPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const { data: bundle, loading, error } = useLiveDomain(domain.id);

  const [tab, setTab] = useState<SubTab>("backlinks");
  const [selected, setSelected] = useState<Backlink | null>(null);

  const backlinks = bundle?.datasets.backlinks?.data ?? null;
  const referringDomains = bundle?.datasets.referring_domains?.data ?? null;
  const visibilitySeries = bundle?.datasets.visibility_series?.data ?? null;

  const latestVisibility = useMemo(() => {
    if (!visibilitySeries || visibilitySeries.length === 0) return 0;
    return visibilitySeries[visibilitySeries.length - 1]!.value;
  }, [visibilitySeries]);

  const hasLinkData = backlinks !== null && referringDomains !== null;

  const authorityScore = useMemo(
    () =>
      hasLinkData ? computeAuthorityScore(referringDomains!, backlinks!, latestVisibility) : null,
    [hasLinkData, referringDomains, backlinks, latestVisibility],
  );

  const followCount = useMemo(
    () => (backlinks ? backlinks.filter((b) => b.follow).length : null),
    [backlinks],
  );

  const riskLinks = useMemo<Backlink[]>(
    () =>
      backlinks
        ? backlinks.filter((b) => b.toxicity > 50).sort((a, b) => b.toxicity - a.toxicity)
        : [],
    [backlinks],
  );

  // Real status counts from the fetched sample — shown only when non-zero.
  const statusCounts = useMemo(() => {
    if (!backlinks) return { newCount: 0, lostCount: 0 };
    return {
      newCount: backlinks.filter((b) => b.status === "new").length,
      lostCount: backlinks.filter((b) => b.status === "lost").length,
    };
  }, [backlinks]);

  // The transparent score components, recomputed from the same live data as the score.
  const scoreComponents = useMemo<ScoreComponent[] | null>(() => {
    if (!hasLinkData) return null;
    const rd = referringDomains!;
    const bl = backlinks!;
    const avgAuthority = rd.length ? rd.reduce((s, r) => s + r.authority, 0) / rd.length : 0;
    const avgRelevance = rd.length ? rd.reduce((s, r) => s + r.topicalRelevance, 0) / rd.length : 0;
    const uniqueHosts = new Set(bl.map((b) => b.sourceDomain)).size;
    const diversity = Math.min(100, (uniqueHosts / 25) * 100);
    const avgToxicity = bl.length ? bl.reduce((s, b) => s + b.toxicity, 0) / bl.length : 0;
    return [
      { label: "Referring-domain authority", weight: 35, value: Math.round(avgAuthority), penalty: false },
      { label: "Topical relevance", weight: 20, value: Math.round(avgRelevance), penalty: false },
      { label: "Link diversity", weight: 15, value: Math.round(diversity), penalty: false },
      { label: "Organic visibility", weight: 20, value: Math.round(latestVisibility), penalty: false },
      { label: "Toxic-link risk penalty", weight: 10, value: Math.round(avgToxicity), penalty: true },
    ];
  }, [hasLinkData, referringDomains, backlinks, latestVisibility]);

  // Authority distribution — referring domains bucketed by authority band.
  const authorityBands = useMemo(() => {
    if (!referringDomains) return null;
    const bands = [
      { band: "0–20", min: 0, max: 20 },
      { band: "21–40", min: 21, max: 40 },
      { band: "41–60", min: 41, max: 60 },
      { band: "61–80", min: 61, max: 80 },
      { band: "81–100", min: 81, max: 100 },
    ];
    return bands.map((b) => ({
      band: b.band,
      count: referringDomains.filter((r) => r.authority >= b.min && r.authority <= b.max).length,
    }));
  }, [referringDomains]);

  const anchorRows = useMemo<AnchorRow[]>(() => {
    if (!backlinks || backlinks.length === 0) return [];
    const total = backlinks.length;
    const map = new Map<string, number>();
    for (const b of backlinks) map.set(b.anchor, (map.get(b.anchor) ?? 0) + 1);
    return [...map.entries()]
      .map(([anchor, count]) => ({ anchor, count, share: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [backlinks]);

  const backlinkCols = useMemo<Column<Backlink>[]>(
    () => [
      {
        key: "sourceDomain",
        header: "Source domain",
        sortValue: (r) => r.sourceDomain,
        render: (r) => <span className="font-medium text-ink">{r.sourceDomain}</span>,
      },
      {
        key: "targetUrl",
        header: "Target",
        sortValue: (r) => r.targetUrl,
        render: (r) => (
          <span className="block max-w-[200px] truncate text-muted" title={r.targetUrl}>
            {r.targetUrl.replace(/^https?:\/\//, "")}
          </span>
        ),
      },
      {
        key: "anchor",
        header: "Anchor",
        sortValue: (r) => r.anchor,
        render: (r) => <span className="block max-w-[140px] truncate">{r.anchor}</span>,
      },
      {
        key: "authority",
        header: "Authority",
        align: "right",
        sortValue: (r) => r.authority,
        render: (r) => r.authority,
      },
      {
        key: "follow",
        header: "Link",
        sortValue: (r) => (r.follow ? "follow" : "nofollow"),
        render: (r) => (
          <StatusBadge label={r.follow ? "follow" : "nofollow"} tone={followTone(r.follow)} />
        ),
      },
      {
        key: "toxicity",
        header: "Toxicity",
        align: "right",
        sortValue: (r) => r.toxicity,
        render: (r) => <span className={cn("font-medium tnum", toxClass(r.toxicity))}>{r.toxicity}</span>,
      },
      {
        key: "lastSeen",
        header: "Last seen",
        align: "right",
        width: "128px",
        sortValue: (r) => r.lastSeen,
        render: (r) => formatDate(r.lastSeen),
      },
    ],
    [],
  );

  const referringCols = useMemo<Column<ReferringDomain>[]>(
    () => [
      {
        key: "host",
        header: "Host",
        sortValue: (r) => r.host,
        render: (r) => <span className="font-medium text-ink">{r.host}</span>,
      },
      {
        key: "authority",
        header: "Authority",
        align: "right",
        sortValue: (r) => r.authority,
        render: (r) => r.authority,
      },
      {
        key: "backlinks",
        header: "Backlinks",
        align: "right",
        sortValue: (r) => r.backlinks,
        render: (r) => fullNumber(r.backlinks),
      },
      {
        key: "topicalRelevance",
        header: "Relevance",
        align: "right",
        sortValue: (r) => r.topicalRelevance,
        render: (r) => (
          <span className={r.topicalRelevance >= 60 ? "text-success" : "text-muted"}>
            {r.topicalRelevance}
          </span>
        ),
      },
      {
        key: "firstSeen",
        header: "First seen",
        align: "right",
        width: "128px",
        sortValue: (r) => r.firstSeen,
        render: (r) => formatDate(r.firstSeen),
      },
    ],
    [],
  );

  const anchorCols = useMemo<Column<AnchorRow>[]>(
    () => [
      {
        key: "anchor",
        header: "Anchor text",
        sortValue: (r) => r.anchor,
        render: (r) => <span className="font-medium text-ink">{r.anchor}</span>,
      },
      {
        key: "count",
        header: "Backlinks",
        align: "right",
        sortValue: (r) => r.count,
        render: (r) => r.count,
      },
      {
        key: "share",
        header: "Share",
        align: "right",
        sortValue: (r) => r.share,
        render: (r) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-workspace">
              <div
                className="h-full rounded-full bg-[color:var(--accent)]"
                style={{ width: `${Math.min(100, r.share)}%` }}
              />
            </div>
            <span className="tnum">{percent(r.share)}</span>
          </div>
        ),
      },
    ],
    [],
  );

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Backlinks & Authority"
          description="Referring-domain quality and toxic-link risk, scored with the transparent Orwell Authority Score."
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-72 xl:col-span-2" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Backlinks & Authority"
          description="Referring-domain quality and toxic-link risk, scored with the transparent Orwell Authority Score."
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title="Backlinks & Authority"
        description="Referring-domain quality and toxic-link risk, scored with the transparent Orwell Authority Score."
        lastSync={bundle?.lastSync ?? null}
        loading={loading}
      />

      {scope === "portfolio" && (
        <p className="-mt-2 text-2xs text-muted">
          Showing <span className="font-medium text-ink">{domain.name}</span> — data follows the domain
          rail selection.
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Orwell Authority Score"
          value={authorityScore !== null ? String(authorityScore) : "—"}
          accent
          hint="Transparent 0–100 composite"
        />
        <KpiCard
          label="Total backlinks"
          value={backlinks ? fullNumber(backlinks.length) : "—"}
          hint="Fetched sample, up to 250 links"
        />
        <KpiCard
          label="Referring domains"
          value={referringDomains ? fullNumber(referringDomains.length) : "—"}
          hint="Unique linking hosts"
        />
        <KpiCard
          label="Follow links"
          value={followCount !== null ? fullNumber(followCount) : "—"}
          hint="Within the fetched sample"
        />
        <KpiCard
          label="High-spam links"
          value={backlinks ? fullNumber(riskLinks.length) : "—"}
          hint="Toxicity above 50"
        />
      </div>

      {/* Score explainer + authority distribution */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Orwell Authority Score — how it is built"
            subtitle="An original, transparent composite — NOT a copy of any vendor score"
          />
          <div className="p-4">
            <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted">
              A transparent 0–100 composite computed from live link data. Components:
              referring-domain authority (35%), topical relevance (20%), link diversity (15%),
              organic visibility (20%), minus a toxic-link risk penalty (10%). Full method in{" "}
              <span className="font-medium text-ink">docs/scoring-methodology.md</span>.
            </p>
            {scoreComponents ? (
              <div className="space-y-3">
                {scoreComponents.map((c) => (
                  <div key={c.label}>
                    <div className="mb-1 flex items-center justify-between text-2xs">
                      <span className="font-medium text-ink">
                        {c.label}
                        {c.penalty && <span className="ml-1 text-critical">(subtractive)</span>}
                      </span>
                      <span className="text-muted tnum">
                        {c.value} · {c.weight}% weight
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-workspace">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          c.penalty ? "bg-critical/70" : "bg-[color:var(--accent)]",
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, c.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={AWAITING_SYNC}
                description="Score components are computed once backlink and referring-domain data have synced."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Authority distribution" subtitle="Referring domains by authority band" />
          <div className="px-3 pb-3 pt-4">
            {authorityBands ? (
              <BarSeries data={authorityBands} xKey="band" yKey="count" height={220} />
            ) : (
              <EmptyState
                title={AWAITING_SYNC}
                description="Referring-domain data populates on the next scheduled sync."
              />
            )}
          </div>
        </Card>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-workspace p-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "backlinks" && (
        <Card className="p-4">
          {(statusCounts.newCount > 0 || statusCounts.lostCount > 0) && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {statusCounts.newCount > 0 && (
                <StatusBadge label={`${statusCounts.newCount} new`} tone="info" />
              )}
              {statusCounts.lostCount > 0 && (
                <StatusBadge label={`${statusCounts.lostCount} lost`} tone="critical" />
              )}
              <span className="text-2xs text-muted">Link status within the fetched sample.</span>
            </div>
          )}
          {backlinks ? (
            <DataTable
              rows={backlinks}
              columns={backlinkCols}
              searchKeys={(r) => `${r.sourceDomain} ${r.anchor} ${r.targetUrl}`}
              searchPlaceholder="Search backlinks…"
              onRowClick={setSelected}
              exportName={`backlinks-${domain.id}`}
              pageSize={12}
            />
          ) : (
            <EmptyState
              title={AWAITING_SYNC}
              description="Backlink data populates on the next scheduled sync."
            />
          )}
        </Card>
      )}

      {tab === "referring" && (
        <Card className="p-4">
          {referringDomains ? (
            <DataTable
              rows={referringDomains}
              columns={referringCols}
              searchKeys={(r) => r.host}
              searchPlaceholder="Search referring domains…"
              exportName={`referring-domains-${domain.id}`}
              pageSize={12}
            />
          ) : (
            <EmptyState
              title={AWAITING_SYNC}
              description="Referring-domain data populates on the next scheduled sync."
            />
          )}
        </Card>
      )}

      {tab === "anchors" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-semibold text-ink">Anchor text distribution</h3>
            <span className="text-2xs text-muted">Aggregated from the fetched backlink sample.</span>
          </div>
          {!backlinks ? (
            <EmptyState
              title={AWAITING_SYNC}
              description="Anchor distribution is aggregated once backlink data has synced."
            />
          ) : anchorRows.length === 0 ? (
            <EmptyState
              title="No anchors to aggregate"
              description="No backlinks are available in the fetched sample."
            />
          ) : (
            <DataTable
              rows={anchorRows}
              columns={anchorCols}
              searchKeys={(r) => r.anchor}
              searchPlaceholder="Search anchors…"
              exportName={`anchor-distribution-${domain.id}`}
              pageSize={12}
            />
          )}
        </Card>
      )}

      {tab === "risk" && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-critical" />
            <h3 className="text-sm font-semibold text-ink">Toxic-link risk review</h3>
            <span className="text-2xs text-muted">
              Backlinks with toxicity above 50 — candidates for a disavow review.
            </span>
          </div>
          {!backlinks ? (
            <EmptyState
              title={AWAITING_SYNC}
              description="Risk review runs once backlink data has synced."
            />
          ) : riskLinks.length === 0 ? (
            <EmptyState
              title="No high-risk links detected"
              description="No links in the fetched sample exceed the toxicity threshold of 50."
              icon={<ShieldAlert className="h-5 w-5" />}
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {riskLinks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-workspace/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{b.sourceDomain}</div>
                    <div className="truncate text-2xs text-muted">
                      {b.anchor} · {b.follow ? "follow" : "nofollow"} · review recommended
                    </div>
                  </div>
                  <ToxicityMeter value={b.toxicity} />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Backlink detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.sourceDomain ?? ""}
        subtitle={selected ? `Backlink to ${domain.name}` : undefined}
      >
        {selected && (
          <div>
            <div className="mb-3 rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/5 p-3">
              <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-[color:var(--accent)]">
                <Link2 className="h-3.5 w-3.5" /> Target page
              </div>
              <a
                href={selected.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-medium text-ink hover:underline"
              >
                {selected.targetUrl}
              </a>
            </div>

            <dl className="divide-y divide-border">
              <DrawerField label="Source page">
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-purple hover:underline"
                >
                  {selected.sourceUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </DrawerField>
              <DrawerField label="Anchor text">{selected.anchor}</DrawerField>
              <DrawerField label="Source authority">
                <span className="tnum">{selected.authority}</span> / 100
              </DrawerField>
              <DrawerField label="Link type">
                <StatusBadge
                  label={selected.follow ? "follow" : "nofollow"}
                  tone={followTone(selected.follow)}
                />
              </DrawerField>
              <DrawerField label="Toxicity risk">
                <ToxicityMeter value={selected.toxicity} />
                {selected.toxicity > 50 && (
                  <p className="mt-1 text-2xs text-critical">Above threshold — review for disavow.</p>
                )}
              </DrawerField>
              <DrawerField label="First seen">{formatDate(selected.firstSeen)}</DrawerField>
              <DrawerField label="Last seen">{formatDate(selected.lastSeen)}</DrawerField>
            </dl>
          </div>
        )}
      </Drawer>
    </div>
  );
}
