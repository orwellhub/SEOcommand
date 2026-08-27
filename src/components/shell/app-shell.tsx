"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight, Building2 } from "lucide-react";
import { PortfolioRail } from "./portfolio-rail";
import { TopNav } from "./top-nav";
import { ContextBar } from "./context-bar";
import { MobileNav } from "./mobile-nav";
import { useDomain } from "./domain-context";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { requiresSiteContext, siteIdFromLocation } from "@/lib/site-context";

function SiteContextBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeDomain, sites, sitesLoading } = useDomain();
  const requestedSiteId = siteIdFromLocation(pathname, searchParams.get("site"));

  if (!requiresSiteContext(pathname) && !requestedSiteId) return children;
  if (requestedSiteId && activeDomain?.id === requestedSiteId) return children;

  const requestedSite = requestedSiteId
    ? sites.find((site) => site.id === requestedSiteId)
    : null;
  if (sitesLoading || requestedSite) {
    return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-56" /></div>;
  }

  return (
    <div className="space-y-5">
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title={requestedSiteId ? "Website not available" : "Choose a website"}
        description={requestedSiteId
          ? "This website does not exist or is outside your access. No other website has been substituted."
          : "This tool works on one website at a time. Choose the website explicitly before opening its data or actions."}
      />
      {sites.length > 0 && (
        <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
          {sites.map((site) => {
            const href = pathname.startsWith("/sites/")
              ? `/sites/${encodeURIComponent(site.id)}`
              : `${pathname}?site=${encodeURIComponent(site.id)}`;
            return <Link key={site.id} href={href} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-purple/35"><span className="h-3 w-3 rounded-full" style={{ background: site.accent }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{site.name}</span><span className="block truncate text-2xs text-muted">{site.host}</span></span><ArrowRight className="h-4 w-4 text-muted" /></Link>;
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Application chrome.
 *
 * Height uses 100dvh (dynamic viewport height) rather than 100vh: iOS Safari
 * measures 100vh against the *expanded* viewport, so on iPad the bottom of the
 * shell sat under the browser chrome and the header scrolled out of reach. With
 * dvh the shell always matches the visible area, and the header is pinned in a
 * shrink-0 row so only the module content scrolls.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-workspace">
      <PortfolioRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 shrink-0">
          <div className="relative">
            <div className="absolute left-2 top-3 z-10 lg:hidden"><MobileNav /></div>
            <div className="min-w-0 lg:pl-0 pl-12"><TopNav /></div>
          </div>
          <ContextBar />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8"><SiteContextBoundary>{children}</SiteContextBoundary></div>
        </main>
      </div>
    </div>
  );
}
