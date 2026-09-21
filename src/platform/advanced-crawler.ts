import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { chromium, type Browser, type Page } from "playwright";
import { db, schema } from "@/db";
import type { ManagedSite } from "./types";
import { createNotification } from "./notifications";
import { assertPublicHostname, fetchPublic, isObviouslyPublicHostname, readBoundedText } from "./public-network";
import { excludedFromCrawl, internationalChecks, structuredDataIssues } from "./audit-depth";
import { parseRobotsDirectives, snippetIssues } from "./discovery-files";

import { CrawlBrowser } from "./crawl-browser";

const USER_AGENT = "OrwellSEOCommand/2.0 (+hybrid technical audit)";
const DEFAULT_BROWSER_PAGES = 200;
const MAX_BROWSER_PAGES = 5_000;

export interface BrowserCrawlPageInput {
  url: string;
  finalUrl: string | null;
  statusCode: number | null;
  depth: number;
  rawTitle: string | null;
  renderedTitle: string | null;
  description: string | null;
  canonical: string | null;
  h1Count: number;
  wordCount: number;
  rawHash: string | null;
  renderedHash: string | null;
  jsDependent: boolean;
  indexable: boolean;
  schemaTypes: string[];
  hreflang: Record<string, string>;
  internalLinks: number;
  externalLinks: number;
  loadTimeMs: number | null;
  issues: string[];
  outbound?: Array<{ targetUrl: string; anchor: string | null; nofollow: boolean }>;
  links: Array<{ targetUrl: string; anchor: string | null; nofollow: boolean }>;
}

export interface BrowserCrawlResult {
  runId: string;
  pagesCrawled: number;
  issueCounts: Record<string, number>;
  diffSummary: Record<string, number>;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publicHost(host: string): boolean {
  return isObviouslyPublicHostname(host.toLowerCase().replace(/^www\./, ""));
}

export function cleanUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|msclkid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sameSite(candidate: string, host: string): boolean {
  try {
    return new URL(candidate).hostname.replace(/^www\./, "").toLowerCase() === host.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
}

function textOnly(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawTitle(html: string): string | null {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  return value || null;
}

function issueCounts(pages: BrowserCrawlPageInput[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const page of pages) {
    for (const issue of page.issues) counts[issue] = (counts[issue] ?? 0) + 1;
  }
  return counts;
}

export function applyCrossPageChecks(pages: BrowserCrawlPageInput[]) {
  const titles = new Map<string, BrowserCrawlPageInput[]>();
  const content = new Map<string, BrowserCrawlPageInput[]>();
  const incoming = new Map<string, number>();
  for (const page of pages) {
    if (page.renderedTitle) {
      const key = page.renderedTitle.toLowerCase();
      titles.set(key, [...(titles.get(key) ?? []), page]);
    }
    if (page.renderedHash) content.set(page.renderedHash, [...(content.get(page.renderedHash) ?? []), page]);
    for (const edge of page.links) incoming.set(edge.targetUrl, (incoming.get(edge.targetUrl) ?? 0) + 1);
  }
  for (const group of titles.values()) if (group.length > 1) for (const page of group) page.issues.push("duplicate_title");
  for (const group of content.values()) if (group.length > 1) for (const page of group) page.issues.push("duplicate_rendered_content");
  const home = pages[0]?.url;
  for (const page of pages) {
    if (page.url !== home && (incoming.get(page.url) ?? 0) === 0) page.issues.push("orphan_from_rendered_graph");
    page.issues = [...new Set(page.issues)];
  }
}

async function sitemapSeeds(host: string): Promise<string[]> {
  const candidates = [`https://${host}/sitemap.xml`, `https://${host}/sitemap_index.xml`];
  const urls: string[] = [];
  for (const candidate of candidates) {
    try {
      const response = await fetchPublic(candidate, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const xml = await readBoundedText(response, 10_000_000);
      for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
        const value = cleanUrl(match[1]!.replace(/&amp;/g, "&"));
        if (value && sameSite(value, host)) urls.push(value);
      }
      if (urls.length) break;
    } catch {
      // A missing sitemap should not stop a link-discovery crawl.
    }
  }
  return [...new Set(urls)];
}

async function inspectPage(page: Page, url: string, depth: number, host: string): Promise<BrowserCrawlPageInput> {
  const started = Date.now();
  let rawHtml = "";
  let rawStatus: number | null = null;
  let rawXRobots: string | null = null;
  try {
    const response = await fetchPublic(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
    });
    rawStatus = response.status;
    rawXRobots = response.headers.get("x-robots-tag");
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html") || type.includes("xhtml")) rawHtml = await readBoundedText(response, 5_000_000);
  } catch {
    // Browser navigation below provides the authoritative status when fetch fails.
  }

  let statusCode = rawStatus;
  let finalUrl: string | null = null;
  const issues: string[] = [];
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    statusCode = response?.status() ?? statusCode;
    finalUrl = cleanUrl(page.url());
    const data = await page.evaluate(() => {
      const bodyText = document.body?.innerText.replace(/\s+/g, " ").trim() ?? "";
      const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
      const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim() ?? null;
      const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content?.toLowerCase() ?? "";
      const googlebot = document.querySelector<HTMLMetaElement>('meta[name="googlebot"]')?.content?.toLowerCase() ?? "";
      const dataNosnippet = document.querySelectorAll("[data-nosnippet]").length;
      const schemas: string[] = [];
      let invalidJsonLd = false;
      for (const node of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
        try {
          const parsed = JSON.parse(node.textContent || "null") as Record<string, unknown> | Record<string, unknown>[] | null;
          const entries = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
          for (const entry of entries) {
            const graph = Array.isArray(entry["@graph"]) ? entry["@graph"] as Record<string, unknown>[] : [entry];
            for (const item of graph) {
              const type = item?.["@type"];
              if (typeof type === "string") schemas.push(type);
              if (Array.isArray(type)) schemas.push(...type.filter((value): value is string => typeof value === "string"));
            }
          }
        } catch {
          invalidJsonLd = true;
        }
      }
      const hreflang: Record<string, string> = {};
      for (const node of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]'))) {
        if (node.hreflang && node.href) hreflang[node.hreflang.toLowerCase()] = node.href;
      }
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((node) => ({
        href: node.href,
        anchor: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 300) || null,
        nofollow: node.rel.split(/\s+/).includes("nofollow"),
      }));
      return {
        title: document.title.trim() || null,
        description,
        canonical,
        robots,
        googlebot,
        dataNosnippet,
        h1Count: document.querySelectorAll("h1").length,
        bodyText,
        schemas: [...new Set(schemas)],
        invalidJsonLd,
        jsonLd: Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')).map((node) => (node.textContent ?? "").slice(0, 100000)).slice(0, 30),
        hreflang,
        links,
      };
    });
    const normalizedLinks = data.links
      .map((link) => ({ ...link, targetUrl: cleanUrl(link.href, finalUrl ?? url) }))
      .filter((link): link is typeof link & { targetUrl: string } => Boolean(link.targetUrl));
    const internal = normalizedLinks.filter((link) => sameSite(link.targetUrl, host));
    const external = normalizedLinks.length - internal.length;
    const rawText = textOnly(rawHtml);
    const rawContentHash = rawText ? hash(rawText) : null;
    const renderedContentHash = data.bodyText ? hash(data.bodyText) : null;
    const jsDependent = Boolean(rawContentHash && renderedContentHash && rawContentHash !== renderedContentHash && data.bodyText.length > rawText.length * 1.25);
    // Snippet directives arrive from the meta robots tag, the googlebot-specific
    // tag and the X-Robots-Tag header; any of them can bar an AI answer.
    const directives = parseRobotsDirectives(data.robots, data.googlebot, rawXRobots);
    const indexable = !directives.noindex && !/\bnoindex\b/.test(data.robots) && (statusCode == null || statusCode < 400);
    if (statusCode != null && statusCode >= 400) issues.push("http_error");
    if (!data.title) issues.push("missing_title");
    if (!data.description) issues.push("missing_description");
    if (data.h1Count === 0) issues.push("missing_h1");
    if (data.h1Count > 1) issues.push("multiple_h1");
    if (!data.canonical) issues.push("missing_canonical");
    if (!indexable) issues.push("not_indexable");
    if (data.invalidJsonLd) issues.push("invalid_json_ld");
    issues.push(...structuredDataIssues(data.jsonLd));
    if (jsDependent) issues.push("javascript_dependent_content");
    issues.push(...snippetIssues(directives, data.dataNosnippet));
    if (Object.keys(data.hreflang).length && !Object.values(data.hreflang).some((value) => cleanUrl(value) === cleanUrl(finalUrl ?? url))) issues.push("hreflang_missing_self_reference");
    return {
      url,
      finalUrl,
      statusCode,
      depth,
      rawTitle: rawTitle(rawHtml),
      renderedTitle: data.title,
      description: data.description,
      canonical: data.canonical ? cleanUrl(data.canonical, finalUrl ?? url) : null,
      h1Count: data.h1Count,
      wordCount: data.bodyText ? data.bodyText.split(/\s+/).filter(Boolean).length : 0,
      rawHash: rawContentHash,
      renderedHash: renderedContentHash,
      jsDependent,
      indexable,
      schemaTypes: data.schemas,
      hreflang: data.hreflang,
      internalLinks: internal.length,
      externalLinks: external,
      loadTimeMs: Date.now() - started,
      issues,
      outbound: normalizedLinks.filter(link => !sameSite(link.targetUrl, host)).map(link => ({ targetUrl: link.targetUrl, anchor: link.anchor, nofollow: link.nofollow })),
      links: internal.map((link) => ({ targetUrl: link.targetUrl, anchor: link.anchor, nofollow: link.nofollow })),
    };
  } catch (error) {
    return {
      url,
      finalUrl,
      statusCode,
      depth,
      rawTitle: rawTitle(rawHtml),
      renderedTitle: null,
      description: null,
      canonical: null,
      h1Count: 0,
      wordCount: 0,
      rawHash: rawHtml ? hash(textOnly(rawHtml)) : null,
      renderedHash: null,
      jsDependent: false,
      indexable: false,
      schemaTypes: [],
      hreflang: {},
      internalLinks: 0,
      externalLinks: 0,
      loadTimeMs: Date.now() - started,
      issues: ["browser_render_failed"],
      links: [],
    };
  }
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
}

export async function runBrowserCrawl(site: ManagedSite, requestedMax?: number, options: { url?: string; jobId?: string; shouldStop?: () => boolean } = {}): Promise<BrowserCrawlResult> {
  if (!publicHost(site.host)) throw new Error("Browser crawler only accepts public website hosts.");
  await assertPublicHostname(site.host);
  const [settings] = await db().select({ payload: schema.commandRecords.payload }).from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug, site.id), eq(schema.commandRecords.kind, "settings"), eq(schema.commandRecords.recordKey, "preferences")));
  const exclusions = Array.isArray(settings?.payload.crawlExclusions) ? settings.payload.crawlExclusions.filter((v): v is string => typeof v === "string" && v.startsWith("/")) : [];
  const maxDepth = Math.min(30, Math.max(0, Number(settings?.payload.crawlMaxDepth ?? 10)));
  const delayMs = Math.min(5000, Math.max(0, Number(settings?.payload.crawlDelayMs ?? 250)));
  const deadline = Date.now() + 12 * 60000;
  const maxPages = Math.min(
    Math.max(requestedMax ?? Number(settings?.payload.crawlPageLimit ?? process.env.BROWSER_CRAWL_MAX_PAGES ?? DEFAULT_BROWSER_PAGES), 1),
    site.crawlMaxPages,
    MAX_BROWSER_PAGES,
  );
  const [previous] = await db().select().from(schema.browserCrawlRuns)
    .where(and(eq(schema.browserCrawlRuns.siteSlug, site.id), eq(schema.browserCrawlRuns.status, "completed"), sql`coalesce(${schema.browserCrawlRuns.diffSummary}->>'singlePage', '0') = '0'`))
    .orderBy(desc(schema.browserCrawlRuns.startedAt)).limit(1);
  const [run] = await db().insert(schema.browserCrawlRuns).values({
    siteSlug: site.id,
    status: "running",
    maxPages,
    previousRunId: previous?.id ?? null,
    diffSummary: { singlePage: options.url ? 1 : 0 },
  }).returning();
  if (!run) throw new Error("Could not create browser crawl run.");

  const browser = new CrawlBrowser(launchBrowser, USER_AGENT);
  try {
    const preparePage = async (page: Page) => { await page.route("**/*", async (route) => {
      const kind = route.request().resourceType();
      if (["image", "media", "font"].includes(kind)) return route.abort();
      try {
        const target = new URL(route.request().url());
        if (/^https?:$/.test(target.protocol)) await assertPublicHostname(target.hostname);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    }); };
    const home = cleanUrl(options.url ?? `https://${site.host}/`)!;
    if (!sameSite(home, site.host)) throw new Error("Choose a URL on the selected website.");
    const seeds = options.url ? [] : await sitemapSeeds(site.host);
    const queue: Array<{ url: string; depth: number }> = [{ url: home, depth: 0 }, ...seeds.map((url) => ({ url, depth: 1 }))];
    const seen = new Set<string>();
    const pages: BrowserCrawlPageInput[] = [];
    const excluded = new Set<string>();
    let cancelled = false;
    while (queue.length && pages.length < maxPages && Date.now() < deadline && !options.shouldStop?.()) {
      if (options.jobId) {
        const [active] = await db().select({ status: schema.platformJobs.status }).from(schema.platformJobs).where(eq(schema.platformJobs.id, options.jobId));
        if (active?.status !== "running") { cancelled = true; break; }
      }
      const next = queue.shift()!;
      if (seen.has(next.url) || !sameSite(next.url, site.host)) continue;
      seen.add(next.url);
      if (next.depth > maxDepth) { excluded.add(next.url); continue; }
      if (excludedFromCrawl(next.url, exclusions)) { excluded.add(next.url); continue; }
      const { result, resources } = await browser.inspect(preparePage, async page => {
        const result = await inspectPage(page, next.url, next.depth, site.host);
        const resources = result.issues.includes("browser_render_failed") ? [] : await page.evaluate(() => performance.getEntriesByType("resource").map(entry => { const r = entry as PerformanceResourceTiming; return { url: r.name, type: r.initiatorType, durationMs: Math.round(r.duration), transferBytes: r.transferSize, encodedBytes: r.encodedBodySize }; }).sort((a, b) => b.durationMs - a.durationMs).slice(0, 100)).catch(() => []);
        return { result, resources };
      });
      pages.push(result);
      const { links: pageLinks, outbound, ...pageData } = result;
      await db().insert(schema.browserCrawlPages).values({ ...pageData, runId: run.id, siteSlug: site.id });
      await db().insert(schema.commandRecords).values({ siteSlug: site.id, kind: "workspace_outbound_links", recordKey: `${run.id}:${hash(result.url)}`, status: "completed", payload: { runId: run.id, sourceUrl: result.url, links: (outbound ?? []).slice(0,2000), truncated: (outbound?.length ?? 0)>2000, capturedAt: new Date().toISOString() } });
      if (pageLinks.length) await db().insert(schema.browserCrawlEdges).values(pageLinks.slice(0, 2000).map(edge => ({ runId: run.id, siteSlug: site.id, sourceUrl: result.url, ...edge })));
      await db().insert(schema.commandRecords).values({ siteSlug: site.id, kind: "workspace_crawl_resources", recordKey: `${run.id}:${hash(result.url)}`, status: "completed", payload: { runId: run.id, url: result.url, resources, sampled: true, note: "Up to 100 slowest observed resources. Images, media and fonts are intentionally blocked by the crawler; cross-origin byte sizes may be unavailable." } });
      await db().update(schema.browserCrawlRuns).set({ pagesCrawled: pages.length, diffSummary: { heartbeatAt: Date.now(), singlePage: options.url ? 1 : 0 } }).where(eq(schema.browserCrawlRuns.id, run.id));
      if (options.jobId) await db().update(schema.platformJobs).set({ progress: sql`${schema.platformJobs.progress} || ${JSON.stringify({ runId: run.id, pagesCrawled: pages.length, heartbeatAt: Date.now() })}::jsonb` }).where(and(eq(schema.platformJobs.id, options.jobId), eq(schema.platformJobs.status, "running")));
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      for (const link of options.url ? [] : result.links) {
        if (!seen.has(link.targetUrl) && queue.length < maxPages * 5) queue.push({ url: link.targetUrl, depth: next.depth + 1 });
      }
    }
    await browser.close();
    applyCrossPageChecks(pages);
    const internationalCoverage = internationalChecks(pages);

    const priorPages = previous
      ? await db().select().from(schema.browserCrawlPages).where(eq(schema.browserCrawlPages.runId, previous.id))
      : [];
    const before = new Map(priorPages.map((item) => [item.url, item]));
    const after = new Map(pages.map((item) => [item.url, item]));
    const diffSummary = {
      ...internationalCoverage,
      singlePage: options.url ? 1 : 0,
      timeLimited: Date.now() >= deadline ? 1 : 0,
      interrupted: cancelled || options.shouldStop?.() ? 1 : 0,
      excluded: excluded.size,
      discovered: new Set([...seen, ...queue.map((item) => item.url)]).size,
      unvisited: new Set(queue.filter((item) => !seen.has(item.url)).map((item) => item.url)).size,
      added: [...after.keys()].filter((url) => !before.has(url)).length,
      removed: !options.url && !queue.length && !cancelled && !options.shouldStop?.() ? [...before.keys()].filter((url) => !after.has(url)).length : 0,
      removalComparisonComplete: !options.url && !queue.length && !cancelled && !options.shouldStop?.() ? 1 : 0,
      contentChanged: pages.filter((item) => before.get(item.url)?.renderedHash && before.get(item.url)?.renderedHash !== item.renderedHash).length,
      titleChanged: pages.filter((item) => before.get(item.url)?.renderedTitle && before.get(item.url)?.renderedTitle !== item.renderedTitle).length,
      canonicalChanged: pages.filter((item) => before.get(item.url)?.canonical && before.get(item.url)?.canonical !== item.canonical).length,
      indexabilityChanged: pages.filter((item) => before.has(item.url) && before.get(item.url)?.indexable !== item.indexable).length,
    };
    const counts = issueCounts(pages);
    // Pages and edges were checkpointed during collection. Only cross-page findings need updating.
    for (const item of pages) await db().update(schema.browserCrawlPages).set({ issues: item.issues }).where(and(eq(schema.browserCrawlPages.runId, run.id), eq(schema.browserCrawlPages.url, item.url)));
    await db().update(schema.browserCrawlRuns).set({
      status: cancelled ? "cancelled" : "completed",
      pagesCrawled: pages.length,
      issueCounts: counts,
      diffSummary,
      completedAt: new Date(),
      lastError: null,
    }).where(eq(schema.browserCrawlRuns.id, run.id));

    const regressed = previous ? pages.filter((item) => {
      if (item.issues.includes("browser_render_failed")) return false;
      const prior = before.get(item.url);
      return Boolean(
        (prior?.indexable && !item.indexable) ||
        ((prior?.statusCode ?? 200) < 400 && (item.statusCode ?? 0) >= 400),
      );
    }).length : 0;
    if (regressed > 0) {
      await createNotification({
        siteSlug: site.id,
        eventType: "technical_regression",
        severity: regressed >= 5 ? "high" : "medium",
        title: `${regressed} rendered technical regression${regressed === 1 ? "" : "s"} detected`,
        detail: `The browser crawl compared ${pages.length.toLocaleString()} pages with the previous run.`,
        actionUrl: "/technical-crawler",
        fingerprint: `browser-crawl:${site.id}:${run.id}`,
      });
    }
    return { runId: run.id, pagesCrawled: pages.length, issueCounts: counts, diffSummary };
  } catch (error) {
    await db().update(schema.browserCrawlRuns).set({
      status: "failed",
      completedAt: new Date(),
      lastError: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
    }).where(eq(schema.browserCrawlRuns.id, run.id));
    throw error;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function latestBrowserCrawl(siteSlug: string) {
  const [run] = await db().select().from(schema.browserCrawlRuns)
    .where(and(eq(schema.browserCrawlRuns.siteSlug, siteSlug), sql`coalesce(${schema.browserCrawlRuns.diffSummary}->>'singlePage', '0') = '0'`))
    .orderBy(desc(schema.browserCrawlRuns.startedAt)).limit(1);
  if (!run) return { run: null, pages: [], orphanUrls: [] as string[] };
  const pages = await db().select().from(schema.browserCrawlPages)
    .where(eq(schema.browserCrawlPages.runId, run.id))
    .orderBy(schema.browserCrawlPages.depth, schema.browserCrawlPages.url)
    .limit(1_000);
  const orphanUrls = pages.filter((page) => page.issues.includes("orphan_from_rendered_graph")).map((page) => page.url);
  return { run, pages, orphanUrls };
}

export async function queueBrowserCrawl(siteSlug: string, maxPages?: number, url?: string) {
  return db().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`browser-crawl:${siteSlug}`}))`);
    const now = new Date(), cutoff = now.getTime() - 30 * 60000;
    await tx.update(schema.platformJobs).set({ status: "failed", completedAt: now, lastError: "Browser worker interrupted. Saved evidence is retained; a replacement crawl was requested." }).where(and(eq(schema.platformJobs.siteSlug, siteSlug), eq(schema.platformJobs.kind, "browser_crawl"), eq(schema.platformJobs.status, "running"), sql`${schema.platformJobs.startedAt} < ${new Date(cutoff).toISOString()}::timestamptz`, sql`coalesce((${schema.platformJobs.progress}->>'heartbeatAt')::numeric, 0) < ${cutoff}`));
    const [active] = await tx.select().from(schema.platformJobs).where(and(eq(schema.platformJobs.siteSlug, siteSlug), eq(schema.platformJobs.kind, "browser_crawl"), inArray(schema.platformJobs.status, ["queued", "running"]))).limit(1);
    if (active) return active;
    const [job] = await tx.insert(schema.platformJobs).values({ siteSlug, kind: "browser_crawl", progress: { maxPages: url ? 1 : maxPages ?? null, ...(url ? { url } : {}) } }).returning();
    return job!;
  });
}
