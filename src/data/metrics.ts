import type { DomainId } from "@/lib/types";
import { DOMAINS } from "./domains";
import { SEED, healthScore } from "./seed";
import { rngFor, intBetween, floatBetween, series } from "@/lib/prng";
import { isoDaysAgo } from "@/lib/dates";

/** Domain-level headline metrics, reconciled with the underlying seed tables. */
export interface DomainMetrics {
  domainId: DomainId;
  health: number;
  organicClicks: number;
  organicClicksDeltaPct: number;
  impressions: number;
  visibility: number;
  visibilityDeltaPct: number;
  estTraffic: number;
  conversions: number;
  conversionsDeltaPct: number;
  trackedKeywords: number;
  top3: number;
  top10: number;
  criticalIssues: number;
  referringDomains: number;
  newBacklinks: number;
  lostBacklinks: number;
  aiMentionRate: number;
  aiCitationRate: number;
  authorityScore: number;
}

export function domainMetrics(domainId: DomainId): DomainMetrics {
  const rng = rngFor(`${domainId}:metrics`);
  const vis = SEED.visibility[domainId];
  const visNow = vis[vis.length - 1]!.value;
  const vis30 = vis[vis.length - 31]?.value ?? visNow;
  const buckets = SEED.positionBuckets[domainId];
  const top3 = buckets.find((b) => b.label === "1–3")?.count ?? 0;
  const top10 = top3 + (buckets.find((b) => b.label === "4–10")?.count ?? 0);
  const issues = SEED.technicalIssues[domainId];
  const backlinks = SEED.backlinks[domainId];
  const ai = SEED.aiPrompts[domainId];

  const organicClicks = intBetween(rng, 8000, 120000);
  const conversions = intBetween(rng, 60, 2400);

  return {
    domainId,
    health: healthScore(domainId),
    organicClicks,
    organicClicksDeltaPct: floatBetween(rng, -12, 26, 1),
    impressions: organicClicks * intBetween(rng, 12, 30),
    visibility: visNow,
    visibilityDeltaPct: Number((((visNow - vis30) / vis30) * 100).toFixed(1)),
    estTraffic: intBetween(rng, 12000, 210000),
    conversions,
    conversionsDeltaPct: floatBetween(rng, -8, 32, 1),
    trackedKeywords: SEED.keywords[domainId].length,
    top3,
    top10,
    criticalIssues: issues.filter(
      (i) => (i.severity === "critical" || i.severity === "high") && i.status === "open",
    ).length,
    referringDomains: SEED.referringDomains[domainId].length,
    newBacklinks: backlinks.filter((b) => b.status === "new").length,
    lostBacklinks: backlinks.filter((b) => b.status === "lost").length,
    aiMentionRate: Math.round(ai.reduce((s, p) => s + p.mentionRate, 0) / ai.length),
    aiCitationRate: Math.round(ai.reduce((s, p) => s + p.citationRate, 0) / ai.length),
    authorityScore: orwellAuthorityScore(domainId),
  };
}

/**
 * Orwell Authority Score (0–100). Transparent, original composite — NOT a copy
 * of any vendor score. Documented in docs/scoring-methodology.md.
 *
 * Components & weights:
 *  - Referring-domain authority (35%)
 *  - Topical relevance of links (20%)
 *  - Link diversity (15%)
 *  - Organic visibility (20%)
 *  - Risk penalty from toxic links (10%, subtractive)
 */
export function orwellAuthorityScore(domainId: DomainId): number {
  const rds = SEED.referringDomains[domainId];
  const backlinks = SEED.backlinks[domainId];
  const vis = SEED.visibility[domainId];
  const visNow = vis[vis.length - 1]!.value;

  const avgAuthority = rds.reduce((s, r) => s + r.authority, 0) / rds.length;
  const avgRelevance = rds.reduce((s, r) => s + r.topicalRelevance, 0) / rds.length;
  const uniqueHosts = new Set(backlinks.map((b) => b.sourceDomain)).size;
  const diversity = Math.min(100, (uniqueHosts / 15) * 100);
  const avgToxicity = backlinks.reduce((s, b) => s + b.toxicity, 0) / backlinks.length;

  const score =
    avgAuthority * 0.35 +
    avgRelevance * 0.2 +
    diversity * 0.15 +
    visNow * 0.2 -
    avgToxicity * 0.1;

  return Math.max(1, Math.min(100, Math.round(score)));
}

export interface PortfolioMetrics {
  avgHealth: number;
  totalClicks: number;
  avgVisibility: number;
  totalConversions: number;
  criticalIssues: number;
  totalReferringDomains: number;
  newBacklinks: number;
  lostBacklinks: number;
  avgAiMentionRate: number;
  domains: DomainMetrics[];
}

export function portfolioMetrics(): PortfolioMetrics {
  const domains = DOMAINS.map((d) => domainMetrics(d.id));
  const n = domains.length;
  return {
    avgHealth: Math.round(domains.reduce((s, d) => s + d.health, 0) / n),
    totalClicks: domains.reduce((s, d) => s + d.organicClicks, 0),
    avgVisibility: Math.round(domains.reduce((s, d) => s + d.visibility, 0) / n),
    totalConversions: domains.reduce((s, d) => s + d.conversions, 0),
    criticalIssues: domains.reduce((s, d) => s + d.criticalIssues, 0),
    totalReferringDomains: domains.reduce((s, d) => s + d.referringDomains, 0),
    newBacklinks: domains.reduce((s, d) => s + d.newBacklinks, 0),
    lostBacklinks: domains.reduce((s, d) => s + d.lostBacklinks, 0),
    avgAiMentionRate: Math.round(domains.reduce((s, d) => s + d.aiMentionRate, 0) / n),
    domains,
  };
}

/** Portfolio visibility comparison — one series per domain over 90 days. */
export function portfolioVisibilitySeries(): { date: string; [k: string]: number | string }[] {
  const len = 90;
  const rows: { date: string; [k: string]: number | string }[] = [];
  for (let i = 0; i < len; i++) {
    const row: { date: string; [k: string]: number | string } = {
      date: isoDaysAgo(len - 1 - i),
    };
    for (const d of DOMAINS) {
      row[d.id] = SEED.visibility[d.id][i]!.value;
    }
    rows.push(row);
  }
  return rows;
}

/** Organic clicks trend for a domain (90 days), reconciled to headline clicks. */
export function clicksSeries(domainId: DomainId): { date: string; clicks: number; impressions: number }[] {
  const m = domainMetrics(domainId);
  const rng = rngFor(`${domainId}:clicks`);
  const dailyBase = Math.round(m.organicClicks / 30);
  const clicks = series(rng, 90, dailyBase, dailyBase * 0.18, m.organicClicksDeltaPct);
  return clicks.map((c, i) => ({
    date: isoDaysAgo(89 - i),
    clicks: c,
    impressions: c * intBetween(rngFor(`${domainId}:imp:${i}`), 12, 28),
  }));
}

/** Ranking winners and losers for a domain, from current vs previous position. */
export function winnersLosers(domainId: DomainId) {
  const snaps = SEED.rankSnapshots[domainId];
  const withDelta = snaps.map((s) => ({ ...s, delta: s.prevPosition - s.position }));
  const winners = [...withDelta]
    .filter((s) => s.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6);
  const losers = [...withDelta]
    .filter((s) => s.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6);
  return { winners, losers };
}
