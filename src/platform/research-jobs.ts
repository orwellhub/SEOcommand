import { and, desc, eq, inArray, like, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { BudgetExceededError } from "@/providers/dataforseo/errors";
import { getDataForSeoClient } from "@/providers/dataforseo";
import { normalizeResearch } from "@/providers/dataforseo/research-normalizers";
import { clusterSearchResults, researchKind, researchReportLabels, type EvidenceReport, type ResearchFeature, type ResearchPayload, type ResearchRun } from "@/lib/research-evidence";
import { getManagedSite } from "./site-store";

import { nextResearchPage, researchCanResume } from "@/lib/research-pagination";
const records = schema.commandRecords;
function serialize(row: typeof records.$inferSelect): ResearchRun {
  const feature = row.kind.replace(/^research_/, "") as ResearchFeature;
  const payload = row.payload as ResearchPayload;
  return { id: row.id, siteSlug: row.siteSlug, feature, status: row.status, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), nextRunAt: row.nextRunAt?.toISOString() ?? null, payload: { ...payload, report: researchReportLabels(feature, payload.report), units: payload.units.map(unit => ({ ...unit, report: researchReportLabels(feature, unit.report) })) } };
}
export async function researchRuns(siteSlug: string, feature: ResearchFeature, offset = 0) {
  if (!hasDatabase()) return [];
  return (await db().select().from(records).where(and(eq(records.siteSlug, siteSlug), eq(records.kind, researchKind(feature)))).orderBy(desc(records.createdAt)).limit(12).offset(offset)).map(serialize);
}
export async function researchRun(siteSlug: string, feature: ResearchFeature, id: string) {
  if (!hasDatabase()) return null;
  const [row] = await db().select().from(records).where(and(eq(records.siteSlug, siteSlug), eq(records.kind, researchKind(feature)), eq(records.id, id))).limit(1);
  return row ? serialize(row) : null;
}
export async function queueResearch(siteSlug: string, payload: ResearchPayload, actor: string) {
  if (!hasDatabase()) throw new Error("The workspace database is required to save research.");
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`research:${siteSlug}:${payload.input.feature}`}))`);
    const [active] = await tx.select().from(records).where(and(eq(records.siteSlug, siteSlug), eq(records.kind, researchKind(payload.input.feature)), inArray(records.status, ["queued", "running", "waiting"])));
    if (active) throw new Error("This research is already queued or running. Open its saved progress before collecting again.");
    const [row] = await tx.insert(records).values({ siteSlug, kind: researchKind(payload.input.feature), recordKey: crypto.randomUUID(), payload, createdBy: actor, status: "queued", nextRunAt: new Date() }).returning();
    return serialize(row!);
  });
}
export async function cancelResearch(siteSlug: string, id: string) {
  const [row] = await db().update(records).set({ status: "cancelled", updatedAt: new Date(), nextRunAt: null }).where(and(eq(records.id, id), eq(records.siteSlug, siteSlug), like(records.kind, "research_%"), inArray(records.status, ["queued", "running", "waiting"]))).returning();
  if (!row) throw new Error("This collection is no longer active.");
  return serialize(row);
}

export function combinedResearchReport(payload: ResearchPayload): EvidenceReport {
  const complete = payload.units.filter((unit) => unit.status === "completed");
  if (payload.input.feature === "clusters") {
    const samples = complete.map((unit) => ({ keyword: unit.label, urls: unit.report?.tables[0]?.rows.map((row) => row.url).filter((url): url is string => !!url) ?? [] }));
    const excluded = samples.filter((sample) => sample.urls.length < 3).map((sample) => sample.keyword);
    return { tables: [{ title: "Keyword groups sharing search results", columns: ["Keywords", "Minimum shared URLs"], rows: clusterSearchResults(samples), total: null, note: "Every pair in a group shares at least three URLs from its top ten organic results. This suggests shared intent; review before assigning one page." }], series: [], notes: [...payload.notes, ...(excluded.length ? [`Insufficient organic results for: ${excluded.join(", ")}.`] : [])] };
  }
  const groups = new Map<string, EvidenceReport["tables"][number]>();
  for (const unit of complete) for (const table of unit.report?.tables ?? []) {
    const old = groups.get(table.title);
    const rows = [...new Map([...(old?.rows ?? []), ...table.rows].map(row => [row.label + (row.url ?? ""), row])).values()].map((row, i) => ({ ...row, id: String(i) }));
    groups.set(table.title, { ...table, rows });
  }
  const tables = [...groups.values()];
  return { tables: payload.input.feature === "questions" ? tables.filter((table) => table.title.endsWith(": customer questions")) : tables, series: complete.flatMap((unit) => unit.report?.series ?? []), notes: [...payload.notes, ...complete.flatMap((unit) => unit.report?.notes ?? [])] };
}

/** Each unit is checkpointed before and after a paid request. Uncertain requests are never replayed. */
export async function processResearchJobs(id?: string, shouldStop: () => boolean = () => false) {
  if (!hasDatabase()) return;
  const stale = new Date(Date.now() - 15 * 60000);
  await db().update(records).set({ status: "failed", nextRunAt: null, updatedAt: new Date(), payload: sql`${records.payload} || '{"error":"Collection interrupted. Saved evidence is retained. Any request with an uncertain response has not been retried; check provider charges before starting another collection."}'::jsonb` }).where(and(like(records.kind, "research_%"), eq(records.status, "running"), lte(records.updatedAt, stale)));
  const due = await db().select({ id: records.id }).from(records).where(and(like(records.kind, "research_%"), inArray(records.status, ["queued", "waiting"]), or(lte(records.nextRunAt, new Date()), sql`${records.nextRunAt} is null`), id ? eq(records.id, id) : undefined)).orderBy(records.createdAt).limit(id ? 1 : 5);
  const deadline = Date.now() + 180000;
  for (const candidate of due) {
    if (shouldStop() || Date.now() > deadline) break;
    const lease = crypto.randomUUID();
    const [claimed] = await db().update(records).set({ status: "running", updatedAt: new Date(), payload: sql`${records.payload} || ${JSON.stringify({ lease })}::jsonb` }).where(and(eq(records.id, candidate.id), inArray(records.status, ["queued", "waiting"]))).returning();
    if (!claimed) continue;
    const payload = claimed.payload as ResearchPayload;
    const owns = and(eq(records.id, claimed.id), sql`${records.payload}->>'lease' = ${lease}`, inArray(records.status, ["running", "cancelled"]));
    async function checkpoint(status: string, nextRunAt: Date | null = null) {
      payload.report = combinedResearchReport(payload);
      const [row] = await db().update(records).set({ payload, status: sql`case when ${records.status} = 'cancelled' then 'cancelled' else ${status} end`, updatedAt: new Date(), nextRunAt }).where(owns).returning({ status: records.status });
      return row?.status === "cancelled" || !row;
    }
    try {
      const site = await getManagedSite(claimed.siteSlug);
      if (!site || site.archivedAt) throw new Error("This website is no longer active.");
      if (process.env.QA_SYNTHETIC === "true") throw new Error("Paid research is disabled in the preview environment.");
      const client = getDataForSeoClient();
      for (const unit of payload.units) {
        if (unit.status === "completed") continue;
        if (shouldStop() || Date.now() > deadline) break;
        if (unit.status === "running") throw new Error("The previous request has an uncertain result and will not be charged again automatically.");
        if (unit.taskId) {
          const raw = await client.fetchReviewTask(unit.taskId);
          if (raw === null) { unit.status = "waiting"; continue; }
          unit.report = normalizeResearch(unit, raw); unit.collectedAt = new Date().toISOString(); unit.status = "completed";
        } else {
          unit.status = "running"; unit.chargeId = crypto.randomUUID(); unit.startedAt = new Date().toISOString();
          if (await checkpoint("running")) break;
          const options = { domainSlug: claimed.siteSlug, estimateUsd: unit.estimateUsd, retry: false, requestId: unit.chargeId };
          if (unit.mode === "reviews") {
            const posted = await client.postTask(unit.endpoint, unit.path, [unit.body], options);
            if (!posted.taskId) throw new Error("The provider did not return a review task ID. Check provider charges before collecting again.");
            unit.taskId = posted.taskId; unit.costUsd = posted.costUsd; unit.status = "waiting";
          } else {
            const result = await client.post<Record<string, unknown>>(unit.endpoint, unit.path, [unit.body], options);
            const next = nextResearchPage(unit, result.result);
            unit.costUsd = result.costUsd; unit.report = normalizeResearch(unit, result.result); unit.collectedAt = new Date().toISOString(); unit.status = "completed";
            if (next) payload.units.push(next);
          }
        }
        if (await checkpoint("running")) break;
      }
      const done = payload.units.every((unit) => unit.status === "completed");
      const waiting = !done && payload.units.some((unit) => unit.status === "waiting");
      await checkpoint(done ? "completed" : waiting ? "waiting" : "queued", done ? null : new Date(Date.now() + (waiting ? 60000 : 1000)));
    } catch (error) {
      if (error instanceof BudgetExceededError) for (const unit of payload.units) if (unit.status === "running") { unit.status = undefined; unit.chargeId = undefined; unit.startedAt = undefined; }
      payload.error = error instanceof Error ? error.message : "Research collection failed.";
      await checkpoint("failed");
    }
  }
}

export async function resumeResearch(siteSlug: string, id: string) {
  return db().transaction(async tx => {
    const [row] = await tx.select().from(records).where(and(eq(records.id, id), eq(records.siteSlug, siteSlug), like(records.kind, "research_%"))).for("update");
    if (!row || !["failed", "cancelled"].includes(row.status)) throw new Error("Choose an interrupted collection.");
    const payload = row.payload as ResearchPayload;
    if (!researchCanResume(payload.units)) throw new Error("This collection has no safe pending requests. Completed evidence is retained; uncertain paid requests require provider review.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`research:${siteSlug}:${payload.input.feature}`}))`);
    const [active] = await tx.select().from(records).where(and(eq(records.siteSlug, siteSlug), eq(records.kind, row.kind), inArray(records.status, ["queued", "running", "waiting"])));
    if (active) throw new Error("Finish the active collection before resuming this one.");
    delete payload.error; delete payload.lease;
    const [saved] = await tx.update(records).set({ payload, status: "queued", nextRunAt: new Date(), updatedAt: new Date() }).where(eq(records.id, id)).returning();
    return serialize(saved!);
  });
}
