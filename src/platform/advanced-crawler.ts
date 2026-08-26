import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { chromium, type Browser, type Page } from "playwright";
import { db, schema } from "@/db";
import type { ManagedSite } from "./types";
import { createNotification } from "./notifications";
import { assertPublicHostname, fetchPublic, isObviouslyPublicHostname } from "./public-network";

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
      const xml = (await response.text()).slice(0, 10_000_000);
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
  try {
    const response = await fetchPublic(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
    });
    rawStatus = response.status;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("text/html") || type.includes("xhtml")) rawHtml = (await response.text()).slice(0, 5_000_000);
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
        h1Count: document.querySelectorAll("h1").length,
        bodyText,
        schemas: [...new Set(schemas)],
        invalidJsonLd,
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
    const indexable = !/\bnoindex\b/.test(data.robots) && (statusCode == null || statusCode < 400);
    if (statusCode != null && statusCode >= 400) issues.push("http_error");
    if (!data.title) issues.push("missing_title");
    if (!data.description) issues.push("missing_description");
    if (data.h1Count === 0) issues.push("missing_h1");
    if (data.h1Count > 1) issues.push("multiple_h1");
    if (!data.canonical) issues.push("missing_canonical");
    if (!indexable) issues.push("not_indexable");
    if (data.invalidJsonLd) issues.push("invalid_json_ld");
    if (jsDependent) issues.push("javascript_dependent_content");
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

export async function runBrowserCrawl(site: ManagedSite, requestedMax?: number): Promise<BrowserCrawlResult> {
  if (!publicHost(site.host)) throw new Error("Browser crawler only accepts public website hosts.");
  await assertPublicHostname(site.host);
  const maxPages = Math.min(
    Math.max(requestedMax ?? Number(process.env.BROWSER_CRAWL_MAX_PAGES ?? DEFAULT_BROWSER_PAGES), 1),
    site.crawlMaxPages,
    MAX_BROWSER_PAGES,
  );
  const [previous] = await db().select().from(schema.browserCrawlRuns)
    .where(eq(schema.browserCrawlRuns.siteSlug, site.id))
    .orderBy(desc(schema.browserCrawlRuns.startedAt)).limit(1);
  const [run] = await db().insert(schema.browserCrawlRuns).values({
    siteSlug: site.id,
    status: "running",
    maxPages,
    previousRunId: previous?.id ?? null,
  }).returning();
  if (!run) throw new Error("Could not create browser crawl run.");

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT, ignoreHTTPSErrors: false });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const kind = route.request().resourceType();
      if (["image", "media", "font"].includes(kind)) return route.abort();
      try {
        const target = new URL(route.request().url());
        if (/^https?:$/.test(target.protocol)) await assertPublicHostname(target.hostname);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    const home = cleanUrl(`https://${site.host}/`)!;
    const seeds = await sitemapSeeds(site.host);
    const queue: Array<{ url: string; depth: number }> = [{ url: home, depth: 0 }, ...seeds.map((url) => ({ url, depth: 1 }))];
    const seen = new Set<string>();
    const pages: BrowserCrawlPageInput[] = [];
    while (queue.length && pages.length < maxPages) {
      const next = queue.shift()!;
      if (seen.has(next.url) || !sameSite(next.url, site.host)) continue;
      seen.add(next.url);
      const result = await inspectPage(page, next.url, next.depth, site.host);
      pages.push(result);
      for (const link of result.links) {
        if (!seen.has(link.targetUrl) && queue.length < maxPages * 5) queue.push({ url: link.targetUrl, depth: next.depth + 1 });
      }
    }
    await context.close();
    applyCrossPageChecks(pages);

    const priorPages = previous
      ? await db().select().from(schema.browserCrawlPages).where(eq(schema.browserCrawlPages.runId, previous.id))
      : [];
    const before = new Map(priorPages.map((item) => [item.url, item]));
    const after = new Map(pages.map((item) => [item.url, item]));
    const diffSummary = {
      added: [...after.keys()].filter((url) => !before.has(url)).length,
      removed: [...before.keys()].filter((url) => !after.has(url)).length,
      contentChanged: pages.filter((item) => before.get(item.url)?.renderedHash && before.get(item.url)?.renderedHash !== item.renderedHash).length,
      titleChanged: pages.filter((item) => before.get(item.url)?.renderedTitle && before.get(item.url)?.renderedTitle !== item.renderedTitle).length,
      canonicalChanged: pages.filter((item) => before.get(item.url)?.canonical && before.get(item.url)?.canonical !== item.canonical).length,
      indexabilityChanged: pages.filter((item) => before.has(item.url) && before.get(item.url)?.indexable !== item.indexable).length,
    };
    const counts = issueCounts(pages);
    for (let index = 0; index < pages.length; index += 200) {
      const chunk = pages.slice(index, index + 200);
      await db().insert(schema.browserCrawlPages).values(chunk.map(({ links: _links, ...item }) => ({ ...item, runId: run.id, siteSlug: site.id })));
    }
    const edges = pages.flatMap((item) => item.links.slice(0, 2_000).map((edge) => ({ runId: run.id, siteSlug: site.id, sourceUrl: item.url, ...edge })));
    for (let index = 0; index < edges.length; index += 500) await db().insert(schema.browserCrawlEdges).values(edges.slice(index, index + 500));
    await db().update(schema.browserCrawlRuns).set({
      status: "completed",
      pagesCrawled: pages.length,
      issueCounts: counts,
      diffSummary,
      completedAt: new Date(),
      lastError: null,
    }).where(eq(schema.browserCrawlRuns.id, run.id));

    const regressed = previous ? pages.filter((item) => {
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
    await browser?.close().catch(() => undefined);
  }
}

export async function latestBrowserCrawl(siteSlug: string) {
  const [run] = await db().select().from(schema.browserCrawlRuns)
    .where(eq(schema.browserCrawlRuns.siteSlug, siteSlug))
    .orderBy(desc(schema.browserCrawlRuns.startedAt)).limit(1);
  if (!run) return { run: null, pages: [], orphanUrls: [] as string[] };
  const pages = await db().select().from(schema.browserCrawlPages)
    .where(eq(schema.browserCrawlPages.runId, run.id))
    .orderBy(schema.browserCrawlPages.depth, schema.browserCrawlPages.url)
    .limit(1_000);
  const orphanUrls = pages.filter((page) => page.issues.includes("orphan_from_rendered_graph")).map((page) => page.url);
  return { run, pages, orphanUrls };
}

export async function queueBrowserCrawl(siteSlug: string, maxPages?: number) {
  const queued = await db().select({ id: schema.platformJobs.id }).from(schema.platformJobs)
    .where(inArray(schema.platformJobs.status, ["queued", "running"]))
    .limit(100);
  // The queue is intentionally idempotent per site/kind while work is active.
  const existing = await db().select().from(schema.platformJobs)
    .where(eq(schema.platformJobs.siteSlug, siteSlug))
    .orderBy(desc(schema.platformJobs.createdAt)).limit(20);
  const active = existing.find((job) => job.kind === "browser_crawl" && ["queued", "running"].includes(job.status));
  if (active) return active;
  const [job] = await db().insert(schema.platformJobs).values({
    siteSlug,
    kind: "browser_crawl",
    progress: { maxPages: maxPages ?? null, queueDepth: queued.length },
  }).returning();
  return job!;
}
