import type { Metric, VerificationState } from "./workflow-verification";

export type OutcomeWork = { [key: string]: unknown; id: string; domainSlug: string; recommendationKey?: string; title: string; module: string; executionType: string | null; ownerEmail: string | null; sourceUrl: string | null; sourceEvidence: Record<string, unknown>; priorityScore: number; status: string | null; targetUrl: string | null; plannedUrl: string | null; shippedAt: Date | string | null; verifiedAt: Date | string | null; createdAt: Date | string; verification: Record<string, unknown> };
export type MetricDelta = Metric & { current: number | null; absoluteChange: number | null; percentChange: number | null; direction: "up" | "down" | "flat" | "unknown" };

export function metricDeltas(verification: VerificationState): MetricDelta[] {
  const latest = [...(verification.checkpoints ?? [])].filter((item) => item.status === "recorded").sort((a, b) => b.day - a.day)[0];
  return (verification.baseline?.metrics ?? []).map((baseline) => {
    const current = latest?.metrics?.find((item) => item.key === baseline.key)?.value ?? null;
    const rawChange = current == null ? null : current - baseline.value;
    const absoluteChange = rawChange == null ? null : baseline.unit === "position" ? -rawChange : rawChange;
    const percentChange = absoluteChange == null || baseline.value === 0 ? null : absoluteChange / Math.abs(baseline.value) * 100;
    return { ...baseline, current, absoluteChange, percentChange, direction: absoluteChange == null ? "unknown" : Math.abs(absoluteChange) < 0.00001 ? "flat" : absoluteChange > 0 ? "up" : "down" };
  });
}

export function outcomeSource(item: OutcomeWork) {
  const kind = typeof item.sourceEvidence.kind === "string" ? item.sourceEvidence.kind : item.recommendationKey?.startsWith?.("finding:") ? "site finding" : "recommendation";
  return String(kind).replace(/_/g, " ");
}

export function buildOutcomeRow(item: OutcomeWork) {
  const verification = item.verification as VerificationState;
  const checkpoints = verification.checkpoints ?? [];
  return { ...item, verification, sourceLabel: outcomeSource(item), destination: item.targetUrl ?? item.plannedUrl, metrics: metricDeltas(verification), latestCheckDay: Math.max(0, ...checkpoints.filter((entry) => entry.status === "recorded").map((entry) => entry.day)), nextCheck: checkpoints.find((entry) => entry.status === "scheduled")?.dueAt ?? null, proof: { researched: Boolean(item.sourceUrl || Object.keys(item.sourceEvidence).length), approved: true, shipped: Boolean(verification.shipment || item.shippedAt), verified: verification.outcome !== undefined && verification.outcome !== "awaiting_data", valued: Boolean(verification.valueCreated?.amount) } };
}

export type LearningSignal = { domainSlug: string; executionType: string; samples: number; wins: number; losses: number; adjustment: number; explanation: string };
export function buildLearningSignals(items: OutcomeWork[]): LearningSignal[] {
  const groups = new Map<string, { domainSlug: string; executionType: string; outcomes: string[] }>();
  for (const item of items) { const outcome = (item.verification as VerificationState).outcome; if (!outcome || outcome === "awaiting_data") continue; const executionType = item.executionType ?? "general"; const key = `${item.domainSlug}:${executionType}`; const group = groups.get(key) ?? { domainSlug: item.domainSlug, executionType, outcomes: [] }; group.outcomes.push(outcome); groups.set(key, group); }
  return [...groups.values()].map((group) => { const wins = group.outcomes.filter((item) => item === "won").length; const losses = group.outcomes.filter((item) => item === "lost").length; const adjustment = group.outcomes.length < 3 ? 0 : Math.max(-10, Math.min(10, Math.round((wins - losses) / group.outcomes.length * 10))); return { domainSlug: group.domainSlug, executionType: group.executionType, samples: group.outcomes.length, wins, losses, adjustment, explanation: group.outcomes.length < 3 ? "No adjustment until three verified outcomes exist." : `${wins} won and ${losses} lost across ${group.outcomes.length} verified actions.` }; });
}

export function applyLearningAdjustment(score: number, signal?: LearningSignal) { return Math.max(0, Math.min(100, score + (signal?.adjustment ?? 0))); }
