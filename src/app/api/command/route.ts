import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { canAccessSite, hasPermission } from "@/platform/access";
import { buildSiteCommand } from "@/platform/command-read";
import { commandRecords, saveCommandRecord, saveCommandPlans } from "@/platform/command-store";
import { processCommandChecks, queueCommandCheck } from "@/platform/command-jobs";
import { getManagedSite } from "@/platform/site-store";
import { migrationDiff, siteUrl, type PageEvidence } from "@/lib/command-model";
import { SCAN_MODULES, estimateScanCost } from "@/platform/scan-policy";
import type { ScanModule } from "@/platform/types";
import { portfolioCommand } from "@/platform/command-portfolio";
import { sessionFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const site = params.get("site");
  if (!await sessionFromRequest(request)) return NextResponse.json({ error: "Sign in to view this workspace." }, { status: 401 });
  try {
    if (!site) return NextResponse.json(await portfolioCommand(request, params.get("scope") ?? "portfolio", [7, 28, 90].includes(Number(params.get("days"))) ? Number(params.get("days")) : 28));
    if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
    if (!await getManagedSite(site)) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    const data = await buildSiteCommand(site);
    data.permissions = { edit: await hasPermission(request, "manage_content", site), scan: await hasPermission(request, "run_scans", site), settings: await hasPermission(request, "manage_connectors", site) };
    return NextResponse.json(data);
  } catch (error) { console.error("[command-read]", error instanceof Error ? error.message : "Failed"); return NextResponse.json({ error: "Saved evidence could not be loaded. Retry shortly." }, { status: 503 }); }
}

const schema = z.object({
  action: z.enum(["brand", "business_settings", "crawl_settings", "speed", "indexing", "business", "watch_add", "watch_remove", "watch_check", "baseline", "compare", "timeline", "plan_preview", "plan_save", "plan_cancel"]),
  speedProvider: z.enum(["google", "dataforseo"]).optional(),
  crawlPageLimit: z.number().int().min(1).max(5000).optional(), crawlMaxDepth: z.number().int().min(0).max(30).optional(), crawlDelayMs: z.number().int().min(0).max(5000).optional(),
  exclusions: z.array(z.string().trim().min(2).max(200).regex(/^\/(?!\/)[^?#*]*$/, "Use a path prefix, e.g. /account; no wildcards." )).max(50).optional(),
  site: z.string().min(1).max(120).optional(), url: z.string().max(2000).optional(), device: z.enum(["mobile", "desktop"]).optional(),
  terms: z.array(z.string().trim().min(1).max(100)).max(30).optional(), businessEvents: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), z.enum(["enquiry", "booking", "qualified_lead"])).optional(),
  recordKey: z.string().max(240).optional(), title: z.string().trim().min(2).max(200).optional(), date: z.string().datetime({ offset: true }).optional(), type: z.enum(["Content edit", "Technical fix", "Migration", "Campaign", "Other"]).optional(),
  sites: z.array(z.string().min(1).max(120)).min(1).max(50).optional(), modules: z.array(z.string()).min(1).max(11).optional(), cadence: z.enum(["once", "daily", "weekly", "monthly"]).optional(), start: z.string().datetime({ offset: true }).optional(),
});
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Review these details." }, { status: 400 });
  const input = parsed.data;
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Sign in to make changes." }, { status: 401 });
  try {
    if (input.action === "plan_preview" || input.action === "plan_save") {
      const ids = [...new Set(input.sites ?? [])], modules = [...new Set(input.modules ?? [])] as ScanModule[];
      if (!ids.length || !modules.length || modules.some((module) => !SCAN_MODULES.some((item) => item.id === module)) || !input.cadence || !input.start) return NextResponse.json({ error: "Choose websites, tools, schedule and start time." }, { status: 400 });
      const selected = await Promise.all(ids.map((id) => getManagedSite(id)));
      for (const site of selected) if (!site || !await canAccessSite(request, site.id) || !await hasPermission(request, "run_scans", site.id)) return NextResponse.json({ error: "Scan access is required for every selected website." }, { status: 403 });
      const estimate = estimateScanCost(modules), perMonth = input.cadence === "daily" ? 31 : input.cadence === "weekly" ? 5 : 1;
      const blocked = selected.filter((site) => estimate.paidModules.length && site!.spendApproval !== "approved").map((site) => site!.name);
      const preview = { websites: selected.map((site) => ({ id: site!.id, name: site!.name })), modules: estimate.lines, perRun: Number((estimate.estimatedUsd * ids.length).toFixed(2)), monthlyEstimate: Number((estimate.estimatedUsd * ids.length * perMonth).toFixed(2)), start: input.start, cadence: input.cadence, blocked, note: "Estimates vary with data volume. Existing website and $200 monthly portfolio limits are enforced when each scan runs. Scheduled times are picked up by the hourly worker." };
      if (input.action === "plan_preview") return NextResponse.json({ preview });
      if (blocked.length) return NextResponse.json({ error: `Approve spending for ${blocked.join(", ")} before saving this plan.`, preview }, { status: 409 });
      if (Date.parse(input.start) < Date.now() - 60000) return NextResponse.json({ error: "Choose a future start time." }, { status: 400 });
      const planId = crypto.randomUUID();
      await saveCommandPlans(ids, planId, { name: input.title ?? "Scan plan", modules, cadence: input.cadence, estimate: estimate.estimatedUsd, totalSites: ids.length }, session.email, new Date(input.start));
      return NextResponse.json({ ok: true, preview, message: "Scan plan saved. Existing spending limits remain in place." });
    }
    const site = input.site && await getManagedSite(input.site);
    if (!site || !await canAccessSite(request, site.id)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
    const permission = ["speed", "indexing", "business", "watch_check", "plan_cancel"].includes(input.action) ? "run_scans" : ["business_settings", "crawl_settings"].includes(input.action) ? "manage_connectors" : "manage_content";
    if (!await hasPermission(request, permission, site.id)) return NextResponse.json({ error: "Your account cannot make this change for this website." }, { status: 403 });
    const url = input.url ? siteUrl(input.url, site.host) : null;
    if (["speed", "indexing", "watch_add", "watch_remove", "watch_check"].includes(input.action) && !url) return NextResponse.json({ error: "Enter a page URL on the selected website." }, { status: 400 });
    const records = await commandRecords(site.id);
    if (input.action === "crawl_settings") {
      await saveCommandRecord(site.id, "settings", "preferences", {
        crawlExclusions: [...new Set(input.exclusions ?? [])],
        ...(input.crawlPageLimit !== undefined ? { crawlPageLimit: input.crawlPageLimit } : {}),
        ...(input.crawlMaxDepth !== undefined ? { crawlMaxDepth: input.crawlMaxDepth } : {}),
        ...(input.crawlDelayMs !== undefined ? { crawlDelayMs: input.crawlDelayMs } : {}),
      }, { actor: session.email });
      return NextResponse.json({ ok: true, message: "Crawl limits, timing and exclusions saved. Existing evidence is retained." });
    }
    if (input.action === "brand" || input.action === "business_settings") {
      if (input.action === "business_settings" && Object.keys(input.businessEvents ?? {}).length > 20) return NextResponse.json({ error: "Choose at most 20 business events." }, { status: 400 });
      await saveCommandRecord(site.id, "settings", "preferences", { ...(input.action === "brand" ? { brandTerms: input.terms ?? [] } : { businessEvents: input.businessEvents ?? {} }) }, { actor: session.email });
      return NextResponse.json({ ok: true, message: "Preferences saved." });
    }
    if (["speed", "indexing", "business", "watch_check"].includes(input.action)) {
      const kind = input.action === "watch_check" ? "watch_run" : input.action;
      const row = await queueCommandCheck(site.id, kind, { ...(url ? { url } : {}), ...(kind === "speed" ? { device: input.device ?? "mobile", provider: input.speedProvider ?? "google" } : {}) }, session.email);
      after(() => processCommandChecks(row.id));
      return NextResponse.json({ ok: true, record: row, message: "Check queued. You can leave this page; results will be saved." }, { status: 202 });
    }
    if (input.action === "watch_add" || input.action === "watch_remove") {
      if (input.action === "watch_add" && records.filter((row) => row.kind === "watch" && row.status === "active").length >= 50) return NextResponse.json({ error: "This website already has 50 watched URLs." }, { status: 409 });
      await saveCommandRecord(site.id, "watch", createHash("sha256").update(url!).digest("hex"), { url, label: input.title ?? new URL(url!).pathname }, { actor: session.email, status: input.action === "watch_add" ? "active" : "paused", nextRunAt: input.action === "watch_add" ? new Date() : null });
      return NextResponse.json({ ok: true, message: input.action === "watch_add" ? "Page added to daily monitoring." : "Monitoring paused. Previous checks are retained." });
    }
    if (input.action === "timeline") {
      if (!input.title || !input.date || !input.type || Date.parse(input.date) > Date.now()) return NextResponse.json({ error: "Add a title, change type and past date." }, { status: 400 });
      await saveCommandRecord(site.id, "timeline", crypto.randomUUID(), { title: input.title, date: input.date, type: input.type, url }, { actor: session.email });
      return NextResponse.json({ ok: true, message: "Change added to the timeline." });
    }
    if (input.action === "baseline") {
      const data = await buildSiteCommand(site.id);
      const pages = data.pages.map((page) => page.crawl).filter((page): page is PageEvidence => Boolean(page));
      if (!pages.length) return NextResponse.json({ error: "Complete a technical crawl before saving a launch baseline." }, { status: 409 });
      await saveCommandRecord(site.id, "baseline", crypto.randomUUID(), { title: input.title ?? "Launch baseline", pages, capturedAt: new Date().toISOString(), coverage: data.pageCoverage }, { actor: session.email });
      return NextResponse.json({ ok: true, message: "Baseline saved. Later checks will retain these before values." });
    }
    if (input.action === "compare") {
      const baseline = records.find((row) => row.kind === "baseline" && row.recordKey === input.recordKey);
      if (!baseline) return NextResponse.json({ error: "Choose a saved baseline." }, { status: 404 });
      const current = await buildSiteCommand(site.id);
      const pages = current.pages.map((page) => page.crawl).filter((page): page is PageEvidence => Boolean(page));
      const previous = baseline.payload.pages as PageEvidence[];
      if (!pages.length || !pages.some((page) => Date.parse(page.capturedAt) > Date.parse(baseline.createdAt))) return NextResponse.json({ error: "Run a fresh technical crawl after the baseline before comparing." }, { status: 409 });
      const changes = migrationDiff(previous, pages, site.host);
      await saveCommandRecord(site.id, "migration", crypto.randomUUID(), { baselineId: baseline.id, baselineTitle: baseline.payload.title, changes, checkedAt: new Date().toISOString(), beforePages: previous.length, afterPages: pages.length, tracking: "Tracking tags require a direct watched-page check; crawl evidence alone does not verify tracking execution." }, { actor: session.email, status: "completed" });
      return NextResponse.json({ ok: true, message: `${changes.length} URLs changed in the saved crawl comparison.` });
    }
    if (input.action === "plan_cancel") {
      const plan = records.find((row) => row.kind === "plan" && row.recordKey === input.recordKey);
      if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
      await saveCommandRecord(site.id, "plan", plan.recordKey, plan.payload, { actor: session.email, status: "paused" });
      return NextResponse.json({ ok: true, message: "Future runs paused for this website. Already queued scans remain in Scan Centre." });
    }
    return NextResponse.json({ error: "Action unavailable." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save this change." }, { status: 503 }); }
}
