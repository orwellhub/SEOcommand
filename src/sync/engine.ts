import type { DomainId, Provenance } from "@/lib/types";
import type { DerivedRecommendation } from "@/lib/live";
import { DOMAINS, DOMAIN_MAP } from "@/data/domains";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { GA4_PROPERTY_MAP } from "@/providers/google/config";
import { googleConfigured } from "@/providers/google/auth";
import {
  gscBreakdown,
  gscMovers,
  gscStrikingDistance,
  gscTimeseries,
  gscTotals,
  shareOfMarket,
} from "@/providers/google/gsc";
import { ga4Channels, ga4LandingPages, ga4OrganicOverview } from "@/providers/google/ga4";
import {
  dataForSeoConfigured,
  ensureOnPageCrawl,
  fetchAiPromptResults,
  fetchBacklinks,
  fetchCompetitors,
  fetchDomainOverviewBundle,
  fetchRankedKeywordsBundle,
  fetchReferringDomains,
} from "@/providers/dataforseo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { isoDate } from "@/lib/dates";
import { readLatestSnapshots, writeSnapshot } from "./store";

/**
 * The sync engine. Pulls live data from DataForSEO (external SEO intelligence)
 * and Google (first-party GSC/GA4) and writes canonical snapshots to the store.
 *
 * Idempotent per day (same-day re-runs upsert), observable (per-dataset status),
 * budget-guarded (every DataForSEO call passes the $200/month SpendGuard) and
 * resumable (OnPage crawls carry their task id across runs).
 */

export interface DatasetResult {
  dataset: string;
  status: "ok" | "skipped" | "pending" | "error";
  note?: string;
}

export interface DomainSyncReport {
  domainId: DomainId;
  results: DatasetResult[];
  startedAt: string;
  completedAt: string;
}

function prov(source: Provenance["source"], location: string, days = 28): Provenance {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return {
    source,
    collectedAt: now.toISOString(),
    rangeStart: isoDate(start),
    rangeEnd: isoDate(end),
    location,
    device: "desktop",
    freshness: "fresh",
    mode: "live",
  };
}

type Collector = () => Promise<DatasetResult>;

async function collect(
  dataset: string,
  fn: () => Promise<{ payload: unknown; provenance: Provenance } | "skip" | "pending">,
): Promise<DatasetResult> {
  try {
    const res = await fn();
    if (res === "skip") return { dataset, status: "skipped" };
    if (res === "pending") return { dataset, status: "pending", note: "crawl in progress" };
    return { dataset, status: "ok" };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return { dataset, status: "skipped", note: "monthly budget guardrail reached" };
    }
    if (err instanceof DailyLimitError) {
      return { dataset, status: "skipped", note: "DataForSEO daily limit (40203)" };
    }
    return {
      dataset,
      status: "error",
      note: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}

export async function syncDomain(
  domainId: DomainId,
  opts: { includeCrawl?: boolean; includeAi?: boolean } = {},
): Promise<DomainSyncReport> {
  const startedAt = new Date().toISOString();
  const domain = DOMAIN_MAP[domainId];
  const today = isoDate(new Date());
  const results: DatasetResult[] = [];
  const existing = await readLatestSnapshots(domainId).catch(() => []);
  const existingByDataset = new Map(existing.map((s) => [s.dataset, s]));

  const dfsOk = dataForSeoConfigured();
  const googleOk = googleConfigured();

  const write = (dataset: string, payload: unknown, provenance: Provenance) =>
    writeSnapshot(domainId, dataset, today, payload, provenance);

  /* ------------------------- DataForSEO datasets ------------------------- */

  const dfsProv = () => prov("dataforseo", domain.primaryMarket);

  const collectors: Collector[] = [
    () =>
      collect("keywords", async () => {
        if (!dfsOk) return "skip";
        const { keywords, rankSnapshots } = await fetchRankedKeywordsBundle(domainId);
        const p = dfsProv();
        await write("keywords", keywords, p);
        await write("rank_snapshots", rankSnapshots, p);
        return { payload: keywords, provenance: p };
      }),
    () =>
      collect("position_buckets", async () => {
        if (!dfsOk) return "skip";
        const { visibility, buckets } = await fetchDomainOverviewBundle(domainId);
        const p = dfsProv();
        await write("position_buckets", buckets, p);
        await write("visibility_point", { date: today, value: visibility }, p);
        return { payload: buckets, provenance: p };
      }),
    () =>
      collect("competitors", async () => {
        if (!dfsOk) return "skip";
        const data = await fetchCompetitors(domainId);
        const p = dfsProv();
        await write("competitors", data, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("backlinks", async () => {
        if (!dfsOk) return "skip";
        const data = await fetchBacklinks(domainId);
        const p = dfsProv();
        await write("backlinks", data, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("referring_domains", async () => {
        if (!dfsOk) return "skip";
        const data = await fetchReferringDomains(domainId);
        const p = dfsProv();
        await write("referring_domains", data, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("onpage", async () => {
        if (!dfsOk) return "skip";
        const wantCrawl = opts.includeCrawl ?? !existingByDataset.has("onpage");
        const pendingTask = existingByDataset.get("onpage_task")?.payload as
          | { taskId: string }
          | undefined;
        if (!wantCrawl && !pendingTask) return "skip";
        const res = await ensureOnPageCrawl(domainId, pendingTask?.taskId ?? null);
        const p = dfsProv();
        if (res.status === "pending") {
          await write("onpage_task", { taskId: res.taskId }, p);
          return "pending";
        }
        await write("onpage", res.result, p);
        await write("onpage_task", { taskId: null }, p);
        return { payload: res.result, provenance: p };
      }),
    () =>
      collect("ai_prompts", async () => {
        if (!dfsOk) return "skip";
        const wantAi = opts.includeAi ?? Boolean(TRACKED_AI_PROMPTS[domainId]);
        if (!wantAi) return "skip";
        const data = await fetchAiPromptResults(domainId);
        if (!data) return "skip";
        const p = dfsProv();
        await write("ai_prompts", data, p);
        return { payload: data, provenance: p };
      }),

    /* --------------------------- Google datasets ------------------------- */

    () =>
      collect("gsc_totals", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_totals", await gscTotals(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_timeseries", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite, 90);
        await write("gsc_timeseries", await gscTimeseries(domainId, 90), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_queries", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_queries", await gscBreakdown(domainId, "query", 28, 250), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_pages", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_pages", await gscBreakdown(domainId, "page", 28, 250), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_movers", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_movers", await gscMovers(domainId, 28, 25, "query"), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_page_movers", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_page_movers", await gscMovers(domainId, 28, 25, "page"), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("striking_distance", async () => {
        if (!googleOk) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("striking_distance", await gscStrikingDistance(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("share_of_market", async () => {
        if (!googleOk) return "skip";
        const data = await shareOfMarket(domainId, 28);
        if (!data) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("share_of_market", data, p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_overview", async () => {
        if (!googleOk || !GA4_PROPERTY_MAP[domainId]) return "skip";
        const p = prov("google-analytics", `GA4 ${GA4_PROPERTY_MAP[domainId]}`);
        await write("ga4_overview", await ga4OrganicOverview(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_landing_pages", async () => {
        if (!googleOk || !GA4_PROPERTY_MAP[domainId]) return "skip";
        const p = prov("google-analytics", `GA4 ${GA4_PROPERTY_MAP[domainId]}`);
        await write("ga4_landing_pages", await ga4LandingPages(domainId, 28, 50), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_channels", async () => {
        if (!googleOk || !GA4_PROPERTY_MAP[domainId]) return "skip";
        const p = prov("google-analytics", `GA4 ${GA4_PROPERTY_MAP[domainId]}`);
        await write("ga4_channels", await ga4Channels(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
  ];

  for (const c of collectors) {
    results.push(await c());
  }

  // Derived recommendations from what was just stored — real signals only.
  results.push(
    await collect("recommendations", async () => {
      const recs = await deriveRecommendations(domainId);
      const p = prov("google-search-console", domain.gscSite);
      await write("recommendations", recs, p);
      return { payload: recs, provenance: p };
    }),
  );

  return { domainId, results, startedAt, completedAt: new Date().toISOString() };
}

/** Recommendations derived from live stored signals. Labelled as derived. */
async function deriveRecommendations(domainId: DomainId): Promise<DerivedRecommendation[]> {
  const snaps = await readLatestSnapshots(domainId);
  const byDataset = new Map(snaps.map((s) => [s.dataset, s.payload]));
  const recs: DerivedRecommendation[] = [];
  let n = 0;

  const striking = (byDataset.get("striking_distance") ?? []) as {
    query: string;
    position: number;
    impressions: number;
  }[];
  if (striking.length > 0) {
    const top = striking.slice(0, 3);
    recs.push({
      id: `${domainId}-rec-${++n}`,
      domainId,
      title: `Push ${striking.length} striking-distance queries onto page one`,
      module: "Rankings",
      priorityScore: Math.min(95, 60 + striking.length),
      estImpact: `Top candidates: ${top.map((t) => `"${t.query}" (pos ${t.position}, ${t.impressions} impr.)`).join("; ")}`,
      confidence: "high",
      effort: "M",
      evidence: `Measured Search Console queries ranking 4–20 with real impression volume.`,
      relatedMetric: "Organic clicks",
    });
  }

  const losses = ((byDataset.get("gsc_movers") ?? {}) as { losses?: { key: string; change: number }[] })
    .losses ?? [];
  if (losses.length > 0) {
    recs.push({
      id: `${domainId}-rec-${++n}`,
      domainId,
      title: `Investigate ${losses.length} queries losing clicks period-over-period`,
      module: "Content",
      priorityScore: Math.min(90, 55 + losses.length),
      estImpact: `Biggest decay: ${losses.slice(0, 3).map((l) => `"${l.key}" (${l.change})`).join("; ")}`,
      confidence: "high",
      effort: "M",
      evidence: "Measured click decline vs the previous 28-day window (Search Console).",
      relatedMetric: "Organic clicks",
    });
  }

  const backlinks = (byDataset.get("backlinks") ?? []) as { toxicity: number; sourceDomain: string }[];
  const toxic = backlinks.filter((b) => b.toxicity > 50);
  if (toxic.length > 0) {
    recs.push({
      id: `${domainId}-rec-${++n}`,
      domainId,
      title: `Review ${toxic.length} high-spam-score backlinks`,
      module: "Backlinks",
      priorityScore: 50 + Math.min(30, toxic.length),
      estImpact: "Reduced link-risk profile",
      confidence: "medium",
      effort: "S",
      evidence: `Backlinks with spam score > 50 from: ${[...new Set(toxic.map((t) => t.sourceDomain))].slice(0, 5).join(", ")}`,
      relatedMetric: "Authority / risk",
    });
  }

  const onpage = byDataset.get("onpage") as
    | { issues?: { severity: string; title: string; affectedPages: number }[] }
    | undefined;
  const critical = (onpage?.issues ?? []).filter(
    (i) => i.severity === "critical" || i.severity === "high",
  );
  if (critical.length > 0) {
    recs.push({
      id: `${domainId}-rec-${++n}`,
      domainId,
      title: `Fix ${critical.length} high/critical technical issues from the latest crawl`,
      module: "Site Audit",
      priorityScore: 70 + Math.min(25, critical.length * 5),
      estImpact: critical.slice(0, 3).map((c) => `${c.title} (${c.affectedPages}p)`).join("; "),
      confidence: "high",
      effort: "M",
      evidence: "OnPage crawl check counts from the most recent completed crawl.",
      relatedMetric: "Site health",
    });
  }

  if (!GA4_PROPERTY_MAP[domainId]) {
    recs.push({
      id: `${domainId}-rec-${++n}`,
      domainId,
      title: "Create and connect a GA4 property to measure conversions",
      module: "Settings",
      priorityScore: 45,
      estImpact: "Unlocks sessions, engagement and conversion tracking",
      confidence: "high",
      effort: "S",
      evidence: "No GA4 property is mapped for this domain; GSC data is live but analytics are blind.",
      relatedMetric: "Conversions",
    });
  }

  return recs.sort((a, b) => b.priorityScore - a.priorityScore);
}

export interface FullSyncReport {
  startedAt: string;
  completedAt: string;
  domains: DomainSyncReport[];
}

/** Sync every domain in the registry. */
export async function syncAll(opts: { includeCrawl?: boolean } = {}): Promise<FullSyncReport> {
  const startedAt = new Date().toISOString();
  const reports: DomainSyncReport[] = [];
  for (const d of DOMAINS) {
    reports.push(await syncDomain(d.id, opts));
  }
  return { startedAt, completedAt: new Date().toISOString(), domains: reports };
}
