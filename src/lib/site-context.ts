/**
 * Routes whose data and mutations belong to one explicitly selected website.
 * Global workspaces such as Portfolio, Research and Action Centre must never
 * inherit a previously selected website.
 */
const SITE_CONTEXT_ROUTES = [
  "/domain",
  "/rankings",
  "/keyword-strategy",
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

export function siteIdFromLocation(pathname: string, siteQuery?: string | null): string | null {
  const match = pathname.match(/^\/sites\/([^/]+)/);
  return clean(match?.[1] ? decodeURIComponent(match[1]) : siteQuery);
}

export function requiresSiteContext(pathname: string): boolean {
  if (/^\/sites\/(?!new(?:\/|$))[^/]+/.test(pathname)) return true;
  return SITE_CONTEXT_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
