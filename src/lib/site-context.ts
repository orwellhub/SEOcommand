/**
 * Routes whose data and mutations belong to one explicitly selected website.
 * The server still requires an explicit website ID. Client navigation carries
 * the user's selected website into these routes before their tools mount.
 */
const SITE_CONTEXT_ROUTES = [
  "/domain",
  "/traffic-analytics",
  "/pages",
  "/questions",
  "/health",
  "/rankings",
  "/keyword-strategy",
  "/serp-intelligence",
  "/market-intelligence",
  "/competitors",
  "/site-audit",
  "/technical-crawler",
  "/monitoring",
  "/content",
  "/backlinks",
  "/link-building",
  "/local-seo",
  "/recommendations",
  "/scan-centre",
  "/reports/client",
] as const;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "new" ? trimmed : null;
}

export function siteIdFromLocation(
  pathname: string,
  siteQuery?: string | null,
): string | null {
  const match = pathname.match(/^\/sites\/([^/]+)/);
  return clean(match?.[1] ? decodeURIComponent(match[1]) : siteQuery);
}

export function requiresSiteContext(pathname: string): boolean {
  if (/^\/sites\/(?!new(?:\/|$))[^/]+/.test(pathname)) return true;
  return SITE_CONTEXT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Explicit destinations win over the remembered selection, including Back/Forward. */
export function scopeFromLocation(pathname: string, params: URLSearchParams, saved: string | null): string {
  const site = siteIdFromLocation(pathname, params.get("site"));
  if (site) return site;
  const scope = params.get("scope");
  if (scope === "portfolio" || scope?.startsWith("group:")) return scope;
  // Existing task/dashboard deep links use ?scope=<website>.
  if (["/portfolio", "/action-centre"].includes(pathname) && clean(scope)) return clean(scope)!;
  return clean(saved) ?? "portfolio";
}

/** Carry context only into tools that support it; shared admin/research stay shared. */
export function hrefWithScope(href: string, scope: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, "https://seo-command.local");
  if (siteIdFromLocation(url.pathname, url.searchParams.get("site")) || url.searchParams.has("scope")) return href;
  if (url.pathname === "/sites/new" || url.searchParams.get("workspace") === "global") return href;
  if (scope === "portfolio") return href;
  if (scope.startsWith("group:")) {
    if (!["/portfolio", "/action-centre", "/work", "/outcomes", "/notifications", "/performance"].includes(url.pathname)) return href;
    url.searchParams.set("scope", scope);
  } else {
    if (!requiresSiteContext(url.pathname) && !["/portfolio", "/research", "/keyword-research", "/domain-research", "/reports", "/performance", "/action-centre", "/ai-visibility", "/work", "/outcomes", "/notifications", "/performance"].includes(url.pathname)) return href;
    url.searchParams.set("site", scope);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A deliberate website switch preserves the tool, but clears record-specific links. */
export function switchScopeHref(pathname: string, params: URLSearchParams, scope: string): string {
  const next = new URLSearchParams(params);
  for (const key of ["site", "scope", "domain", "item", "evidence", "mapping", "issue", "page", "url", "cause"]) next.delete(key);
  const singleSite = scope !== "portfolio" && !scope.startsWith("group:");
  let path = pathname;
  if (/^\/sites\/(?!new)[^/]+/.test(path)) {
    path = singleSite && path.endsWith("/settings") ? `/sites/${encodeURIComponent(scope)}/settings` : "/portfolio";
  }
  if (!singleSite && requiresSiteContext(path)) path = "/portfolio";
  if (singleSite && !path.startsWith("/sites/")) next.set("site", scope);
  else if (!singleSite) next.set("scope", scope);
  return `${path}${next.size ? `?${next}` : ""}`;
}

export function scopedSiteIds(scope: string, sites: { id: string }[], groups: { id: string; parentId: string | null; siteSlugs: string[] }[]): Set<string> {
  if (scope === "portfolio") return new Set(sites.map((site) => site.id));
  if (!scope.startsWith("group:")) return new Set([scope]);
  const included = new Set([scope.slice(6)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) if (group.parentId && included.has(group.parentId) && !included.has(group.id)) { included.add(group.id); changed = true; }
  }
  return new Set(groups.filter((group) => included.has(group.id)).flatMap((group) => group.siteSlugs));
}
