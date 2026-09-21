import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sourceHealth } from "@/lib/source-health";
import { buildDomainBundle } from "@/sync/bundle";
import { hasDatabase } from "@/sync/store";
import { commandRecords, completedIndexInspections } from "./command-store";
import { summarizePageCoverage } from "@/lib/page-coverage";
import { getManagedSite } from "./site-store";
import type { ManagedSite } from "./types";
import { latestAiCrawlerAudit } from "./observations";
import { aiAccessSeverity, allowsTraining } from "./ai-crawler-audit";
import { qaAiReadiness } from "@/data/qa-fixtures";
import { groupCauses, segmentBrand, suggestLinks, unifiedPages, type AiReadiness, type BusinessResult, type CommandTask, type HealthRow, type PageEvidence, type SiteCommand, type TimelineEntry } from "@/lib/command-model";

export async function pageInventory(siteSlug: string) {
  if (!hasDatabase() || process.env.QA_SYNTHETIC === "true") return { pages: [] as PageEvidence[], edges: [] as { sourceUrl: string; targetUrl: string }[], saved: 0, capturedAt: null as string | null };
  const [run] = await db().select().from(schema.browserCrawlRuns).where(and(eq(schema.browserCrawlRuns.siteSlug, siteSlug), eq(schema.browserCrawlRuns.status, "completed"), sql`coalesce(${schema.browserCrawlRuns.diffSummary}->>'singlePage', '0') = '0'`)).orderBy(desc(schema.browserCrawlRuns.completedAt)).limit(1);
  if (run) {
    const [pages, edges] = await Promise.all([
      db().select().from(schema.browserCrawlPages).where(eq(schema.browserCrawlPages.runId, run.id)).limit(10000),
      db().select({ sourceUrl: schema.browserCrawlEdges.sourceUrl, targetUrl: schema.browserCrawlEdges.targetUrl }).from(schema.browserCrawlEdges).where(eq(schema.browserCrawlEdges.runId, run.id)).limit(100000),
    ]);
    return { pages: pages.map((row): PageEvidence => ({ url: row.url, finalUrl: row.finalUrl, title: row.renderedTitle ?? row.rawTitle, statusCode: row.statusCode, canonical: row.canonical, indexable: row.issues.includes("browser_render_failed") ? null : row.indexable, hash: row.renderedHash, tracking: null, capturedAt: row.capturedAt.toISOString(), issues: row.issues })), edges, saved: run.pagesCrawled, capturedAt: run.completedAt?.toISOString() ?? null };
  }
  const [inventory] = await db().select().from(schema.detailedCrawlRuns).where(and(eq(schema.detailedCrawlRuns.siteSlug, siteSlug), eq(schema.detailedCrawlRuns.status, "completed"))).orderBy(desc(schema.detailedCrawlRuns.completedAt)).limit(1);
  if (!inventory) return { pages: [] as PageEvidence[], edges: [], saved: 0, capturedAt: null };
  const rows = await db().select().from(schema.detailedCrawlPages).where(eq(schema.detailedCrawlPages.runId, inventory.id)).limit(10000);
  return { pages: rows.map((row): PageEvidence => ({ url: row.url, finalUrl: null, title: row.title, statusCode: row.statusCode, canonical: row.canonical, indexable: typeof row.checks.is_indexable === "boolean" ? row.checks.is_indexable : null, hash: null, tracking: null, capturedAt: row.capturedAt.toISOString(), issues: [] })), edges: [], saved: inventory.pagesCrawled, capturedAt: null };
}

/** Issue ids that decide whether a page can be quoted in an AI answer. */
const AI_ANSWER_CHECKS = ["ai_snippet_blocked", "ai_snippet_limited", "ai_partial_nosnippet", "javascript_dependent_content", "not_indexable"];

/**
 * Assemble AI readiness from evidence already collected elsewhere: the saved
 * robots.txt audit, the hourly reliability check and the crawl inventory.
 * Nothing is fetched here, so every section can legitimately be "not checked".
 */
async function aiReadiness(site: ManagedSite, pages: PageEvidence[], capturedAt: string | null): Promise<AiReadiness> {
  if (process.env.QA_SYNTHETIC === "true") return qaAiReadiness(site.id);
  const empty: AiReadiness = {
    botAccess: { capturedOn: null, rows: [] },
    discovery: { checkedAt: null, llms: null, xRobotsTag: null, robotsSitemapDirective: null },
    answers: { capturedAt: null, pages: 0, counts: [] },
  };
  if (!hasDatabase()) return empty;
  const trainingAllowed = allowsTraining(site);
  const [audit, reliability] = await Promise.all([
    latestAiCrawlerAudit(site.id).catch(() => []),
    db().select().from(schema.reliabilityChecks).where(eq(schema.reliabilityChecks.siteSlug, site.id))
      .orderBy(desc(schema.reliabilityChecks.checkedAt)).limit(1).catch(() => []),
  ]);
  const order = { blocked: 0, partial: 1, unknown: 2, allowed: 3 } as const;
  const rows = audit.map((row) => {
    const details = (row.details ?? {}) as { samples?: string[]; governs?: string };
    const access = row.access as AiReadiness["botAccess"]["rows"][number]["access"];
    const category = row.category as AiReadiness["botAccess"]["rows"][number]["category"];
    return {
      bot: row.bot, category, access, evidence: row.evidence ?? "",
      severity: aiAccessSeverity({ access, category }, trainingAllowed),
      checkedPages: row.checkedPages, blockedPages: row.blockedPages,
      samples: Array.isArray(details.samples) ? details.samples : [],
      governs: typeof details.governs === "string" ? details.governs : null,
    };
  }).sort((a, b) => (order[a.access] ?? 9) - (order[b.access] ?? 9) || a.bot.localeCompare(b.bot));
  const check = reliability[0];
  const details = (check?.details ?? {}) as Record<string, unknown>;
  const llms = details.llms as AiReadiness["discovery"]["llms"];
  const xRobots = details.xRobotsTag as AiReadiness["discovery"]["xRobotsTag"];
  const counts = AI_ANSWER_CHECKS
    .map((id) => ({ id, pages: pages.filter((page) => page.issues.includes(id)).length }))
    .filter((row) => row.pages > 0);
  return {
    botAccess: { capturedOn: audit[0]?.capturedOn ?? null, rows },
    discovery: {
      checkedAt: check?.checkedAt?.toISOString() ?? null,
      llms: llms ?? null,
      xRobotsTag: xRobots ?? null,
      robotsSitemapDirective: typeof details.robotsSitemapDirective === "boolean" ? details.robotsSitemapDirective : null,
    },
    answers: { capturedAt, pages: pages.length, counts },
  };
}

export async function buildSiteCommand(siteSlug: string): Promise<SiteCommand> {
  const site = await getManagedSite(siteSlug);
  if (!site) throw new Error("Website not found.");
  const synthetic = process.env.QA_SYNTHETIC === "true";
  const [bundle, records, inventory, work, jobs, inspections] = await Promise.all([
    buildDomainBundle(siteSlug), commandRecords(siteSlug), pageInventory(siteSlug),
    hasDatabase() && !synthetic ? db().select().from(schema.workflowItems).where(eq(schema.workflowItems.domainSlug, siteSlug)).orderBy(desc(schema.workflowItems.updatedAt)).limit(500) : [],
    hasDatabase() && !synthetic ? db().select().from(schema.platformJobs).where(eq(schema.platformJobs.siteSlug, siteSlug)).orderBy(desc(schema.platformJobs.createdAt)).limit(30) : [],
    completedIndexInspections(siteSlug),
  ]);
  const tasks: CommandTask[] = work.filter((row) => row.decision === "approved").map((row) => ({ id: row.id, title: row.title, status: row.status, targetUrl: row.targetUrl, shippedAt: row.shippedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }));
  const settings = records.find((row) => row.kind === "settings")?.payload ?? {};
  const brandTerms = Array.isArray(settings.brandTerms) ? settings.brandTerms.filter((term): term is string => typeof term === "string") : [site.name, site.host.replace(/^www\./, "").split(".")[0]!];
  const watched = records.filter((row) => row.kind === "watch" && row.status === "active").map((row) => String(row.payload.url));
  const latestWatch = new Map<string, PageEvidence>();
  for (const row of records.filter((item) => item.kind === "watch_run" && item.status === "completed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const page = row.payload as unknown as PageEvidence;
    if (!latestWatch.has(page.url)) latestWatch.set(page.url, page);
  }
  const evidence = inventory.pages.map((page) => { const direct = latestWatch.get(page.url); latestWatch.delete(page.url); return direct && direct.capturedAt > page.capturedAt ? direct : page; });
  const pages = unifiedPages(site.host, bundle, [...evidence, ...latestWatch.values()], tasks, watched, inspections.map((row) => String(row.payload.url)));
  const timeline: TimelineEntry[] = [
    ...tasks.filter((row) => row.shippedAt).map((row) => ({ id: row.id, date: row.shippedAt!, title: row.title, type: "Shipped work", url: row.targetUrl, href: `/outcomes?site=${siteSlug}&item=${row.id}` })),
    ...records.filter((row) => row.kind === "timeline").map((row) => ({ id: row.id, date: String(row.payload.date), title: String(row.payload.title), type: String(row.payload.type), url: typeof row.payload.url === "string" ? row.payload.url : null, href: `/performance?site=${siteSlug}&view=timeline` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const ds = bundle.datasets;
  const sources = [
    { id: "google", label: "Search Console", data: ds.gsc_timeseries ?? ds.gsc_totals, mapped: Boolean(site.gscSite), href: `/research?site=${siteSlug}`, days: 4 },
    { id: "google", label: "Google Analytics", data: ds.ga4_dashboard ?? ds.ga4_overview, mapped: Boolean(site.ga4PropertyId), href: `/performance?site=${siteSlug}&view=business`, days: 4 },
    { id: "keywords", label: "Keywords", data: ds.keywords, mapped: true, href: `/rankings?site=${siteSlug}`, days: 8 },
    { id: "technical", label: "Site audit", data: ds.onpage, mapped: true, href: `/health?site=${siteSlug}`, days: 31 },
    { id: "backlinks", label: "Backlinks", data: ds.backlinks, mapped: true, href: `/backlinks?site=${siteSlug}`, days: 31 },
  ];
  const freshness = sourceHealth(bundle);
  const health: HealthRow[] = sources.map((source) => {
    const at = source.data?.provenance.collectedAt ?? null;
    const failed = jobs.find((job) => (job.progress.modules as string[] | undefined)?.includes(source.id) && ["failed", "completed"].includes(job.status));
    const own = freshness.find((row) => row.label === source.label);
    const latestFailed = failed?.status === "failed" && (!at || (failed.completedAt ?? failed.startedAt ?? failed.createdAt).getTime() > Date.parse(at));
    const state = !source.mapped ? "needs_connection" : latestFailed ? "failed" : !at ? "missing" : own?.state === "stale" ? "stale" : "ready";
    const next = records.filter((row) => row.kind === "plan" && row.status === "active" && (row.payload.modules as string[] | undefined)?.includes(source.id)).map((row) => row.nextRunAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    return { lastAttemptAt: failed ? (failed.completedAt ?? failed.startedAt ?? failed.createdAt).toISOString() : null, lastAttemptStatus: failed?.status ?? null, id: `${source.id}:${source.label}`, label: source.label, state, updatedAt: at, through: own?.through ?? null, href: !source.mapped ? `/sites/${siteSlug}/settings` : state === "ready" ? source.href : `/scan-centre?site=${siteSlug}&module=${source.id}`, detail: !source.mapped ? "Connect this website’s property" : latestFailed ? "Latest scan failed; any earlier saved data is retained" : !at ? "No saved results yet" : "Collection time and reporting period are shown separately", nextRunAt: next };
  });
  const readiness = await aiReadiness(site, inventory.pages, inventory.capturedAt);
  const business = records.find((row) => row.kind === "business" && row.status === "completed")?.payload as BusinessResult | undefined;
  return { site: { id: site.id, name: site.name, host: site.host }, generatedAt: new Date().toISOString(), synthetic, storageAvailable: hasDatabase() || synthetic, bundle, pages, pageCoverage: { loaded: inventory.pages.length, saved: inventory.saved }, pageStats: summarizePageCoverage({ host: site.host, pages, inspections }), records: [...records.filter((row) => row.kind !== "indexing" || row.status !== "completed"), ...inspections].map((row) => row.kind === "baseline" ? { ...row, payload: { title: row.payload.title, pageCount: (row.payload.pages as unknown[] | undefined)?.length ?? 0, capturedAt: row.payload.capturedAt, coverage: row.payload.coverage } } : row), tasks, timeline, health, brandTerms, brand: segmentBrand(ds.gsc_queries?.data, brandTerms, ds.gsc_totals?.data.clicks ?? null), business: business ?? null, aiReadiness: readiness, causes: groupCauses(ds.onpage?.data.issues ?? [], site.host), links: suggestLinks(pages, inventory.edges, site.host, inventory.capturedAt), permissions: { edit: false, scan: false, settings: false } };
}
