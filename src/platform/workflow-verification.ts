export const VERIFICATION_DAYS = [7, 14, 28] as const;
export type Outcome = "awaiting_data" | "won" | "lost" | "inconclusive";

export type Metric = { key: string; label: string; value: number; unit: string; source: string };
export type VerificationState = {
  baseline?: { capturedAt: string; metrics: Metric[] };
  shipment?: { recordedAt: string; note: string | null; url: string | null };
  checkpoints?: Array<{ day: number; dueAt: string; status: "scheduled" | "recorded"; recordedAt?: string; metrics?: Metric[]; note?: string | null }>;
  outcome?: Outcome;
  outcomeNote?: string | null;
};

const METRICS: Array<[string, string, string]> = [
  ["clicks", "Clicks", "count"], ["impressions", "Impressions", "count"], ["ctr", "CTR", "ratio"],
  ["position", "Average position", "position"], ["conversions", "Conversions", "count"],
  ["affectedPages", "Affected pages", "count"], ["authority", "Authority", "score"], ["relevance", "Fit score", "score"],
];

export function evidenceMetrics(evidence: Record<string, unknown> | null | undefined): Metric[] {
  if (!evidence) return [];
  const nested = [evidence, evidence.page, evidence.issue, evidence.cluster].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value)));
  const metrics: Metric[] = [];
  for (const [key, label, unit] of METRICS) {
    const owner = nested.find((item) => typeof item[key] === "number");
    if (owner) metrics.push({ key, label, value: owner[key] as number, unit, source: String(evidence.kind ?? "attached_evidence") });
  }
  return metrics;
}

export function captureBaseline(evidence: Record<string, unknown>, now = new Date()): VerificationState {
  return { baseline: { capturedAt: now.toISOString(), metrics: evidenceMetrics(evidence) }, outcome: "awaiting_data" };
}

export function recordShipment(current: VerificationState, input: { note?: string | null; url?: string | null }, now = new Date()): VerificationState {
  return {
    ...current,
    shipment: { recordedAt: now.toISOString(), note: input.note?.trim() || null, url: input.url?.trim() || null },
    checkpoints: VERIFICATION_DAYS.map((day) => ({ day, dueAt: new Date(now.getTime() + day * 86_400_000).toISOString(), status: "scheduled" })),
    outcome: "awaiting_data",
  };
}

export function recordCheckpoint(current: VerificationState, input: { day: number; metrics: Metric[]; note?: string | null; outcome?: Outcome }, now = new Date()): VerificationState {
  const checkpoints = (current.checkpoints ?? []).map((checkpoint) => checkpoint.day === input.day ? { ...checkpoint, status: "recorded" as const, recordedAt: now.toISOString(), metrics: input.metrics, note: input.note?.trim() || null } : checkpoint);
  return { ...current, checkpoints, outcome: input.outcome ?? current.outcome ?? "awaiting_data", outcomeNote: input.note?.trim() || current.outcomeNote || null };
}
