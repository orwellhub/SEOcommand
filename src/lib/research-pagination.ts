import type { ResearchUnit } from "./research-evidence";

/** Only append the next page after its predecessor has been saved successfully. */
export function nextResearchPage(unit: ResearchUnit, raw: Record<string, unknown>[]): ResearchUnit | null {
  if (!unit.maxRows) return null;
  const root = raw[0];
  if (!root || !Array.isArray(root.items)) {
    if (root?.total_count === 0) return null;
    throw new Error("Provider page was incomplete. Completed pages are retained; the uncertain request needs review.");
  }
  const offset = Number(unit.body.offset ?? 0), limit = Number(unit.body.limit ?? 1000);
  const nextOffset = offset + root.items.length;
  if (!root.items.length || nextOffset >= unit.maxRows || (typeof root.total_count === "number" && nextOffset >= root.total_count) || root.items.length < limit) return null;
  return { id: `${unit.id.split(":page:")[0]}:page:${nextOffset}`, endpoint: unit.endpoint, path: unit.path, body: { ...unit.body, offset: nextOffset, limit: Math.min(limit, unit.maxRows - nextOffset) }, maxRows: unit.maxRows, estimateUsd: unit.estimateUsd, label: unit.label };
}

export function researchCanResume(units: ResearchUnit[]): boolean {
  return units.some(unit => unit.status !== "completed") && units.every(unit => unit.status !== "running");
}
