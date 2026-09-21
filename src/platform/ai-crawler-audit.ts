import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import type { GscRow, Severity } from "@/lib/types";
import type { AiCrawlerAuditRow, ManagedSite } from "./types";
import { fetchPublic, readBoundedText } from "./public-network";
import { groupFor, matchRule, type RobotsRule } from "./robots-rules";

const USER_AGENT = "OrwellSEOCommand/2.0 (+AI crawler access audit)";
/** Paths sampled per bot beyond the root, bounding the work for large sites. */
export const MAX_AUDIT_PATHS = 200;

/**
 * Tokens are the documented product tokens each operator publishes. Categories
 * drive severity: a blocked search or assistant bot costs citations, while
 * blocking a training bot is a legitimate editorial choice.
 *
 * Google-Extended stays `training` because Google states it "does not impact a
 * site's inclusion in Google Search nor is it used as a ranking signal".
 * Googlebot is the token that governs AI Overviews and AI Mode.
 */
const BOTS: { bot: string; category: AiCrawlerAuditRow["category"]; governs?: string }[] = [
  { bot: "GPTBot", category: "training" },
  { bot: "OAI-SearchBot", category: "search" },
  { bot: "ChatGPT-User", category: "assistant" },
  { bot: "ClaudeBot", category: "training" },
  { bot: "PerplexityBot", category: "search" },
  { bot: "Google-Extended", category: "training", governs: "Gemini training and grounding, not Google Search" },
  { bot: "Googlebot", category: "search", governs: "AI Overviews and AI Mode" },
  { bot: "Bingbot", category: "search" },
  { bot: "Claude-SearchBot", category: "search" },
  { bot: "Applebot", category: "search" },
  { bot: "DuckAssistBot", category: "search" },
  { bot: "Amazonbot", category: "search" },
  { bot: "Claude-User", category: "assistant" },
  { bot: "Perplexity-User", category: "assistant" },
  { bot: "MistralAI-User", category: "assistant" },
  { bot: "meta-externalfetcher", category: "assistant" },
  { bot: "Applebot-Extended", category: "training" },
  { bot: "Bytespider", category: "training" },
  { bot: "CCBot", category: "training" },
  { bot: "meta-externalagent", category: "training" },
  { bot: "Google-CloudVertexBot", category: "training" },
];

export function isSafePublicHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+$/.test(value) || value === "localhost" || value.endsWith(".local")) return false;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(value)) return false;
  const match = value.match(/^172\.(\d+)\./);
  return !match || Number(match[1]) < 16 || Number(match[1]) > 31;
}

/** Root-level verdict, kept separate so the evidence names the deciding rule. */
export function classifyRobotsAccess(robots: string, bot: string): { access: "allowed" | "blocked"; evidence: string; rule: RobotsRule | null } {
  const group = groupFor(robots, bot);
  if (!group) return { access: "allowed", evidence: "No matching disallow rule in robots.txt.", rule: null };
  const rule = matchRule(group, "/");
  const scope = group.wildcard ? "the wildcard group" : `the ${bot} group`;
  if (rule?.kind === "disallow") {
    return { access: "blocked", evidence: `${scope.charAt(0).toUpperCase()}${scope.slice(1)} blocks the root with "Disallow: ${rule.path}".`, rule };
  }
  const paths = group.rules.filter((item) => item.kind === "disallow" && item.path !== "/").length;
  return {
    access: "allowed",
    evidence: paths
      ? `Root is accessible through ${scope}; ${paths} path rule${paths === 1 ? "" : "s"} remain.`
      : `Root is accessible through ${scope} with no blocking rule.`,
    rule,
  };
}

/** True when the site has opted into being available for model training. */
export function allowsTraining(site: Pick<ManagedSite, "siteSettings">): boolean {
  const policy = site.siteSettings?.aiAccessPolicy;
  return Boolean(policy && typeof policy === "object" && (policy as Record<string, unknown>).allowTraining === true);
}

/**
 * Severity of one audited bot. Returns null when there is nothing to report.
 * Blocking a training bot is only a finding when the site asked to allow them.
 */
export function aiAccessSeverity(
  row: Pick<AiCrawlerAuditRow, "access" | "category">,
  trainingAllowed = false,
): Severity | null {
  if (row.access === "allowed") return null;
  if (row.access === "unknown") return "medium";
  if (row.category === "training") return trainingAllowed ? "medium" : "low";
  return "high";
}

/** Access changes worth alerting on: retrieval bots only, in both directions. */
export function aiAccessTransitions(
  previous: Pick<AiCrawlerAuditRow, "bot" | "access">[],
  current: Pick<AiCrawlerAuditRow, "bot" | "category" | "access">[],
): { bot: string; category: AiCrawlerAuditRow["category"]; kind: "blocked" | "restored" }[] {
  const before = new Map(previous.map((row) => [row.bot, row.access]));
  const changes: { bot: string; category: AiCrawlerAuditRow["category"]; kind: "blocked" | "restored" }[] = [];
  for (const row of current) {
    if (row.category === "training") continue;
    const prior = before.get(row.bot);
    if (!prior || prior === row.access) continue;
    const lost = prior === "allowed" && (row.access === "blocked" || row.access === "partial");
    const regained = (prior === "blocked" || prior === "partial") && row.access === "allowed";
    if (lost) changes.push({ bot: row.bot, category: row.category, kind: "blocked" });
    else if (regained) changes.push({ bot: row.bot, category: row.category, kind: "restored" });
  }
  return changes;
}

function toPath(value: string, host: string): string | null {
  try {
    const url = new URL(value, `https://${host}`);
    if (url.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * Representative paths for the page-level pass: the pages Search Console shows
 * traffic for first, then the saved crawl inventory. Queried directly rather
 * than through the command read model, which would import this module back.
 */
export async function auditPaths(site: Pick<ManagedSite, "id" | "host">, limit = MAX_AUDIT_PATHS): Promise<string[]> {
  if (!hasDatabase() || process.env.QA_SYNTHETIC === "true") return [];
  const paths: string[] = [];
  const add = (value: string) => {
    const path = toPath(value, site.host);
    if (path && path !== "/" && !paths.includes(path)) paths.push(path);
  };
  try {
    const [snapshot] = await db().select({ payload: schema.datasetSnapshots.payload })
      .from(schema.datasetSnapshots)
      .where(and(eq(schema.datasetSnapshots.domainSlug, site.id), eq(schema.datasetSnapshots.dataset, "gsc_pages")))
      .orderBy(desc(schema.datasetSnapshots.capturedOn)).limit(1);
    for (const row of (snapshot?.payload ?? []) as GscRow[]) {
      if (paths.length >= limit) break;
      if (typeof row?.key === "string") add(row.key);
    }
  } catch {
    // Search Console evidence is optional; the crawl inventory below still applies.
  }
  if (paths.length >= limit) return paths.slice(0, limit);
  try {
    const [browser] = await db().select({ id: schema.browserCrawlRuns.id }).from(schema.browserCrawlRuns)
      .where(and(eq(schema.browserCrawlRuns.siteSlug, site.id), eq(schema.browserCrawlRuns.status, "completed")))
      .orderBy(desc(schema.browserCrawlRuns.completedAt)).limit(1);
    if (browser) {
      const rows = await db().select({ url: schema.browserCrawlPages.url }).from(schema.browserCrawlPages)
        .where(eq(schema.browserCrawlPages.runId, browser.id)).limit(limit * 3);
      for (const row of rows) { if (paths.length >= limit) break; add(row.url); }
    } else {
      const [detailed] = await db().select({ id: schema.detailedCrawlRuns.id }).from(schema.detailedCrawlRuns)
        .where(and(eq(schema.detailedCrawlRuns.siteSlug, site.id), eq(schema.detailedCrawlRuns.status, "completed")))
        .orderBy(desc(schema.detailedCrawlRuns.completedAt)).limit(1);
      if (detailed) {
        const rows = await db().select({ url: schema.detailedCrawlPages.url }).from(schema.detailedCrawlPages)
          .where(eq(schema.detailedCrawlPages.runId, detailed.id)).limit(limit * 3);
        for (const row of rows) { if (paths.length >= limit) break; add(row.url); }
      }
    }
  } catch {
    // A site with no saved crawl is still audited at the root.
  }
  return paths.slice(0, limit);
}

/** Evaluate one bot against the root and the sampled paths. */
export function evaluateBot(
  robots: string,
  entry: { bot: string; category: AiCrawlerAuditRow["category"]; governs?: string },
  paths: string[],
  robotsUrl: string,
  robotsStatus: number | null,
): AiCrawlerAuditRow {
  const root = classifyRobotsAccess(robots, entry.bot);
  const group = groupFor(robots, entry.bot);
  const blocked = paths.filter((path) => matchRule(group, path)?.kind === "disallow");
  const checkedPages = paths.length + 1;
  const access = root.access === "blocked" ? "blocked" : blocked.length ? "partial" : "allowed";
  const firstRule = blocked.length ? matchRule(group, blocked[0]!) : null;
  const evidence = access === "partial"
    ? `Root is accessible, but ${blocked.length} of ${paths.length} sampled path${paths.length === 1 ? "" : "s"} are disallowed, the first by "Disallow: ${firstRule?.path ?? ""}".`
    : access === "blocked"
      ? root.evidence
      : paths.length
        ? `${root.evidence} No sampled path of ${paths.length} is disallowed.`
        : root.evidence;
  return {
    bot: entry.bot,
    category: entry.category,
    access,
    evidence,
    robotsUrl,
    robotsStatus,
    checkedPages,
    blockedPages: root.access === "blocked" ? checkedPages : blocked.length,
    details: {
      samples: blocked.slice(0, 5),
      rule: (access === "blocked" ? root.rule?.path : firstRule?.path) ?? null,
      wildcardGroup: group ? group.wildcard === true : false,
      ...(entry.governs ? { governs: entry.governs } : {}),
    },
  };
}

function unavailable(robotsUrl: string, evidence: string): AiCrawlerAuditRow[] {
  return BOTS.map(({ bot, category, governs }) => ({
    bot, category, access: "unknown" as const, evidence, robotsUrl,
    robotsStatus: null, checkedPages: null, blockedPages: null,
    details: { ...(governs ? { governs } : {}) },
  }));
}

export async function auditAiCrawlerAccess(site: ManagedSite, paths?: string[]): Promise<AiCrawlerAuditRow[]> {
  const robotsUrl = `https://${site.host}/robots.txt`;
  if (!isSafePublicHost(site.host)) {
    return unavailable(robotsUrl, "Host is not eligible for an external robots.txt request.");
  }
  const sampled = paths ?? await auditPaths(site);
  try {
    const response = await fetchPublic(robotsUrl, {
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return BOTS.map(({ bot, category, governs }) => ({
        bot, category, access: "allowed" as const,
        evidence: "robots.txt was not found; no crawler restrictions were declared.",
        robotsUrl, robotsStatus: 404, checkedPages: sampled.length + 1, blockedPages: 0,
        details: { samples: [], rule: null, wildcardGroup: false, ...(governs ? { governs } : {}) },
      }));
    }
    if (!response.ok) {
      // Release the socket before unwinding; the body is of no use here.
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`robots.txt returned HTTP ${response.status}`);
    }
    const robots = await readBoundedText(response, 500_000);
    return BOTS.map((entry) => evaluateBot(robots, entry, sampled, robotsUrl, response.status));
  } catch (error) {
    return unavailable(robotsUrl, error instanceof Error ? error.message : "robots.txt could not be checked");
  }
}
