import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TRACKED_AI_PROMPTS } from "@/data/ai-prompts";
import { crossedThresholds } from "@/lib/budget";
import type { Severity } from "@/lib/types";
import { currentMonth } from "@/providers/dataforseo/cost";
import { dataForSeoConfigured } from "@/providers/dataforseo";
import { readConfig } from "@/providers/dataforseo/config";
import type { DomainSyncReport } from "@/sync/engine";
import { createNotification } from "./notifications";
import { getManagedSite, paidJobsApproved } from "./site-store";

export type CollectionDataset = "rankings" | "competitors" | "coverage" | "links" | "ai" | "outcomes";
export type CollectionState = "not_configured" | "empty" | "warming" | "ready" | "stale" | "failed";

export interface ValidationIssue {
  dataset: CollectionDataset;
  code: string;
  count: number;
  detail: string;
}

export interface CollectionPolicy {
  dataset: CollectionDataset;
  label: string;
  cadence: "daily" | "weekly" | "prompt" | "continuous";
  minimumDates: number;
  staleAfterDays: number | null;
  alert: boolean;
}

export interface CollectionEvidence {
  configured: boolean;
  records: number;
  distinctDates: number;
  observedAt: Date | string | null;
  nextRunAt?: Date | string | null;
  validationIssues?: ValidationIssue[];
}

export interface CollectionHealthItem {
  dataset: CollectionDataset;
  label: string;
  cadence: CollectionPolicy["cadence"];
  state: CollectionState;
  confidence: "none" | "low" | "high";
  records: number;
  distinctDates: number;
  minimumDates: number;
  observedAt: string | null;
  nextRunAt: string | null;
  staleAfterDays: number | null;
  validationIssues: ValidationIssue[];
}

export interface CollectionHealthSummary {
  generatedAt: string;
  items: Record<CollectionDataset, CollectionHealthItem>;
}

export const COLLECTION_POLICIES: Record<CollectionDataset, CollectionPolicy> = {
  rankings: { dataset: "rankings", label: "Rank history", cadence: "daily", minimumDates: 2, staleAfterDays: 2, alert: true },
  competitors: { dataset: "competitors", label: "Competitor content", cadence: "weekly", minimumDates: 2, staleAfterDays: 9, alert: true },
  coverage: { dataset: "coverage", label: "Market coverage", cadence: "weekly", minimumDates: 2, staleAfterDays: 9, alert: true },
  links: { dataset: "links", label: "Link evidence", cadence: "weekly", minimumDates: 1, staleAfterDays: 9, alert: true },
  ai: { dataset: "ai", label: "AI visibility", cadence: "prompt", minimumDates: 2, staleAfterDays: 9, alert: true },
  outcomes: { dataset: "outcomes", label: "Verified outcomes", cadence: "continuous", minimumDates: 3, staleAfterDays: null, alert: false },
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function nextDailyCollection(now = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function nextWeeklyCollection(now = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6));
  const daysUntilMonday = (8 - next.getUTCDay()) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

export function assessCollection(
  policy: CollectionPolicy,
  evidence: CollectionEvidence,
  now = new Date(),
): CollectionHealthItem {
  const observedAt = iso(evidence.observedAt);
  const issues = evidence.validationIssues ?? [];
  let state: CollectionState;
  if (!evidence.configured) state = "not_configured";
  else if (issues.length) state = "failed";
  else if (evidence.records === 0 || !observedAt) state = "empty";
  else if (policy.staleAfterDays != null && now.getTime() - new Date(observedAt).getTime() > policy.staleAfterDays * 86_400_000) state = "stale";
  else if (evidence.distinctDates < policy.minimumDates) state = "warming";
  else state = "ready";
  return {
    dataset: policy.dataset,
    label: policy.label,
    cadence: policy.cadence,
    state,
    confidence: state === "ready" ? "high" : state === "not_configured" || state === "empty" ? "none" : "low",
    records: evidence.records,
    distinctDates: evidence.distinctDates,
    minimumDates: policy.minimumDates,
    observedAt,
    nextRunAt: iso(evidence.nextRunAt),
    staleAfterDays: policy.staleAfterDays,
    validationIssues: issues,
  };
}

function day(value: Date | string | null | undefined): string | null {
  return iso(value)?.slice(0, 10) ?? null;
}

function distinctDays(values: Array<Date | string | null | undefined>): number {
  return new Set(values.map(day).filter((value): value is string => Boolean(value))).size;
}

function latest(values: Array<Date | string | null | undefined>): Date | string | null {
  return values.reduce<Date | string | null>((best, value) => {
    if (!value) return best;
    return !best || new Date(value) > new Date(best) ? value : best;
  }, null);
}

export function earliestDate(values: Array<Date | string | null | undefined>): Date | string | null {
  return values.reduce<Date | string | null>((best, value) => {
    if (!value) return best;
    return !best || new Date(value) < new Date(best) ? value : best;
  }, null);
}

export function aiStaleAfterDays(cadences: string[]): number {
  return cadences.includes("daily") ? 2 : cadences.includes("weekly") ? 9 : 35;
}

export function resolveAiCollectionSchedule(
  stored: Array<{ cadence: string; nextRunAt: Date | string }>,
  registryPromptCount: number,
  now = new Date(),
  registryLastObservedAt?: Date | string | null,
) {
  const cadences = stored.length ? stored.map((row) => row.cadence) : registryPromptCount > 0 ? ["weekly"] : [];
  const registryNext = registryLastObservedAt ? new Date(registryLastObservedAt) : nextWeeklyCollection(now);
  if (registryLastObservedAt) registryNext.setUTCDate(registryNext.getUTCDate() + 7);
  return {
    configured: cadences.length > 0,
    cadences,
    nextRunAt: stored.length ? earliestDate(stored.map((row) => row.nextRunAt)) : registryPromptCount > 0 ? registryNext : null,
    staleAfterDays: aiStaleAfterDays(cadences),
  };
}

function issue(dataset: CollectionDataset, code: string, count: number, detail: string): ValidationIssue[] {
  return count ? [{ dataset, code, count, detail }] : [];
}

function validPosition(value: unknown): boolean {
  return value == null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100);
}

function validUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export function validateCollectionEvidence(input: {
  rankings: Array<{ trackedKeywordId: string; capturedOn: string; position: number | null; previousPosition: number | null; competitors: Array<{ position?: number }> }>;
  competitors: Array<{ pages: Record<string, unknown>[] }>;
  gaps: Array<{ sitePosition: number | null; competitorPosition: number | null; volume: number | null; difficulty: number | null; trafficPotential: number | null }>;
  links: Array<{ sourceDomain: string; relevance: number; authority: number | null }>;
  ai: Array<{ confidence: number; recommendationPosition: number | null; costUsd: number; responseHash: string }>;
}): ValidationIssue[] {
  const duplicateRanks = input.rankings.length - new Set(input.rankings.map((row) => `${row.trackedKeywordId}:${row.capturedOn}`)).size;
  const badRanks = input.rankings.filter((row) => !validPosition(row.position) || !validPosition(row.previousPosition) || row.competitors.some((item) => !validPosition(item.position))).length;
  const badPages = input.competitors.flatMap((run) => run.pages).filter((page) => !validUrl(page.url) || [page.keywords, page.traffic, page.trafficCost].some((value) => value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))).length;
  const badGaps = input.gaps.filter((row) => !validPosition(row.sitePosition) || !validPosition(row.competitorPosition) || [row.volume, row.difficulty, row.trafficPotential].some((value) => value != null && (!Number.isFinite(value) || value < 0)) || (row.difficulty != null && row.difficulty > 100)).length;
  const badLinks = input.links.filter((row) => !row.sourceDomain.trim() || row.relevance < 0 || row.relevance > 100 || (row.authority != null && (row.authority < 0 || row.authority > 100))).length;
  const badAi = input.ai.filter((row) => row.confidence < 0 || row.confidence > 1 || row.costUsd < 0 || !row.responseHash || (row.recommendationPosition != null && row.recommendationPosition < 1)).length;
  return [
    ...issue("rankings", "duplicate_observation", duplicateRanks, "Duplicate keyword/date observations were found."),
    ...issue("rankings", "invalid_position", badRanks, "Rank positions must be null or between 1 and 100."),
    ...issue("competitors", "invalid_page", badPages, "Competitor pages must have a web URL and non-negative metrics."),
    ...issue("coverage", "invalid_gap", badGaps, "Keyword-gap positions and metrics are outside provider bounds."),
    ...issue("links", "invalid_link", badLinks, "Link authority or relevance evidence is outside expected bounds."),
    ...issue("ai", "invalid_ai_observation", badAi, "AI observation confidence, cost or identity evidence is invalid."),
  ];
}

export async function loadCollectionHealth(siteSlug: string, now = new Date()): Promise<CollectionHealthSummary> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const [tracked, rankings, competitors, gaps, prospects, linkHistory, prompts, observations, work] = await Promise.all([
    db().select({ id: schema.rankTrackingKeywords.id }).from(schema.rankTrackingKeywords).where(and(eq(schema.rankTrackingKeywords.siteSlug, siteSlug), eq(schema.rankTrackingKeywords.active, true))),
    db().select({ trackedKeywordId: schema.dailyRankHistory.trackedKeywordId, capturedOn: schema.dailyRankHistory.capturedOn, position: schema.dailyRankHistory.position, previousPosition: schema.dailyRankHistory.previousPosition, competitors: schema.dailyRankHistory.competitors }).from(schema.dailyRankHistory).where(eq(schema.dailyRankHistory.siteSlug, siteSlug)).orderBy(desc(schema.dailyRankHistory.capturedOn)).limit(30_000),
    db().select().from(schema.competitorResearchRuns).where(eq(schema.competitorResearchRuns.siteSlug, siteSlug)).orderBy(desc(schema.competitorResearchRuns.capturedAt)).limit(500),
    db().select().from(schema.keywordGapHistory).where(eq(schema.keywordGapHistory.siteSlug, siteSlug)).orderBy(desc(schema.keywordGapHistory.capturedOn)).limit(20_000),
    db().select({ sourceDomain: schema.linkProspects.sourceDomain, relevance: schema.linkProspects.relevance, authority: schema.linkProspects.authority, updatedAt: schema.linkProspects.updatedAt }).from(schema.linkProspects).where(eq(schema.linkProspects.siteSlug, siteSlug)).orderBy(desc(schema.linkProspects.updatedAt)).limit(5_000),
    db().select().from(schema.backlinkProfileHistory).where(eq(schema.backlinkProfileHistory.siteSlug, siteSlug)).orderBy(desc(schema.backlinkProfileHistory.capturedOn)).limit(500),
    db().select().from(schema.aiTrackingPrompts).where(and(eq(schema.aiTrackingPrompts.siteSlug, siteSlug), eq(schema.aiTrackingPrompts.active, true))),
    db().select({ capturedOn: schema.aiResponseObservations.capturedOn, capturedAt: schema.aiResponseObservations.capturedAt, confidence: schema.aiResponseObservations.confidence, recommendationPosition: schema.aiResponseObservations.recommendationPosition, costUsd: schema.aiResponseObservations.costUsd, responseHash: schema.aiResponseObservations.responseHash }).from(schema.aiResponseObservations).where(eq(schema.aiResponseObservations.siteSlug, siteSlug)).orderBy(desc(schema.aiResponseObservations.capturedAt)).limit(10_000),
    db().select({ updatedAt: schema.workflowItems.updatedAt, verification: schema.workflowItems.verification }).from(schema.workflowItems).where(eq(schema.workflowItems.domainSlug, siteSlug)).orderBy(desc(schema.workflowItems.updatedAt)).limit(5_000),
  ]);
  const validation = validateCollectionEvidence({ rankings, competitors, gaps, links: prospects, ai: observations });
  const paidConfigured = dataForSeoConfigured() && paidJobsApproved(site);
  const registryAiPrompts = TRACKED_AI_PROMPTS[siteSlug as keyof typeof TRACKED_AI_PROMPTS] ?? [];
  const aiSchedule = resolveAiCollectionSchedule(prompts, registryAiPrompts.length, now, latest(observations.map((row) => row.capturedAt)));
  const verified = work.filter((row) => {
    const outcome = (row.verification as { outcome?: string }).outcome;
    return outcome && outcome !== "awaiting_data";
  });
  const aiPolicy = {
    ...COLLECTION_POLICIES.ai,
    staleAfterDays: aiSchedule.staleAfterDays,
  };
  const evidence: Record<CollectionDataset, CollectionEvidence> = {
    rankings: { configured: paidConfigured && tracked.length > 0, records: rankings.length, distinctDates: distinctDays(rankings.map((row) => row.capturedOn)), observedAt: latest(rankings.map((row) => row.capturedOn)), nextRunAt: nextDailyCollection(now), validationIssues: validation.filter((item) => item.dataset === "rankings") },
    competitors: { configured: paidConfigured, records: competitors.length, distinctDates: distinctDays(competitors.map((row) => row.capturedAt)), observedAt: latest(competitors.map((row) => row.capturedAt)), nextRunAt: nextWeeklyCollection(now), validationIssues: validation.filter((item) => item.dataset === "competitors") },
    coverage: { configured: paidConfigured, records: gaps.length, distinctDates: distinctDays(gaps.map((row) => row.capturedOn)), observedAt: latest(gaps.map((row) => row.capturedOn)), nextRunAt: nextWeeklyCollection(now), validationIssues: validation.filter((item) => item.dataset === "coverage") },
    links: { configured: paidConfigured, records: prospects.length + linkHistory.length, distinctDates: distinctDays([...prospects.map((row) => row.updatedAt), ...linkHistory.map((row) => row.capturedOn)]), observedAt: latest([...prospects.map((row) => row.updatedAt), ...linkHistory.map((row) => row.capturedOn)]), nextRunAt: nextWeeklyCollection(now), validationIssues: validation.filter((item) => item.dataset === "links") },
    ai: { configured: paidConfigured && aiSchedule.configured, records: observations.length, distinctDates: distinctDays(observations.map((row) => row.capturedOn)), observedAt: latest(observations.map((row) => row.capturedAt)), nextRunAt: aiSchedule.nextRunAt, validationIssues: validation.filter((item) => item.dataset === "ai") },
    outcomes: { configured: true, records: verified.length, distinctDates: distinctDays(verified.map((row) => row.updatedAt)), observedAt: latest(verified.map((row) => row.updatedAt)), nextRunAt: null },
  };
  return {
    generatedAt: now.toISOString(),
    items: Object.fromEntries(Object.values(COLLECTION_POLICIES).map((policy) => {
      const appliedPolicy = policy.dataset === "ai" ? aiPolicy : policy;
      return [policy.dataset, assessCollection(appliedPolicy, evidence[policy.dataset], now)];
    })) as Record<CollectionDataset, CollectionHealthItem>,
  };
}

function bucket(now: Date, days: number): number {
  return Math.floor(now.getTime() / (days * 86_400_000));
}

function severityFor(state: CollectionState): Severity {
  return state === "failed" ? "critical" : state === "stale" ? "high" : "medium";
}

export async function monitorCollectionHealth(siteSlug: string, report: DomainSyncReport, now = new Date()) {
  const actionUrl = `/market-intelligence?site=${encodeURIComponent(siteSlug)}`;
  for (const result of report.results) {
    if (result.status === "error") {
      await createNotification({ siteSlug, eventType: "collection_failed", severity: "high", title: `${result.dataset.replace(/_/g, " ")} collection failed`, detail: result.note ?? "The scheduled collector returned an error.", actionUrl, fingerprint: `collection-failed:${siteSlug}:${result.dataset}:${bucket(now, 1)}` });
    } else if (result.status === "skipped" && result.note) {
      await createNotification({ siteSlug, eventType: "collection_blocked", severity: "high", title: `${result.dataset.replace(/_/g, " ")} collection was blocked`, detail: result.note, actionUrl: `/scan-centre?site=${encodeURIComponent(siteSlug)}`, fingerprint: `collection-blocked:${siteSlug}:${result.dataset}:${bucket(now, 1)}` });
    }
  }
  const health = await loadCollectionHealth(siteSlug, now);
  const site = await getManagedSite(siteSlug);
  const inGracePeriod = site?.createdAt ? now.getTime() - new Date(site.createdAt).getTime() < 86_400_000 : false;
  for (const item of Object.values(health.items)) {
    const policy = COLLECTION_POLICIES[item.dataset];
    if (!policy.alert || item.state === "ready" || item.state === "warming" || item.state === "not_configured") continue;
    if (item.state === "empty" && inGracePeriod) continue;
    const eventType = item.state === "failed" ? "dataset_validation_failed" : item.state === "stale" ? "dataset_stale" : "dataset_missing";
    const detail = item.validationIssues.length
      ? item.validationIssues.map((entry) => `${entry.count} × ${entry.detail}`).join(" ")
      : item.state === "stale"
        ? `Latest stored evidence: ${item.observedAt ?? "unknown"}. Expected every ${item.cadence}.`
        : `No stored evidence exists yet. Next scheduled collection: ${item.nextRunAt ?? "not scheduled"}.`;
    await createNotification({ siteSlug, eventType, severity: severityFor(item.state), title: `${item.label} is ${item.state.replace(/_/g, " ")}`, detail, actionUrl, fingerprint: `${eventType}:${siteSlug}:${item.dataset}:${bucket(now, 7)}` });
  }
  return health;
}

export async function monitorProviderBudget(now = new Date()) {
  const config = readConfig();
  if (!config) return null;
  const month = currentMonth(now);
  const rows = await db().select({ costUsd: schema.providerSpend.costUsd }).from(schema.providerSpend).where(and(eq(schema.providerSpend.provider, "dataforseo"), eq(schema.providerSpend.month, month)));
  const spentUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const thresholds = crossedThresholds({ limitUsd: config.monthlyBudgetUsd, spentUsd });
  for (const threshold of thresholds) {
    const stopped = threshold === 100;
    await createNotification({
      eventType: "provider_budget_threshold",
      severity: stopped ? "critical" : threshold >= 90 ? "high" : threshold >= 75 ? "medium" : "low",
      title: stopped ? "DataForSEO emergency pause is active" : `DataForSEO reached ${threshold}% of monthly budget`,
      detail: `$${spentUsd.toFixed(2)} of the $${config.monthlyBudgetUsd.toFixed(2)} monthly limit is recorded. ${stopped ? "Further paid calls are blocked by SpendGuard." : "Review collection priorities before the next paid run."}`,
      actionUrl: "/usage",
      fingerprint: `provider-budget:${month}:${threshold}`,
    });
  }
  return { month, spentUsd, limitUsd: config.monthlyBudgetUsd, thresholds };
}
