import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { estimateScanCost, FULL_SCAN_MODULES, SCAN_MODULES } from "@/platform/scan-policy";
import { getManagedSite } from "@/platform/site-store";
import type { ScanModule } from "@/platform/types";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScanSchema = z.object({
  siteSlug: z.string().min(1).max(120),
  modules: z.array(z.enum(["google", "rankings", "keywords", "competitors", "technical", "backlinks", "ai", "local", "reliability"])).min(1),
  label: z.string().max(120).optional(),
});

const ActionSchema = z.object({
  jobId: z.string().uuid(),
  action: z.enum(["cancel", "retry"]),
});

type QaJob = {
  id: string;
  siteSlug: string;
  kind: string;
  status: string;
  progress: Record<string, unknown>;
  attempts: number;
  requestedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
};

const qaJobs: QaJob[] = [];

function jobResult(job: typeof schema.platformJobs.$inferSelect | QaJob) {
  return {
    id: job.id,
    siteSlug: job.siteSlug,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    attempts: job.attempts,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
    startedAt: job.startedAt instanceof Date ? job.startedAt.toISOString() : job.startedAt,
    completedAt: job.completedAt instanceof Date ? job.completedAt.toISOString() : job.completedAt,
    lastError: job.lastError,
  };
}

export async function GET(request: Request) {
  const siteSlug = new URL(request.url).searchParams.get("site")?.trim();
  if (!siteSlug) return NextResponse.json({ error: "Choose a website first." }, { status: 400 });
  if (!await canAccessSite(request, siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  const site = await getManagedSite(siteSlug);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const jobs = process.env.QA_SYNTHETIC === "true"
    ? qaJobs.filter((job) => job.siteSlug === siteSlug).slice(0, 30)
    : hasDatabase()
      ? await db().select().from(schema.platformJobs).where(eq(schema.platformJobs.siteSlug, siteSlug)).orderBy(desc(schema.platformJobs.createdAt)).limit(30)
      : [];
  return NextResponse.json({
    ok: true,
    site: {
      id: site.id,
      name: site.name,
      spendApproval: site.spendApproval,
      forecastMonthlyUsd: site.forecastMonthlyUsd,
      approvedMonthlyUsd: site.approvedMonthlyUsd,
      budgetLimits: site.budgetLimits,
    },
    modules: SCAN_MODULES,
    fullScan: estimateScanCost(FULL_SCAN_MODULES),
    jobs: jobs.map(jobResult),
  });
}

export async function POST(request: Request) {
  const parsed = ScanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid scan." }, { status: 400 });
  if (!await canAccessSite(request, parsed.data.siteSlug)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (!await hasPermission(request, "run_scans", parsed.data.siteSlug)) return NextResponse.json({ error: "Run-scan permission required for this website." }, { status: 403 });
  const site = await getManagedSite(parsed.data.siteSlug);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const modules = [...new Set(parsed.data.modules)] as ScanModule[];
  const estimate = estimateScanCost(modules);
  if (estimate.paidModules.length && site.spendApproval !== "approved") {
    return NextResponse.json({ error: "Approve this website's spending limit before running paid modules.", estimate }, { status: 409 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    const now = new Date().toISOString();
    const job: QaJob = {
      id: crypto.randomUUID(), siteSlug: site.id, kind: "site_scan", status: "queued", attempts: 0,
      progress: { modules, label: parsed.data.label ?? "Manual scan", estimate, phase: "queued", completed: [] },
      requestedBy: request.headers.get("x-orwell-user-email"), createdAt: now, startedAt: null, completedAt: null, lastError: null,
    };
    qaJobs.unshift(job);
    return NextResponse.json({ ok: true, synthetic: true, job: jobResult(job), estimate }, { status: 202 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Scan jobs require DATABASE_URL." }, { status: 503 });
  const active = await db().select().from(schema.platformJobs).where(and(
    eq(schema.platformJobs.siteSlug, site.id),
    eq(schema.platformJobs.kind, "site_scan"),
    inArray(schema.platformJobs.status, ["queued", "running"]),
  )).orderBy(desc(schema.platformJobs.createdAt)).limit(1);
  if (active[0]) return NextResponse.json({ error: "A website scan is already queued or running.", job: jobResult(active[0]) }, { status: 409 });
  const [job] = await db().insert(schema.platformJobs).values({
    siteSlug: site.id,
    kind: "site_scan",
    requestedBy: request.headers.get("x-orwell-user-email"),
    progress: { modules, label: parsed.data.label ?? "Manual scan", estimate, phase: "queued", completed: [] },
  }).returning();
  await db().insert(schema.accessAuditEvents).values({
    siteSlug: site.id,
    actorEmail: request.headers.get("x-orwell-user-email"),
    actorRole: request.headers.get("x-orwell-user-role"),
    action: "scan_queued",
    area: "scan_centre",
    summary: `Queued ${modules.length}-module scan.`,
    metadata: { modules, estimatedUsd: estimate.estimatedUsd },
  });
  return NextResponse.json({ ok: true, job: jobResult(job!), estimate }, { status: 202 });
}

export async function PATCH(request: Request) {
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid job action." }, { status: 400 });
  if (process.env.QA_SYNTHETIC === "true") {
    const job = qaJobs.find((item) => item.id === parsed.data.jobId);
    if (!job) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    if (!await canAccessSite(request, job.siteSlug) || !await hasPermission(request, "run_scans", job.siteSlug)) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    job.status = parsed.data.action === "retry" ? "queued" : "cancelled";
    job.lastError = null;
    return NextResponse.json({ ok: true, job: jobResult(job) });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Scan jobs require DATABASE_URL." }, { status: 503 });
  const [job] = await db().select().from(schema.platformJobs).where(eq(schema.platformJobs.id, parsed.data.jobId)).limit(1);
  if (!job || !await canAccessSite(request, job.siteSlug)) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  if (!await hasPermission(request, "run_scans", job.siteSlug)) return NextResponse.json({ error: "Run-scan permission required for this website." }, { status: 403 });
  if (parsed.data.action === "cancel" && !["queued", "running"].includes(job.status)) return NextResponse.json({ error: "Only active scans can be cancelled." }, { status: 409 });
  if (parsed.data.action === "retry" && !["failed", "cancelled"].includes(job.status)) return NextResponse.json({ error: "Only failed or cancelled scans can be retried." }, { status: 409 });
  const [updated] = await db().update(schema.platformJobs).set(parsed.data.action === "retry"
    ? { status: "queued", runAfter: new Date(), startedAt: null, completedAt: null, lastError: null, progress: { ...job.progress, phase: "queued", completed: [] } }
    : { status: "cancelled", completedAt: new Date(), progress: { ...job.progress, phase: "cancelled" } }
  ).where(eq(schema.platformJobs.id, job.id)).returning();
  return NextResponse.json({ ok: true, job: jobResult(updated!) });
}
