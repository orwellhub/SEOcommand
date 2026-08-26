import type { DomainId, Provenance } from "@/lib/types";
import type { DerivedRecommendation } from "@/lib/live";
import { getManagedSite, listManagedSites, paidJobsApproved } from "@/platform/site-store";
import {
  detectTrafficDrop,
  persistAiCrawlerAudit,
  persistAiObservations,
  persistAiPromptOpportunities,
  persistBacklinkLedger,
  persistDailyRankings,
  persistDetailedCrawl,
  persistKeywordGaps,
  seedTrackedKeywords,
} from "@/platform/observations";
import { auditAiCrawlerAccess } from "@/platform/ai-crawler-audit";
import { discoverAiPromptOpportunities } from "@/platform/ai-opportunities";
import { refreshKeywordStrategy } from "@/platform/keyword-strategy";
import type { Competitor, GscRow, Keyword } from "@/lib/types";
import { googleConfigured } from "@/providers/google/auth";
import {
  gscBreakdown,
  gscMovers,
  gscStrikingDistance,
  gscTimeseries,
  gscTotals,
  gscQueryPages,
  shareOfMarket,
} from "@/providers/google/gsc";
import { ga4Channels, ga4LandingPages, ga4OrganicOverview } from "@/providers/google/ga4";
import {
  dataForSeoConfigured,
  ensureOnPageCrawl,
  fetchAiPromptResults,
  fetchBacklinkHistory,
  fetchBacklinks,
  fetchCompetitors,
  fetchDomainOverviewBundle,
  fetchDailyTrackedRankings,
  fetchKeywordGap,
  fetchRankedKeywordsBundle,
  fetchReferringDomains,
} from "@/providers/dataforseo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { locationForSite } from "@/providers/dataforseo/config";
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

/**
 * Which cost tiers to run this sync:
 *  - google   : GSC + GA4 (FREE) — safe to run daily
 *  - dfsLight : DataForSEO keywords, rankings, competitors, backlinks (PAID) — weekly
 *  - dfsHeavy : DataForSEO OnPage crawls (PAID, priciest) — monthly
 *  - ai       : due AI prompts + crawler access checks — daily scheduler, prompt-level cadence
 * Pending OnPage crawls are always polled (free) regardless of dfsHeavy, so a
 * crawl started in a monthly run finishes on later free runs.
 */
export interface SyncTiers {
  google: boolean;
  rankings: boolean;
  dfsLight: boolean;
  dfsHeavy: boolean;
  ai: boolean;
}

export const ALL_TIERS: SyncTiers = { google: true, rankings: true, dfsLight: true, dfsHeavy: true, ai: true };

export async function syncDomain(
  domainId: DomainId,
  tiers: SyncTiers = ALL_TIERS,
): Promise<DomainSyncReport> {
  const startedAt = new Date().toISOString();
  const domain = await getManagedSite(domainId);
  if (!domain) throw new Error(`Unknown website "${domainId}".`);
  const today = isoDate(new Date());
  const results: DatasetResult[] = [];
  const existing = await readLatestSnapshots(domainId).catch(() => []);
  const existingByDataset = new Map(existing.map((s) => [s.dataset, s]));

  const approved = paidJobsApproved(domain);
  const dailyRankOk = dataForSeoConfigured() && tiers.rankings && approved;
  const dfsLightOk = dataForSeoConfigured() && tiers.dfsLight && approved;
  const dfsHeavyOk = dataForSeoConfigured() && tiers.dfsHeavy && approved;
  const aiOk = dataForSeoConfigured() && tiers.ai && approved;
  const dfsConfigured = dataForSeoConfigured();
  const googleOk = googleConfigured() && tiers.google;

  const write = (dataset: string, payload: unknown, provenance: Provenance) =>
    writeSnapshot(domainId, dataset, today, payload, provenance);

  /* ------------------------- DataForSEO datasets ------------------------- */

  let dfsLocation = "location-independent dataset";
  try {
    const location = locationForSite(domain);
    dfsLocation = `DataForSEO location ${location.location_code} / ${location.language_code}`;
  } catch {
    // Backlink datasets remain valid without a SERP market. Location-dependent
    // collectors call locationFor themselves and surface the configuration error.
  }
  const dfsProv = () => prov("dataforseo", dfsLocation);
  let aiCompetitors = ((existingByDataset.get("competitors")?.payload ?? []) as Competitor[])
    .map((item) => ({ host: item.host }));

  const collectors: Collector[] = [
    () =>
      collect("keywords", async () => {
        if (!dfsLightOk) return "skip";
        const { keywords, rankSnapshots } = await fetchRankedKeywordsBundle(domainId);
        const planned = Number(domain.forecast?.assumptions.trackedKeywords ?? 100);
        await seedTrackedKeywords(domain, keywords, planned);
        const p = dfsProv();
        await write("keywords", keywords, p);
        await write("rank_snapshots", rankSnapshots, p);
        return { payload: keywords, provenance: p };
      }),
    () =>
      collect("daily_rankings", async () => {
        if (!dailyRankOk) return "skip";
        const rankings = await fetchDailyTrackedRankings(domainId);
        if (!rankings.length) return "skip";
        await persistDailyRankings(domain, rankings);
        const p = dfsProv();
        const snapshots = rankings.map((row) => ({
          keywordId: row.trackedKeywordId,
          keyword: row.keyword,
          date: today,
          position: row.position ?? 101,
          prevPosition: row.previousPosition ?? row.position ?? 101,
          device: row.device,
          location: String(row.locationCode),
          url: row.url ?? "",
          volume: 0,
          serpFeatures: row.serpFeatures,
          tags: [],
        }));
        await write("rank_snapshots", snapshots, p);
        return { payload: snapshots, provenance: p };
      }),
    () =>
      collect("position_buckets", async () => {
        if (!dfsLightOk) return "skip";
        const { visibility, buckets } = await fetchDomainOverviewBundle(domainId);
        const p = dfsProv();
        await write("position_buckets", buckets, p);
        await write("visibility_point", { date: today, value: visibility }, p);
        return { payload: buckets, provenance: p };
      }),
    () =>
      collect("competitors", async () => {
        if (!dfsLightOk) return "skip";
        const data = await fetchCompetitors(domainId);
        aiCompetitors = data.map((item) => ({ host: item.host }));
        const p = dfsProv();
        await write("competitors", data, p);
        const gaps = (await Promise.all(data.slice(0, 3).map((competitor) => fetchKeywordGap(domainId, competitor.host, 500)))).flat();
        await persistKeywordGaps(domain, gaps);
        await write("keyword_gaps", gaps, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("backlinks", async () => {
        if (!dfsLightOk) return "skip";
        const [data, history] = await Promise.all([
          fetchBacklinks(domainId),
          fetchBacklinkHistory(domainId),
        ]);
        await persistBacklinkLedger(domain, data, history);
        const p = dfsProv();
        await write("backlinks", data, p);
        await write("backlink_history", history, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("referring_domains", async () => {
        if (!dfsLightOk) return "skip";
        const data = await fetchReferringDomains(domainId);
        const p = dfsProv();
        await write("referring_domains", data, p);
        return { payload: data, provenance: p };
      }),
    () =>
      collect("onpage", async () => {
        // Run whenever DataForSEO is configured so pending crawls keep polling
        // (free); only INITIATE a new crawl on the heavy (monthly) tier.
        if (!dfsConfigured) return "skip";
        const wantCrawl = dfsHeavyOk;
        // A finished crawl leaves onpage_task = { taskId: null }; only a real id
        // means "still polling". Check the id, not the row's mere presence.
        const pendingTaskId =
          (existingByDataset.get("onpage_task")?.payload as { taskId: string | null } | undefined)
            ?.taskId ?? null;
        if (!wantCrawl && !pendingTaskId) return "skip";
        const res = await ensureOnPageCrawl(domainId, pendingTaskId);
        const p = dfsProv();
        if (res.status === "pending") {
          await write("onpage_task", { taskId: res.taskId }, p);
          return "pending";
        }
        await write("onpage", res.result, p);
        await persistDetailedCrawl(domain, res.taskId, res.result, res.pages);
        await write("onpage_task", { taskId: null }, p);
        return { payload: res.result, provenance: p };
      }),
    () =>
      collect("ai_prompts", async () => {
        if (!aiOk) return "skip";
        const run = await fetchAiPromptResults(domainId, aiCompetitors);
        if (!run) return "skip";
        await persistAiObservations(domain, run.observations);
        const opportunities = discoverAiPromptOpportunities({
          gscQueries: (existingByDataset.get("gsc_queries")?.payload ?? []) as GscRow[],
          keywords: (existingByDataset.get("keywords")?.payload ?? []) as Keyword[],
          fanOutQueries: run.observations.flatMap((item) => item.fanOutQueries),
        });
        await persistAiPromptOpportunities(domainId, opportunities);
        const p = dfsProv();
        await write("ai_prompts", run.prompts, p);
        await write("ai_visibility_meta", { skippedPlatforms: run.skippedPlatforms }, p);
        return { payload: run.prompts, provenance: p };
      }),
    () =>
      collect("ai_crawler_audit", async () => {
        if (!tiers.ai) return "skip";
        const data = await auditAiCrawlerAccess(domain);
        await persistAiCrawlerAudit(domainId, data);
        const p = prov("orwell-crawler", `robots.txt at ${domain.host}`);
        await write("ai_crawler_audit", data, p);
        return { payload: data, provenance: p };
      }),

    /* --------------------------- Google datasets ------------------------- */

    () =>
      collect("gsc_totals", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        const totals = await gscTotals(domainId, 28);
        await detectTrafficDrop(domain, totals, existingByDataset.get("gsc_totals")?.payload as Parameters<typeof detectTrafficDrop>[2]);
        await write("gsc_totals", totals, p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_timeseries", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite, 90);
        await write("gsc_timeseries", await gscTimeseries(domainId, 90), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_queries", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_queries", await gscBreakdown(domainId, "query", 28, 250), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_pages", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_pages", await gscBreakdown(domainId, "page", 28, 250), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_query_pages", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_query_pages", await gscQueryPages(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_movers", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_movers", await gscMovers(domainId, 28, 25, "query"), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("gsc_page_movers", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("gsc_page_movers", await gscMovers(domainId, 28, 25, "page"), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("striking_distance", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("striking_distance", await gscStrikingDistance(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("share_of_market", async () => {
        if (!googleOk || !domain.gscSite) return "skip";
        const data = await shareOfMarket(domainId, 28);
        if (!data) return "skip";
        const p = prov("google-search-console", domain.gscSite);
        await write("share_of_market", data, p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_overview", async () => {
        if (!googleOk || !domain.ga4PropertyId) return "skip";
        const p = prov("google-analytics", `GA4 ${domain.ga4PropertyId}`);
        await write("ga4_overview", await ga4OrganicOverview(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_landing_pages", async () => {
        if (!googleOk || !domain.ga4PropertyId) return "skip";
        const p = prov("google-analytics", `GA4 ${domain.ga4PropertyId}`);
        await write("ga4_landing_pages", await ga4LandingPages(domainId, 28, 50), p);
        return { payload: null, provenance: p };
      }),
    () =>
      collect("ga4_channels", async () => {
        if (!googleOk || !domain.ga4PropertyId) return "skip";
        const p = prov("google-analytics", `GA4 ${domain.ga4PropertyId}`);
        await write("ga4_channels", await ga4Channels(domainId, 28), p);
        return { payload: null, provenance: p };
      }),
  ];

  for (const c of collectors) {
    results.push(await c());
  }

  results.push(await collect("keyword_strategy", async () => {
    if (!tiers.google && !tiers.dfsLight) return "skip";
    const data = await refreshKeywordStrategy(domainId);
    return { payload: data, provenance: prov("orwell-crawler", "GSC + DataForSEO strategy model") };
  }));

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

  if (!(await getManagedSite(domainId))?.ga4PropertyId) {
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

/** Sync every domain in the registry with the given cost tiers. */
export async function syncAll(tiers: SyncTiers = ALL_TIERS): Promise<FullSyncReport> {
  const startedAt = new Date().toISOString();
  const sites = (await listManagedSites()).filter((site) => site.source === "registry" || site.lifecycleStatus === "active");
  const reports: DomainSyncReport[] = [];
  const concurrency = Math.min(Math.max(Number(process.env.SYNC_CONCURRENCY ?? "2"), 1), 10);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, sites.length) }, async () => {
    while (cursor < sites.length) {
      const site = sites[cursor++];
      if (site) reports.push(await syncDomain(site.id, tiers));
    }
  }));
  return { startedAt, completedAt: new Date().toISOString(), domains: reports };
}

/**
 * Resolve the tiers for a scheduled run from the current UTC date, implementing
 * the split-cadence policy: Google, rankings and due AI prompts every day;
 * DataForSEO light weekly (Mondays); crawls monthly (1st).
 */
export function scheduledTiers(now: Date): SyncTiers {
  const isMonday = now.getUTCDay() === 1;
  const isFirstOfMonth = now.getUTCDate() === 1;
  const dfsHeavy = process.env.SYNC_DFS_HEAVY === "1" || isFirstOfMonth;
  return {
    google: process.env.SYNC_GOOGLE !== "0", // free — on by default every day
    rankings: process.env.SYNC_RANKINGS !== "0",
    dfsLight: process.env.SYNC_DFS_LIGHT === "1" || isMonday || dfsHeavy,
    dfsHeavy,
    ai: process.env.SYNC_AI !== "0",
  };
}
