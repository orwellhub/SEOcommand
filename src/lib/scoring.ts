import type { Backlink, HealthBreakdown, ReferringDomain } from "./types";

/**
 * Pure, transparent scoring functions computed from LIVE stored data.
 * Documented in docs/scoring-methodology.md. No hidden formulas.
 */

/** Orwell Site Health Score: weighted average of category sub-scores (0–100). */
export function computeHealthScore(breakdown: HealthBreakdown[]): number {
  if (!breakdown.length) return 0;
  const totalWeight = breakdown.reduce((s, b) => s + b.weight, 0) || 1;
  const score = breakdown.reduce((s, b) => s + b.weight * b.score, 0) / totalWeight;
  return Math.round(score);
}

/**
 * Orwell Authority Score (0–100), from live backlink + visibility data.
 * Components: referring-domain authority 35%, topical relevance 20%,
 * link diversity 15%, organic visibility 20%, minus toxicity penalty 10%.
 */
export function computeAuthorityScore(
  referringDomains: ReferringDomain[],
  backlinks: Backlink[],
  visibility: number,
): number {
  if (!referringDomains.length && !backlinks.length) return 0;
  const avgAuthority = referringDomains.length
    ? referringDomains.reduce((s, r) => s + r.authority, 0) / referringDomains.length
    : 0;
  const avgRelevance = referringDomains.length
    ? referringDomains.reduce((s, r) => s + r.topicalRelevance, 0) / referringDomains.length
    : 0;
  const uniqueHosts = new Set(backlinks.map((b) => b.sourceDomain)).size;
  const diversity = Math.min(100, (uniqueHosts / 25) * 100);
  const avgToxicity = backlinks.length
    ? backlinks.reduce((s, b) => s + b.toxicity, 0) / backlinks.length
    : 0;

  const score =
    avgAuthority * 0.35 + avgRelevance * 0.2 + diversity * 0.15 + visibility * 0.2 - avgToxicity * 0.1;

  return Math.max(0, Math.min(100, Math.round(score)));
}
