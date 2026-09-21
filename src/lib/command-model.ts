import type { DomainLiveBundle } from "./live";
import type { TechnicalIssue, GscRow, Severity } from "./types";
import type { PageCoverageSummary } from "./page-coverage";

export type CommandRecord = { id: string; siteSlug: string; kind: string; recordKey: string; status: string; payload: Record<string, unknown>; nextRunAt: string | null; createdAt: string; updatedAt: string };
export type PageEvidence = { url: string; finalUrl: string | null; title: string | null; statusCode: number | null; canonical: string | null; indexable: boolean | null; hash: string | null; tracking: string[] | null; capturedAt: string; issues: string[] };
export type CommandTask = { id: string; title: string; status: string | null; targetUrl: string | null; shippedAt: string | null; updatedAt: string };
export type PageSummary = { url: string; title: string; clicks: number | null; impressions: number | null; position: number | null; keyEvents: number | null; keywords: { keyword: string; position: number | null }[]; backlinks: number | null; issues: TechnicalIssue[]; tasks: CommandTask[]; crawl: PageEvidence | null; watched: boolean };
export type CauseGroup = { id: string; title: string; confidence: "medium" | "low"; explanation: string; urls: string[]; sampled: boolean; findings: TechnicalIssue[]; severity: TechnicalIssue["severity"] };
export type LinkSuggestion = { id: string; sourceUrl: string; targetUrl: string; anchor: string; reason: string; confidence: "medium"; capturedAt: string };
export type SpeedResult = { url: string; finalUrl: string; device: "mobile" | "desktop"; testedAt: string; score: number | null; lcpMs: number | null; fcpMs: number | null; tbtMs: number | null; cls: number | null; speedIndexMs: number | null; lighthouseVersion: string; warnings: string[]; opportunities: { id: string; title: string; display: string; savingsMs: number | null }[]; field: { scope: "page" | "origin"; id: string; metrics: Record<string, { percentile: number; category: string }> } | null };
export type IndexResult = { url: string; inspectedAt: string; verdict: string; coverage: string; lastCrawl: string | null; robots: string; indexing: string; googleCanonical: string | null; userCanonical: string | null; inspectionLink: string | null };
export type BusinessRow = { date: string; url: string; event: string; category: string; count: number };
export type BusinessResult = { collectedAt: string; start: string; end: string; rows: BusinessRow[]; mapping: Record<string, string>; rowCount: number; truncated: boolean; thresholded: boolean };
export type TimelineEntry = { id: string; date: string; title: string; type: string; url: string | null; href: string };
export type HealthRow = { lastAttemptAt?: string | null; lastAttemptStatus?: string | null; id: string; label: string; state: "ready" | "stale" | "missing" | "needs_connection" | "failed"; updatedAt: string | null; through: string | null; href: string; detail: string; nextRunAt?: string | null };
/** Whether AI systems may retrieve, and then quote, this website. */
export type AiBotAccessRow = {
  bot: string;
  category: "training" | "search" | "assistant";
  access: "allowed" | "partial" | "blocked" | "unknown";
  evidence: string;
  severity: Severity | null;
  checkedPages: number | null;
  blockedPages: number | null;
  samples: string[];
  /** What the token controls, where that is widely misread. */
  governs: string | null;
};

export type AiReadiness = {
  botAccess: { capturedOn: string | null; rows: AiBotAccessRow[] };
  discovery: {
    checkedAt: string | null;
    llms: { present: boolean; valid: boolean; problems: string[]; linkCount: number; sectionCount: number } | null;
    xRobotsTag: { raw: string | null; noindex: boolean; nosnippet: boolean; maxSnippet: number | null } | null;
    robotsSitemapDirective: boolean | null;
  };
  answers: { capturedAt: string | null; pages: number; counts: { id: string; pages: number }[] };
};

export type SiteCommand = { connections?: { indexing: { configured: boolean; property: string | null } }; site: { id: string; name: string; host: string }; generatedAt: string; synthetic: boolean; storageAvailable: boolean; bundle: DomainLiveBundle; pages: PageSummary[]; pageCoverage: { saved: number; loaded: number }; pageStats: PageCoverageSummary; causes: CauseGroup[]; aiReadiness: AiReadiness; links: LinkSuggestion[]; records: CommandRecord[]; tasks: CommandTask[]; timeline: TimelineEntry[]; health: HealthRow[]; brandTerms: string[]; brand: ReturnType<typeof segmentBrand>; business: BusinessResult | null; permissions: { edit: boolean; scan: boolean; settings: boolean } };

/** Preserve query strings and trailing slashes: they can represent distinct pages. */
export function siteUrl(value: string, host: string): string | null {
  try {
    const url = new URL(value, `https://${host}`);
    const normalize = (s: string) => s.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || normalize(url.hostname) !== normalize(host)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
export function urlKey(value: string, host: string): string | null {
  const valid = siteUrl(value, host);
  if (!valid) return null;
  const url = new URL(valid);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname}${url.search}`;
}
const words = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function segmentBrand(rows: GscRow[] | undefined, terms: string[], totalClicks: number | null) {
  const aliases = [...new Set(terms.map(words).filter(Boolean))];
  const branded: GscRow[] = [], nonBrand: GscRow[] = [];
  for (const row of rows ?? []) {
    const query = ` ${words(row.key)} `;
    (aliases.some((alias) => query.includes(` ${alias} `)) ? branded : nonBrand).push(row);
  }
  const totals = (items: GscRow[]) => ({ clicks: items.reduce((sum, r) => sum + r.clicks, 0), impressions: items.reduce((sum, r) => sum + r.impressions, 0), queries: items.length });
  const classified = (rows ?? []).reduce((sum, r) => sum + r.clicks, 0);
  return { available: Boolean(rows), configured: aliases.length > 0, brand: totals(branded), nonBrand: totals(nonBrand), coveragePct: totalClicks != null && totalClicks > 0 ? Math.min(100, classified / totalClicks * 100) : null, rows: (rows ?? []).map((row) => ({ ...row, brand: aliases.length ? branded.includes(row) : null })) };
}

export function unifiedPages(host: string, bundle: DomainLiveBundle, crawls: PageEvidence[], tasks: CommandTask[], watched: string[], inspected: string[] = []): PageSummary[] {
  const pages = new Map<string, PageSummary>();
  const get = (value: string) => {
    const key = urlKey(value, host), url = siteUrl(value, host);
    if (!key || !url) return null;
    if (!pages.has(key)) pages.set(key, { url, title: new URL(url).pathname, clicks: null, impressions: null, position: null, keyEvents: null, keywords: [], backlinks: null, issues: [], tasks: [], crawl: null, watched: watched.some((item) => urlKey(item, host) === key) });
    return pages.get(key)!;
  };
  for (const row of bundle.datasets.gsc_pages?.data ?? []) { const page = get(row.key); if (page) { page.clicks = (page.clicks ?? 0) + row.clicks; const oldImpressions = page.impressions ?? 0; page.impressions = oldImpressions + row.impressions; page.position = page.impressions ? ((page.position ?? 0) * oldImpressions + row.position * row.impressions) / page.impressions : null; } }
  for (const row of bundle.datasets.ga4_dashboard?.data.pages ?? []) { const page = get(`https://${row.host}${row.path}`); if (page && row.title) page.title = row.title; }
  for (const row of crawls) { const page = get(row.url); if (page) { page.crawl = row; page.title = row.title || page.title; } }
  for (const row of bundle.datasets.ga4_landing_pages?.data ?? []) { const page = get(row.landingPage); if (page) page.keyEvents = (page.keyEvents ?? 0) + row.conversions; }
  for (const row of bundle.datasets.keywords?.data ?? []) { const page = row.targetUrl && get(row.targetUrl); if (page) page.keywords.push({ keyword: row.keyword, position: row.position }); }
  for (const row of bundle.datasets.backlinks?.data ?? []) { const page = get(row.targetUrl); if (page && row.status !== "lost") page.backlinks = (page.backlinks ?? 0) + 1; }
  for (const issue of bundle.datasets.onpage?.data.issues ?? []) if (issue.status !== "resolved") for (const url of issue.samplePages) { const page = get(url); if (page && !page.issues.some((item) => item.id === issue.id)) page.issues.push(issue); }
  for (const row of tasks) { const page = row.targetUrl && get(row.targetUrl); if (page) page.tasks.push(row); }
  for (const url of [...watched, ...inspected]) get(url);
  return [...pages.values()].sort((a, b) => Number(b.watched) - Number(a.watched) || (b.clicks ?? -1) - (a.clicks ?? -1));
}

export function groupCauses(issues: TechnicalIssue[], host: string): CauseGroup[] {
  const families: [RegExp, string, string][] = [
    [/canonical|duplicate/i, "canonical", "Canonical or duplicate-page rules"],
    [/robots|noindex|indexab/i, "indexing", "Shared indexing directives"],
    [/redirect|30[1278]/i, "redirect", "Redirect routing rules"],
    [/title|description|heading|h1/i, "metadata", "Shared page-title or metadata template"],
    [/404|broken|not found/i, "broken", "Broken destination or removed-page routing"],
    [/url.*(character|friendly)|friendly.*url/i, "url", "URL generation rules"],
    [/image|alt text/i, "images", "Image or media template"],
    [/slow|performance|large.*(page|size)/i, "performance", "Shared page resources"],
  ];
  const groups = new Map<string, CauseGroup>();
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  for (const issue of issues.filter((row) => row.status !== "resolved")) {
    const family = families.find(([pattern]) => pattern.test(`${issue.title} ${issue.explanation}`));
    const urls = [...new Set(issue.samplePages.map((url) => siteUrl(url, host)).filter((url): url is string => Boolean(url)))];
    const prefixes = urls.map((url) => new URL(url).pathname.split("/").filter(Boolean)[0] ?? "homepage");
    const prefix = urls.length >= 2 && new Set(prefixes).size === 1 ? prefixes[0]! : "website";
    const id = `${family?.[1] ?? issue.id}:${prefix}`;
    const group = groups.get(id) ?? { id, title: family ? `${family[2]}${prefix !== "website" ? ` · /${prefix}/` : ""}` : issue.title, confidence: "low" as const, explanation: "Suspected shared cause based on saved issue evidence and URL patterns. Confirm the template or setting before making changes.", urls: [], sampled: false, findings: [], severity: issue.severity };
    group.findings.push(issue); group.urls = [...new Set([...group.urls, ...urls])];
    group.sampled ||= issue.affectedPages > urls.length;
    if (order[issue.severity] > order[group.severity]) group.severity = issue.severity;
    if (family && group.urls.length >= 3 && prefix !== "website") group.confidence = "medium";
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => order[b.severity] - order[a.severity] || b.urls.length - a.urls.length);
}

export function suggestLinks(pages: PageSummary[], edges: { sourceUrl: string; targetUrl: string }[], host: string, capturedAt: string | null): LinkSuggestion[] {
  if (!capturedAt) return [];
  const existing = new Set(edges.map((edge) => `${urlKey(edge.sourceUrl, host)}>${urlKey(edge.targetUrl, host)}`));
  const results: LinkSuggestion[] = [];
  const stop = new Set(["the", "and", "for", "with", "from", "your", "our", "home", "page"]);
  const tokens = (s: string) => new Set(words(s).split(" ").filter((word) => word.length >= 3 && !stop.has(word)));
  for (const target of pages.filter((page) => page.crawl?.indexable && page.crawl.statusCode === 200 && page.impressions && page.position && page.position > 3).slice(0, 40)) {
    const targetWords = tokens(`${target.title} ${target.keywords.map((row) => row.keyword).join(" ")}`);
    for (const source of pages.filter((page) => page.crawl?.statusCode === 200 && page.crawl.indexable && page.url !== target.url)) {
      const key = `${urlKey(source.url, host)}>${urlKey(target.url, host)}`;
      if (existing.has(key)) continue;
      const shared = [...tokens(source.title)].filter((token) => targetWords.has(token));
      if (shared.length < 2) continue;
      results.push({ id: key, sourceUrl: source.url, targetUrl: target.url, anchor: target.keywords[0]?.keyword ?? target.title, confidence: "medium", reason: `Titles share “${shared.slice(0, 3).join(", ")}”; no link between these pages was found in the saved browser crawl. Review placement and wording.`, capturedAt });
      if (results.filter((item) => item.targetUrl === target.url).length === 2) break;
    }
  }
  return results.slice(0, 30);
}

export function migrationDiff(before: PageEvidence[], after: PageEvidence[], host: string) {
  const current = new Map(after.map((page) => [urlKey(page.url, host), page]));
  return before.flatMap((old) => {
    const page = current.get(urlKey(old.url, host));
    const changes: string[] = [];
    if (!page) changes.push("URL missing from the latest saved crawl; verify it directly.");
    else {
      if (page.statusCode !== old.statusCode) changes.push(`HTTP status: ${old.statusCode ?? "unknown"} → ${page.statusCode ?? "unknown"}`);
      if (page.finalUrl !== old.finalUrl) changes.push(`Destination changed: ${page.finalUrl ?? page.url}`);
      if (page.title !== old.title) changes.push("Page title changed");
      if (page.canonical !== old.canonical) changes.push("Canonical changed");
      if (page.indexable !== old.indexable) changes.push(`Indexing directives: ${page.indexable === null ? "unknown" : page.indexable ? "allow" : "block"}`);
      if (old.tracking && page.tracking && old.tracking.some((id) => !page.tracking!.includes(id))) changes.push("Previously detected tracking tag no longer detected; verify consent and tag execution.");
    }
    return changes.length ? [{ url: old.url, changes }] : [];
  });
}

export function keywordOverlap(entries: { site: { id: string; name: string; host: string }; bundle: DomainLiveBundle }[]) {
  const terms = new Map<string, { siteId: string; siteName: string; url: string | null; position: number | null; collectedAt: string; market: string }[]>();
  for (const { site, bundle } of entries) for (const row of bundle.datasets.keywords?.data ?? []) {
    const key = `${words(row.keyword)}|${row.location}`;
    const list = terms.get(key) ?? [];
    if (!list.some((item) => item.siteId === site.id)) list.push({ siteId: site.id, siteName: site.name, url: row.targetUrl, position: row.position, collectedAt: bundle.datasets.keywords!.provenance.collectedAt, market: row.location });
    terms.set(key, list);
  }
  return [...terms.entries()].filter(([, sites]) => sites.length > 1).map(([key, sites]) => ({ query: key.split("|")[0]!, sites })).sort((a, b) => b.sites.length - a.sites.length).slice(0, 200);
}
