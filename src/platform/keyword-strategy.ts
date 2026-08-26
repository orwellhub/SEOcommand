import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isoDate } from "@/lib/dates";
import type { GscQueryPageRow, Keyword, SearchIntent } from "@/lib/types";
import { readLatestSnapshots } from "@/sync/store";

const STOP = new Set([
  "a", "an", "and", "are", "best", "for", "from", "how", "in", "is", "near", "of", "on", "the", "to", "what", "where", "with",
]);

function tokens(keyword: string): string[] {
  return keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !STOP.has(token));
}

function clusterKey(keyword: string): string {
  const important = tokens(keyword);
  return (important.slice(0, 2).join(" ") || keyword.toLowerCase()).slice(0, 100);
}

function opportunityScore(keyword: Keyword): number {
  const position = keyword.position ?? 101;
  const positionFactor = position <= 3 ? 0.2 : position <= 20 ? 1 : position <= 50 ? 0.65 : 0.35;
  const volumeFactor = Math.min(1, Math.log10(Math.max(keyword.volume, 1)) / 4);
  const difficultyFactor = 1 - Math.min(keyword.difficulty, 100) / 140;
  return Math.round(100 * positionFactor * volumeFactor * difficultyFactor);
}

export interface KeywordCluster {
  id: string;
  label: string;
  intent: SearchIntent;
  keywords: string[];
  totalVolume: number;
  avgDifficulty: number;
  bestPosition: number | null;
  targetUrl: string | null;
  opportunityScore: number;
}

export interface KeywordPageMap {
  page: string;
  primaryQuery: string;
  queries: string[];
  clicks: number;
  impressions: number;
  averagePosition: number;
}

export interface CannibalisationIssue {
  query: string;
  pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
  totalImpressions: number;
  severity: "high" | "medium" | "low";
}

export function analyseKeywordStrategy(keywords: Keyword[], queryPages: GscQueryPageRow[]) {
  const grouped = new Map<string, Keyword[]>();
  for (const keyword of keywords) {
    const key = `${keyword.intent}:${clusterKey(keyword.keyword)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), keyword]);
  }
  const clusters: KeywordCluster[] = [...grouped.entries()].map(([id, group]) => {
    const sorted = [...group].sort((a, b) => b.volume - a.volume);
    const positioned = group.map((item) => item.position).filter((value): value is number => value != null);
    const targetCounts = new Map<string, number>();
    for (const item of group) if (item.targetUrl) targetCounts.set(item.targetUrl, (targetCounts.get(item.targetUrl) ?? 0) + 1);
    const targetUrl = [...targetCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      id,
      label: sorted[0]?.keyword ?? id.split(":")[1]!,
      intent: group[0]!.intent,
      keywords: sorted.map((item) => item.keyword),
      totalVolume: group.reduce((sum, item) => sum + item.volume, 0),
      avgDifficulty: Math.round(group.reduce((sum, item) => sum + item.difficulty, 0) / group.length),
      bestPosition: positioned.length ? Math.min(...positioned) : null,
      targetUrl,
      opportunityScore: Math.max(...group.map(opportunityScore)),
    };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore || b.totalVolume - a.totalVolume);

  const byPage = new Map<string, GscQueryPageRow[]>();
  const byQuery = new Map<string, GscQueryPageRow[]>();
  for (const row of queryPages) {
    if (!row.page || !row.query) continue;
    byPage.set(row.page, [...(byPage.get(row.page) ?? []), row]);
    byQuery.set(row.query, [...(byQuery.get(row.query) ?? []), row]);
  }
  const pageMap: KeywordPageMap[] = [...byPage.entries()].map(([page, rows]) => {
    const sorted = [...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    return {
      page,
      primaryQuery: sorted[0]?.query ?? "",
      queries: sorted.slice(0, 20).map((row) => row.query),
      clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
      impressions,
      averagePosition: impressions ? Math.round((rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions) * 10) / 10 : 0,
    };
  }).sort((a, b) => b.clicks - a.clicks);

  const cannibalisation: CannibalisationIssue[] = [...byQuery.entries()].flatMap(([query, rows]) => {
    const meaningful = rows.filter((row) => row.impressions >= 10).sort((a, b) => b.impressions - a.impressions);
    const uniquePages = [...new Map(meaningful.map((row) => [row.page, row])).values()];
    if (uniquePages.length < 2) return [];
    const totalImpressions = uniquePages.reduce((sum, row) => sum + row.impressions, 0);
    return [{
      query,
      pages: uniquePages.slice(0, 5).map((row) => ({ page: row.page, clicks: row.clicks, impressions: row.impressions, position: row.position })),
      totalImpressions,
      severity: totalImpressions >= 1_000 ? "high" as const : totalImpressions >= 200 ? "medium" as const : "low" as const,
    }];
  }).sort((a, b) => b.totalImpressions - a.totalImpressions);

  return {
    clusters,
    pageMap,
    cannibalisation,
    summary: {
      clusters: clusters.length,
      mappedPages: pageMap.length,
      unmappedClusters: clusters.filter((cluster) => !cluster.targetUrl).length,
      cannibalisationIssues: cannibalisation.length,
      highOpportunityClusters: clusters.filter((cluster) => cluster.opportunityScore >= 60).length,
    },
  };
}

export async function refreshKeywordStrategy(siteSlug: string) {
  const snapshots = await readLatestSnapshots(siteSlug);
  const byDataset = new Map(snapshots.map((snapshot) => [snapshot.dataset, snapshot.payload]));
  const result = analyseKeywordStrategy(
    (byDataset.get("keywords") ?? []) as Keyword[],
    (byDataset.get("gsc_query_pages") ?? []) as GscQueryPageRow[],
  );
  const capturedOn = isoDate(new Date());
  await db().insert(schema.keywordStrategySnapshots).values({
    siteSlug,
    capturedOn,
    clusters: result.clusters as unknown as Record<string, unknown>[],
    pageMap: result.pageMap as unknown as Record<string, unknown>[],
    cannibalisation: result.cannibalisation as unknown as Record<string, unknown>[],
    summary: result.summary,
  }).onConflictDoUpdate({
    target: [schema.keywordStrategySnapshots.siteSlug, schema.keywordStrategySnapshots.capturedOn],
    set: {
      clusters: sql`excluded.clusters`,
      pageMap: sql`excluded.page_map`,
      cannibalisation: sql`excluded.cannibalisation`,
      summary: sql`excluded.summary`,
    },
  });
  return result;
}

export async function latestKeywordStrategy(siteSlug: string) {
  const [snapshot] = await db().select().from(schema.keywordStrategySnapshots)
    .where(eq(schema.keywordStrategySnapshots.siteSlug, siteSlug))
    .orderBy(desc(schema.keywordStrategySnapshots.capturedOn)).limit(1);
  return snapshot ?? null;
}
