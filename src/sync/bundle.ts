import type {
  Backlink,
  Ga4Overview,
  GscTotals,
  Keyword,
  RankSnapshot,
  ReferringDomain,
} from "@/lib/types";
import type { DomainHeadline, DomainLiveBundle, OnPageResult, PortfolioLive } from "@/lib/live";
import { listManagedSites } from "@/platform/site-store";
import { computeAuthorityScore } from "@/lib/scoring";
import {
  hasDatabase,
  readLatestForDomains,
  readLatestSnapshots,
  readSnapshotHistory,
  type StoredSnapshot,
} from "./store";
import { aggregateBundles, PORTFOLIO_SCOPE_ID } from "./aggregate";

/**
 * Assembles API read-models from stored snapshots. Pure reads — no provider
 * calls, no spend. Missing datasets simply stay absent from the bundle and the
 * UI renders an honest "awaiting first sync" state.
 */

function attach(bundle: DomainLiveBundle, snaps: StoredSnapshot[]): void {
  let last: string | null = null;
  for (const s of snaps) {
    if (s.dataset === "onpage_task" || s.dataset === "visibility_point") continue;
    (bundle.datasets as Record<string, unknown>)[s.dataset] = {
      data: s.payload,
      capturedOn: s.capturedOn,
      provenance: s.provenance,
    };
    const collected = s.provenance?.collectedAt ?? s.capturedOn;
    if (!last || collected > last) last = collected;
  }
  bundle.lastSync = last;
}

export async function buildDomainBundle(domainId: string): Promise<DomainLiveBundle> {
  const bundle: DomainLiveBundle = { domainId, lastSync: null, datasets: {} };
  if (!hasDatabase()) return bundle;

  const snaps = await readLatestSnapshots(domainId);
  attach(bundle, snaps);

  // Visibility history accumulates one point per sync day.
  const visHistory = await readSnapshotHistory(domainId, "visibility_point");
  if (visHistory.length > 0) {
    const latest = visHistory[visHistory.length - 1]!;
    bundle.datasets.visibility_series = {
      data: visHistory.map((v) => v.payload as { date: string; value: number }),
      capturedOn: latest.capturedOn,
      provenance: latest.provenance,
    };
  }
  return bundle;
}

/**
 * Portfolio-wide bundle: every domain's latest snapshots merged into one bundle
 * shaped like a single-domain bundle. Snapshots are read in ONE batched query
 * rather than a per-domain round-trip.
 */
export async function buildAggregateBundle(): Promise<DomainLiveBundle> {
  if (!hasDatabase()) {
    return { domainId: PORTFOLIO_SCOPE_ID, lastSync: null, datasets: {} };
  }
  const sites = await listManagedSites();
  const map = await readLatestForDomains(sites.map((d) => d.id));
  const bundles: DomainLiveBundle[] = [];
  for (const d of sites) {
    const snaps = map.get(d.id);
    if (!snaps || snaps.length === 0) continue;
    const bundle: DomainLiveBundle = { domainId: d.id, lastSync: null, datasets: {} };
    attach(bundle, snaps);
    bundles.push(bundle);
  }
  return aggregateBundles(bundles);
}

function headlineFrom(domainId: string, snaps: StoredSnapshot[], ga4Mapped = false): DomainHeadline {
  const by = new Map(snaps.map((s) => [s.dataset, s]));
  const gsc = by.get("gsc_totals")?.payload as GscTotals | undefined;
  const ga4 = by.get("ga4_overview")?.payload as Ga4Overview | undefined;
  const onpage = by.get("onpage")?.payload as OnPageResult | undefined;
  const keywords = by.get("keywords")?.payload as Keyword[] | undefined;
  const snapshots = by.get("rank_snapshots")?.payload as RankSnapshot[] | undefined;
  const backlinks = by.get("backlinks")?.payload as Backlink[] | undefined;
  const referring = by.get("referring_domains")?.payload as ReferringDomain[] | undefined;
  const visPoint = by.get("visibility_point")?.payload as { value: number } | undefined;
  const ai = by.get("ai_prompts")?.payload as { mentionRate: number }[] | undefined;

  let last: string | null = null;
  for (const s of snaps) {
    const collected = s.provenance?.collectedAt ?? s.capturedOn;
    if (!last || collected > last) last = collected;
  }

  const visibility = visPoint?.value ?? null;
  return {
    domainId,
    lastSync: last,
    clicks28d: gsc?.clicks ?? null,
    impressions28d: gsc?.impressions ?? null,
    avgPosition: gsc?.position ?? null,
    sessions28d: ga4?.sessions ?? null,
    conversions28d: ga4?.conversions ?? null,
    visibility,
    health: onpage ? onpage.healthScore : null,
    authority:
      backlinks && referring
        ? computeAuthorityScore(referring, backlinks, visibility ?? 0)
        : null,
    keywordsTracked: keywords?.length ?? null,
    top10: snapshots ? snapshots.filter((s) => s.position <= 10).length : null,
    referringDomains: referring?.length ?? null,
    criticalIssues: onpage
      ? onpage.issues.filter((i) => i.severity === "critical" || i.severity === "high").length
      : null,
    aiMentionRate:
      ai && ai.length
        ? Math.round(ai.reduce((s, p) => s + p.mentionRate, 0) / ai.length)
        : null,
    ga4Mapped,
  };
}

export async function buildPortfolio(): Promise<PortfolioLive> {
  const sites = await listManagedSites();
  const empty: PortfolioLive = {
    generatedAt: new Date().toISOString(),
    domains: sites.map((d) => headlineFrom(d.id, [], Boolean(d.ga4PropertyId))),
    totals: {
      clicks28d: 0,
      impressions28d: 0,
      sessions28d: 0,
      conversions28d: 0,
      avgHealth: null,
      avgVisibility: null,
      criticalIssues: 0,
      referringDomains: 0,
      domainsSynced: 0,
    },
  };
  if (!hasDatabase()) return empty;

  const map = await readLatestForDomains(sites.map((d) => d.id));
  const domains = sites.map((d) => headlineFrom(d.id, map.get(d.id) ?? [], Boolean(d.ga4PropertyId)));

  const synced = domains.filter((d) => d.lastSync != null);
  const healths = domains.map((d) => d.health).filter((h): h is number => h != null);
  const vis = domains.map((d) => d.visibility).filter((v): v is number => v != null);

  return {
    generatedAt: new Date().toISOString(),
    domains,
    totals: {
      clicks28d: domains.reduce((s, d) => s + (d.clicks28d ?? 0), 0),
      impressions28d: domains.reduce((s, d) => s + (d.impressions28d ?? 0), 0),
      sessions28d: domains.reduce((s, d) => s + (d.sessions28d ?? 0), 0),
      conversions28d: domains.reduce((s, d) => s + (d.conversions28d ?? 0), 0),
      avgHealth: healths.length
        ? Math.round(healths.reduce((s, h) => s + h, 0) / healths.length)
        : null,
      avgVisibility: vis.length ? Math.round(vis.reduce((s, v) => s + v, 0) / vis.length) : null,
      criticalIssues: domains.reduce((s, d) => s + (d.criticalIssues ?? 0), 0),
      referringDomains: domains.reduce((s, d) => s + (d.referringDomains ?? 0), 0),
      domainsSynced: synced.length,
    },
  };
}
