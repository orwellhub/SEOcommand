import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { accessibleSiteSlugs, canAccessSite } from "@/platform/access";
import { buildLearningSignals, buildOutcomeRow } from "@/platform/outcome-ledger";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function qaItems(siteSlug = "mortgagecompare") {
  const outcomes = ["won", "inconclusive", "lost", "awaiting_data"] as const;
  return outcomes.map((outcome, index) => buildOutcomeRow({ id: `76000000-0000-4000-8000-00000000000${index + 1}`, domainSlug: siteSlug, recommendationKey: `finding:qa-${index}`, decision: "approved", title: ["Refresh mortgage comparison guide", "Repair canonical mapping", "Build lender guide links", "Improve first-time buyer page"][index]!, module: ["Content", "Technical", "Backlinks", "Content"][index]!, effort: "M", priorityScore: 88 - index * 6, status: outcome === "awaiting_data" ? "verifying" : "done", sourceUrl: `/content?site=${siteSlug}`, sourceEvidence: { kind: index === 1 ? "technical_issue" : "gsc_page", clicks: 100 + index * 20, impressions: 4000 + index * 500 }, opportunityId: null, executionType: ["refresh_brief", "technical_task", "link_prospect_list", "content_brief"][index]!, ownerEmail: index % 2 ? "technical@orwell.local" : "seo@orwell.local", dueDate: null, pageMode: "existing_page", targetUrl: `https://${siteSlug}.example/page-${index + 1}`, plannedUrl: null, executionData: {}, verification: { baseline: { capturedAt: "2026-07-20T00:00:00Z", metrics: [{ key: "clicks", label: "Clicks", value: 100 + index * 20, unit: "count", source: "gsc_page" }] }, shipment: { recordedAt: "2026-08-01T00:00:00Z", note: "Deployed", url: `https://${siteSlug}.example/page-${index + 1}` }, checkpoints: [{ day: 7, dueAt: "2026-08-08T00:00:00Z", status: "recorded", recordedAt: "2026-08-08T00:00:00Z", metrics: [{ key: "clicks", label: "Clicks", value: outcome === "won" ? 154 : outcome === "lost" ? 91 : 122, unit: "count", source: "gsc_page" }] }, { day: 14, dueAt: "2026-08-15T00:00:00Z", status: outcome === "awaiting_data" ? "scheduled" : "recorded", recordedAt: outcome === "awaiting_data" ? undefined : "2026-08-15T00:00:00Z", metrics: outcome === "awaiting_data" ? undefined : [{ key: "clicks", label: "Clicks", value: outcome === "won" ? 168 : outcome === "lost" ? 82 : 123, unit: "count", source: "gsc_page" }] }, { day: 28, dueAt: "2026-08-29T00:00:00Z", status: "scheduled" }], outcome, confidence: outcome === "awaiting_data" ? undefined : "medium", alternativeExplanations: outcome === "won" ? ["Seasonal demand may explain part of the increase."] : [], valueCreated: outcome === "won" ? { amount: 2400, currency: "AED", method: "estimated", assumption: "Incremental leads × recorded lead value" } : null }, shippedAt: new Date("2026-08-01T00:00:00Z"), verifiedAt: outcome === "awaiting_data" ? null : new Date("2026-08-15T00:00:00Z"), createdBy: "qa@orwell.local", createdAt: new Date("2026-07-18T00:00:00Z"), updatedAt: new Date("2026-08-15T00:00:00Z") }));
}

export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site")?.trim() ?? "";
  if (site && !await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") { const rows = qaItems(site || "mortgagecompare"); return NextResponse.json(response(rows), { status: 200 }); }
  if (!hasDatabase()) return NextResponse.json({ error: "Outcome ledger requires DATABASE_URL." }, { status: 503 });
  const allowed = site ? [site] : await accessibleSiteSlugs(request);
  if (allowed?.length === 0) return NextResponse.json(response([]));
  const items = await db().select().from(schema.workflowItems).where(and(eq(schema.workflowItems.decision, "approved"), allowed ? inArray(schema.workflowItems.domainSlug, allowed) : undefined)).orderBy(desc(schema.workflowItems.shippedAt), desc(schema.workflowItems.updatedAt)).limit(1000);
  return NextResponse.json(response(items.map(buildOutcomeRow)));
}

function response(rows: ReturnType<typeof buildOutcomeRow>[]) {
  const learning = buildLearningSignals(rows);
  const values = rows.map((row) => row.verification.valueCreated).filter(Boolean);
  return { rows, learning, summary: { total: rows.length, shipped: rows.filter((row) => row.proof.shipped).length, verified: rows.filter((row) => row.proof.verified).length, won: rows.filter((row) => row.verification.outcome === "won").length, lost: rows.filter((row) => row.verification.outcome === "lost").length, inconclusive: rows.filter((row) => row.verification.outcome === "inconclusive").length, awaitingData: rows.filter((row) => !row.proof.verified).length, valueByCurrency: Object.entries(values.reduce<Record<string, number>>((all, value) => { if (value) all[value.currency] = (all[value.currency] ?? 0) + value.amount; return all; }, {})).map(([currency, amount]) => ({ currency, amount })) } };
}
