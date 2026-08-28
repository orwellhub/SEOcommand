import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { readLatestSnapshots } from "@/sync/store";
import { createNotification } from "./notifications";
import { measurementFromSnapshots, measurementIsFreshFor } from "./outcome-evidence";
import { recordCheckpoint, type VerificationState } from "./workflow-verification";

export type OutcomeCollectionReport = { siteSlug: string; due: number; collected: number; missing: number };

export async function collectDueOutcomeEvidence(siteSlug: string, now = new Date()): Promise<OutcomeCollectionReport> {
  const items = await db().select().from(schema.workflowItems).where(and(
    eq(schema.workflowItems.domainSlug, siteSlug),
    eq(schema.workflowItems.decision, "approved"),
    inArray(schema.workflowItems.status, ["shipped", "verifying", "done"]),
  ));
  const snapshots = await readLatestSnapshots(siteSlug);
  let due = 0; let collected = 0; let missing = 0;
  for (const item of items) {
    const verification = item.verification as VerificationState;
    const checkpoint = [...(verification.checkpoints ?? [])]
      .filter((entry) => entry.status === "scheduled" && new Date(entry.dueAt) <= now)
      .sort((left, right) => left.day - right.day)[0];
    if (!checkpoint) continue;
    due += 1;
    const measurement = measurementFromSnapshots(item, snapshots);
    if (!measurement || !measurementIsFreshFor(measurement, checkpoint.dueAt)) {
      missing += 1;
      await createNotification({
        siteSlug,
        eventType: "outcome_evidence_missing",
        severity: "medium",
        title: `Day ${checkpoint.day} outcome evidence is unavailable`,
        detail: `Stored first-party data could not measure “${item.title}”. Check the target URL, target keywords and Google connection. No provider call was made.`,
        actionUrl: `/work?item=${item.id}`,
        fingerprint: `outcome-evidence-missing:${item.id}:${checkpoint.day}`,
      });
      continue;
    }
    const next = recordCheckpoint(verification, {
      day: checkpoint.day,
      metrics: measurement.metrics,
      provenance: measurement.provenance,
      note: verification.outcome && verification.outcome !== "awaiting_data" ? "Collected automatically from stored first-party data after the recorded outcome." : "Collected automatically from stored first-party data. Awaiting human outcome review.",
    }, now);
    const reviewed = next.outcome !== undefined && next.outcome !== "awaiting_data";
    await db().update(schema.workflowItems).set({ verification: next, status: reviewed ? "done" : "verifying", updatedAt: now }).where(eq(schema.workflowItems.id, item.id));
    await createNotification({
      siteSlug,
      eventType: "outcome_evidence_ready",
      severity: "medium",
      title: `Day ${checkpoint.day} evidence is ready for review`,
      detail: reviewed ? `SEOcommand added later stored GSC/GA4 evidence for “${item.title}”. Review whether the recorded outcome still holds.` : `SEOcommand collected the stored GSC/GA4 evidence for “${item.title}”. Classify the result as Won, Lost or Inconclusive.`,
      actionUrl: `/work?item=${item.id}`,
      fingerprint: `outcome-evidence-ready:${item.id}:${checkpoint.day}`,
    });
    collected += 1;
  }
  return { siteSlug, due, collected, missing };
}
