export const VERIFICATION_DAYS = [7, 14, 28] as const;
export type Outcome = "awaiting_data" | "won" | "lost" | "inconclusive";

export type Metric = { key: string; label: string; value: number; unit: string; source: string };
export type VerificationProvenance = {
  mode: "stored_first_party" | "attached_evidence" | "manual";
  datasets: string[];
  capturedOn: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  scope?: "page" | "query" | "site" | "attached";
  target?: string | null;
};
export type VerificationState = {
  baseline?: { capturedAt: string; metrics: Metric[]; provenance?: VerificationProvenance };
  shipment?: { recordedAt: string; note: string | null; url: string | null };
  checkpoints?: Array<{ day: number; dueAt: string; status: "scheduled" | "recorded"; recordedAt?: string; metrics?: Metric[]; note?: string | null; provenance?: VerificationProvenance }>;
  outcome?: Outcome;
  outcomeNote?: string | null;
  confidence?: "low" | "medium" | "high";
  alternativeExplanations?: string[];
  valueCreated?: { amount: number; currency: string; method: "recorded" | "estimated"; assumption?: string | null } | null;
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

export function captureBaseline(evidence: Record<string, unknown>, now = new Date(), provenance?: VerificationProvenance): VerificationState {
  return { baseline: { capturedAt: now.toISOString(), metrics: evidenceMetrics(evidence), provenance }, outcome: "awaiting_data" };
}

export function captureMetricBaseline(metrics: Metric[], provenance: VerificationProvenance, now = new Date()): VerificationState {
  return { baseline: { capturedAt: now.toISOString(), metrics, provenance }, outcome: "awaiting_data" };
}

export function recordShipment(current: VerificationState, input: { note?: string | null; url?: string | null }, now = new Date()): VerificationState {
  return {
    ...current,
    shipment: { recordedAt: now.toISOString(), note: input.note?.trim() || null, url: input.url?.trim() || null },
    checkpoints: VERIFICATION_DAYS.map((day) => ({ day, dueAt: new Date(now.getTime() + day * 86_400_000).toISOString(), status: "scheduled" })),
    outcome: "awaiting_data",
  };
}

export function recordCheckpoint(current: VerificationState, input: { day: number; metrics: Metric[]; note?: string | null; outcome?: Outcome; confidence?: "low" | "medium" | "high"; alternativeExplanations?: string[]; valueCreated?: VerificationState["valueCreated"]; provenance?: VerificationProvenance }, now = new Date()): VerificationState {
  const checkpoints = (current.checkpoints ?? []).map((checkpoint) => checkpoint.day === input.day ? { ...checkpoint, status: "recorded" as const, recordedAt: now.toISOString(), metrics: input.metrics, note: input.note?.trim() || null, provenance: input.provenance ?? checkpoint.provenance } : checkpoint);
  return { ...current, checkpoints, outcome: input.outcome ?? current.outcome ?? "awaiting_data", outcomeNote: input.outcome === undefined ? current.outcomeNote : input.note?.trim() || current.outcomeNote || null, confidence: input.confidence ?? current.confidence, alternativeExplanations: input.alternativeExplanations ?? current.alternativeExplanations, valueCreated: input.valueCreated === undefined ? current.valueCreated : input.valueCreated };
}
