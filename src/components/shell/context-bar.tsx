"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, ExternalLink, ScanLine, Settings2 } from "lucide-react";
import { SITE_NAV, SCAN_CENTRE, TECHNICAL_SECONDARY, KEYWORD_SECONDARY, BACKLINK_SECONDARY, RESEARCH_NAV } from "@/lib/nav";
import { useDomain, type RangeKey } from "./domain-context";
import { cn } from "@/lib/cn";
import { siteIdFromLocation } from "@/lib/site-context";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "28d", label: "28 days" },
  { key: "90d", label: "90 days" },
];

function isWebsiteWorkspace(pathname: string, siteQuery: string | null) {
  return Boolean(pathname.match(/^\/sites\/(?!new(?:\/|$))[^/]+/) || siteQuery);
}

export function ContextBar() {
  const { activeDomain, groups, range, setRange } = useDomain();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const siteQuery = searchParams.get("site");
  const websiteMode = isWebsiteWorkspace(pathname, siteQuery);
  const siteId = activeDomain?.id;

  if (!websiteMode && (pathname === "/research" || pathname.startsWith("/keyword-research"))) {
    return (
      <div className="border-b border-border bg-card">
        <div className="flex min-h-11 items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-2xs text-muted"><span className="font-bold uppercase tracking-[0.14em] text-purple">Global research</span><ChevronRight className="h-3 w-3" /><span className="truncate text-ink">Independent of any website</span></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Global research workspace">
          {RESEARCH_NAV.map((item) => { const Icon = item.icon; const path = item.href.split("?")[0]!; const view = new URLSearchParams(item.href.split("?")[1] ?? "").get("view"); const active = pathname === path && (view ? searchParams.get("view") === view : !searchParams.get("view")); return <Link key={item.href} href={item.href} className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-semibold", active ? "border-purple text-purple" : "border-transparent text-muted hover:border-border hover:text-ink")}><Icon className="h-3.5 w-3.5" />{item.label}</Link>; })}
        </nav>
      </div>
    );
  }

  const requestedSiteId = siteIdFromLocation(pathname, siteQuery);
  if (!websiteMode || !activeDomain || !siteId || requestedSiteId !== siteId) return null;

  const overview = SITE_NAV[0]!;
  const navItems = pathname.startsWith("/site-audit") || pathname.startsWith("/technical-crawler") || pathname.startsWith("/monitoring")
    ? [overview, SCAN_CENTRE, SITE_NAV[5]!, ...TECHNICAL_SECONDARY]
    : pathname.startsWith("/keyword")
      ? [overview, SCAN_CENTRE, SITE_NAV[3]!, ...KEYWORD_SECONDARY]
      : pathname.startsWith("/backlink") || pathname.startsWith("/link-building")
        ? [overview, SCAN_CENTRE, SITE_NAV[7]!, ...BACKLINK_SECONDARY]
        : [overview, SCAN_CENTRE, ...SITE_NAV.slice(1)];
  const primaryGroup = groups.find((group) => group.primarySiteSlugs?.includes(siteId))
    ?? groups.find((group) => group.siteSlugs.includes(siteId));
  const currentLabel = [SCAN_CENTRE, ...SITE_NAV, ...TECHNICAL_SECONDARY, ...KEYWORD_SECONDARY, ...BACKLINK_SECONDARY]
    .find((item) => pathname.startsWith(item.href) && !(item.label === "Overview" && pathname !== `/sites/${siteId}`))?.label
    ?? (pathname.includes("/settings") ? "Settings" : "Overview");
  const scanModule = pathname.startsWith("/research") ? "google"
    : pathname.startsWith("/rankings") ? "rankings"
      : pathname.startsWith("/keyword") ? "keywords"
        : pathname.startsWith("/competitor") ? "competitors"
          : pathname.startsWith("/site-audit") || pathname.startsWith("/technical-crawler") ? "technical"
            : pathname.startsWith("/monitoring") ? "reliability"
              : pathname.startsWith("/backlink") || pathname.startsWith("/link-building") ? "backlinks"
                : pathname.startsWith("/ai-visibility") ? "ai"
                  : pathname.startsWith("/local-seo") ? "local" : null;

  return (
    <div className="border-b border-border bg-card">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
        <Link href={`/sites/${siteId}`} className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-workspace px-2.5 text-xs font-semibold text-ink hover:border-purple/35 hover:text-purple" aria-label={`Back to ${activeDomain.name} overview`}>
          <ArrowLeft className="h-3.5 w-3.5" /> Overview
        </Link>
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-2xs text-muted md:flex" aria-label="Breadcrumb">
          <Link href="/portfolio" className="hover:text-ink">Portfolio</Link>
          <ChevronRight className="h-3 w-3" />
          {primaryGroup && <><Link href="/portfolio" className="truncate hover:text-ink">{primaryGroup.name}</Link><ChevronRight className="h-3 w-3" /></>}
          <Link href={`/sites/${siteId}`} className="truncate font-semibold text-ink">{activeDomain.name}</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate" style={{ color: activeDomain.accent }}>{currentLabel}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {scanModule && <Link href={`/scan-centre?site=${siteId}&module=${scanModule}`} className="hidden items-center gap-1.5 rounded-md border border-purple/20 bg-purple/5 px-2.5 py-2 text-xs font-semibold text-purple hover:bg-purple/10 sm:flex"><ScanLine className="h-3.5 w-3.5" /> Scan this tool</Link>}
          <a href={`https://${activeDomain.host}`} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold text-muted hover:bg-workspace hover:text-ink sm:flex">Visit site <ExternalLink className="h-3.5 w-3.5" /></a>
          <Link href={`/sites/${siteId}/settings`} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold", pathname.includes("/settings") ? "bg-purple/10 text-purple" : "text-muted hover:bg-workspace hover:text-ink")}><Settings2 className="h-3.5 w-3.5" /> Settings</Link>
          <div className="hidden items-center gap-0.5 rounded-md border border-border bg-workspace p-0.5 lg:flex">
            {RANGES.map((item) => <button key={item.key} onClick={() => setRange(item.key)} className={cn("rounded px-2.5 py-1.5 text-2xs font-semibold", range === item.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}>{item.label}</button>)}
          </div>
        </div>
      </div>
      {!pathname.includes("/settings") && (
        <nav className="flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Website workspace">
          {navItems.map((item) => {
            const active = item.label === "Overview" ? pathname === `/sites/${siteId}` : pathname.startsWith(item.href);
            const Icon = item.icon;
            const href = item.label === "Overview" ? `/sites/${siteId}` : `${item.href}?site=${siteId}`;
            return <Link key={`${item.href}-${item.label}`} href={href} className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-semibold", active ? "border-[color:var(--accent)] text-[color:var(--accent)]" : "border-transparent text-muted hover:border-border hover:text-ink")}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
          })}
        </nav>
      )}
    </div>
  );
}
