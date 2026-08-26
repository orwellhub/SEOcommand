"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Settings2 } from "lucide-react";
import { SITE_NAV, TECHNICAL_SECONDARY, KEYWORD_SECONDARY, BACKLINK_SECONDARY } from "@/lib/nav";
import { useDomain, type RangeKey } from "./domain-context";
import { cn } from "@/lib/cn";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "28d", label: "28 days" },
  { key: "90d", label: "90 days" },
];

export function ContextBar() {
  const { scope, activeDomain, activeGroup, range, setRange } = useDomain();
  const pathname = usePathname();
  const siteId = activeDomain?.id;
  const title = activeDomain?.name ?? activeGroup?.name ?? "All websites";
  const subtitle = activeDomain?.host ?? (activeGroup ? "Group and nested subgroups" : "Portfolio-wide view");
  const navItems = pathname.startsWith("/site-audit") || pathname.startsWith("/technical-crawler") || pathname.startsWith("/monitoring")
    ? [SITE_NAV[5]!, ...TECHNICAL_SECONDARY]
    : pathname.startsWith("/keyword")
      ? [SITE_NAV[3]!, ...KEYWORD_SECONDARY]
      : pathname.startsWith("/backlink") || pathname.startsWith("/link-building")
        ? [SITE_NAV[7]!, ...BACKLINK_SECONDARY]
        : SITE_NAV;

  return (
    <div className="border-b border-border bg-card">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-6">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: activeDomain?.accent ?? activeGroup?.color ?? "#335CFF" }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{title}</div>
          <div className="truncate text-2xs text-muted">{subtitle}</div>
        </div>
        {activeDomain && <a href={`https://${activeDomain.host}`} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold text-muted hover:bg-workspace hover:text-ink sm:flex">Visit site <ExternalLink className="h-3.5 w-3.5" /></a>}
        {siteId && <Link href={`/sites/${siteId}/settings`} className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-semibold", pathname.includes("/settings") ? "bg-purple/10 text-purple" : "text-muted hover:bg-workspace hover:text-ink")}><Settings2 className="h-3.5 w-3.5" /> Settings</Link>}
        <div className="hidden items-center gap-0.5 rounded-md border border-border bg-workspace p-0.5 md:flex">
          {RANGES.map((item) => <button key={item.key} onClick={() => setRange(item.key)} className={cn("rounded px-2.5 py-1.5 text-2xs font-semibold", range === item.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}>{item.label}</button>)}
        </div>
      </div>
      {siteId && (
        <nav className="flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Website workspace">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href) || (item.label === "Overview" && pathname === `/sites/${siteId}`);
            const Icon = item.icon;
            const href = item.label === "Overview" ? `/sites/${siteId}` : `${item.href}?site=${siteId}`;
            return <Link key={`${item.href}-${item.label}`} href={href} className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-semibold", active ? "border-purple text-purple" : "border-transparent text-muted hover:border-border hover:text-ink")}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
          })}
        </nav>
      )}
      {!siteId && <div className="h-1" style={{ background: scope.startsWith("group:") ? activeGroup?.color : "#335CFF" }} />}
    </div>
  );
}
