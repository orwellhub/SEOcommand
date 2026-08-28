import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { baselineFromSnapshots } from "@/platform/outcome-evidence";
import { readLatestSnapshots } from "@/sync/store";

const SITE_SLUG = "mortgagecompare";
const OWNER_EMAIL = "garethdeansomers@gmail.com";
const DUE_DATE = "2026-09-04";
const ACTOR_EMAIL = "codex-production-activation@orwell.local";

export type MortgageCompareActivation = {
  findingKey: string;
  title: string;
  priorityScore: number;
  targetUrl: string;
  targetKeywords: string[];
  evidence: { clicks: number; impressions: number; position: number };
};

export const MORTGAGECOMPARE_ACTIVATION_COHORT: MortgageCompareActivation[] = [
  {
    findingKey: "calculator-refresh-dib-2026-08",
    title: "Refresh DIB mortgage calculator landing page",
    priorityScore: 92,
    targetUrl: "https://mortgagecompare.ae/calculators/dib-mortgage-calculator.html",
    targetKeywords: [
      "dib loan calculator",
      "dib mortgage calculator",
      "dib home loan calculator",
      "dubai islamic bank home loan calculator",
      "dib calculator",
      "dubai islamic home loan calculator",
      "dubai islamic bank mortgage calculator",
      "home loan calculator dubai islamic bank",
    ],
    evidence: { clicks: 3, impressions: 1229, position: 8.2 },
  },
  {
    findingKey: "calculator-refresh-enbd-2026-08",
    title: "Refresh Emirates NBD mortgage calculator landing page",
    priorityScore: 90,
    targetUrl: "https://mortgagecompare.ae/calculators/emirates-nbd-mortgage-calculator.html",
    targetKeywords: [
      "nbd mortgage calculator",
      "emirates nbd mortgage calculator",
      "emirates nbd home loan calculator",
      "nbd home loan calculator",
      "emirates nbd mortgage loan calculator",
      "emirates nbd house loan calculator",
      "emirates nbd home loan",
      "emirates nbd mortgage",
    ],
    evidence: { clicks: 7, impressions: 1041, position: 7.5 },
  },
  {
    findingKey: "calculator-refresh-fab-2026-08",
    title: "Refresh FAB mortgage calculator landing page",
    priorityScore: 88,
    targetUrl: "https://mortgagecompare.ae/calculators/fab-mortgage-calculator.html",
    targetKeywords: [
      "fab mortgage calculator",
      "fab loan calculator",
      "fab home loan calculator",
      "fab mortgage rate",
      "fab home loan",
      "mortgage calculator abu dhabi",
      "fab mortgage",
      "mortgage calculator fab",
    ],
    evidence: { clicks: 0, impressions: 907, position: 9.1 },
  },
];

export async function activateMortgageCompareCohort(now = new Date()) {
  const snapshots = await readLatestSnapshots(SITE_SLUG);
  const gscSnapshot = snapshots.find((snapshot) => snapshot.dataset === "gsc_query_pages");
  if (!gscSnapshot) {
    throw new Error("MortgageCompare activation requires a stored gsc_query_pages snapshot.");
  }

  return db().transaction(async (tx) => {
    const results: Array<{ findingKey: string; id: string; created: boolean }> = [];
    for (const activation of MORTGAGECOMPARE_ACTIVATION_COHORT) {
      const recommendationKey = `finding:${activation.findingKey}`;
      const sourceEvidence = {
        kind: "gsc_query_page_cohort",
        dataset: "gsc_query_pages",
        cohortId: "mortgage-calculator-refresh-2026-08",
        clicks: activation.evidence.clicks,
        impressions: activation.evidence.impressions,
        position: activation.evidence.position,
        capturedOn: gscSnapshot.capturedOn,
        executionHypothesis: "A consistent calculator-page content and conversion refresh will improve qualified organic visibility and engagement.",
      };
      const executionData = {
        targetKeywords: activation.targetKeywords,
        cohortId: "mortgage-calculator-refresh-2026-08",
        playbook: "calculator-refresh-v1",
      };
      const verification = baselineFromSnapshots({
        domainSlug: SITE_SLUG,
        sourceEvidence,
        targetUrl: activation.targetUrl,
        plannedUrl: null,
        executionData,
      }, snapshots, now);

      const [created] = await tx.insert(schema.workflowItems).values({
        domainSlug: SITE_SLUG,
        recommendationKey,
        decision: "approved",
        title: activation.title,
        module: "Content",
        effort: "M",
        priorityScore: activation.priorityScore,
        status: "in_progress",
        sourceUrl: "/research?site=mortgagecompare",
        sourceEvidence,
        executionType: "refresh_brief",
        ownerEmail: OWNER_EMAIL,
        dueDate: DUE_DATE,
        pageMode: "existing_page",
        targetUrl: activation.targetUrl,
        plannedUrl: null,
        executionData,
        verification,
        createdBy: ACTOR_EMAIL,
        updatedAt: now,
      }).onConflictDoNothing().returning();

      if (!created) {
        const [existing] = await tx.select({ id: schema.workflowItems.id })
          .from(schema.workflowItems)
          .where(and(eq(schema.workflowItems.domainSlug, SITE_SLUG), eq(schema.workflowItems.recommendationKey, recommendationKey)))
          .limit(1);
        if (!existing) throw new Error(`Activation conflict could not be resolved for ${activation.findingKey}.`);
        results.push({ findingKey: activation.findingKey, id: existing.id, created: false });
        continue;
      }

      await tx.insert(schema.workflowStatusHistory).values([
        { workflowItemId: created.id, fromStatus: null, toStatus: "approved", changedBy: ACTOR_EMAIL, note: "MortgageCompare calculator cohort approved by the user." },
        { workflowItemId: created.id, fromStatus: "approved", toStatus: "in_progress", changedBy: ACTOR_EMAIL, note: "Baseline captured from stored GSC/GA4 evidence before execution." },
      ]);
      await tx.insert(schema.accessAuditEvents).values({
        siteSlug: SITE_SLUG,
        actorEmail: ACTOR_EMAIL,
        actorRole: "automation",
        action: "workflow.cohort_activated",
        area: "workflow",
        summary: `Activated approved work: ${activation.title}`,
        metadata: {
          findingKey: activation.findingKey,
          cohortId: "mortgage-calculator-refresh-2026-08",
          executionType: "refresh_brief",
          ownerEmail: OWNER_EMAIL,
          dueDate: DUE_DATE,
          targetUrl: activation.targetUrl,
          baselineMode: verification.baseline?.provenance?.mode ?? "unknown",
        },
      });
      results.push({ findingKey: activation.findingKey, id: created.id, created: true });
    }
    return results;
  });
}
