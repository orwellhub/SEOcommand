"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Settings, ChevronRight, ChevronDown, Circle, Folder, FolderPlus, Plus } from "lucide-react";
import { useDomain } from "./domain-context";
import { useLivePortfolio } from "@/lib/use-live";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";

export function PortfolioRail() {
  const { scope, setScope, sites, groups } = useDomain();
  const { data: pm } = useLivePortfolio();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const headline = (id: string) => pm?.domains.find((d) => d.domainId === id);

  /** Selecting a property both scopes the app and lands on that site's page. */
  function selectDomain(id: string) {
    setScope(id);
    router.push(`/domain/${id}`);
  }

  function selectPortfolio() {
    setScope("portfolio");
    router.push("/portfolio");
  }

  function selectGroup(id: string) {
    setScope(`group:${id}`);
    setExpanded((current) => new Set(current).add(id));
    router.push("/portfolio");
  }

  const childGroups = useMemo(() => {
    const map = new Map<string | null, typeof groups>();
    for (const group of groups) map.set(group.parentId, [...(map.get(group.parentId) ?? []), group]);
    return map;
  }, [groups]);
  const groupedSiteSlugs = useMemo(() => new Set(groups.flatMap((group) => group.siteSlugs)), [groups]);
  const activePath = useMemo(() => {
    const ids = new Set<string>();
    if (!scope.startsWith("group:")) return ids;
    let current = groups.find((group) => group.id === scope.slice(6));
    while (current) {
      ids.add(current.id);
      current = current.parentId ? groups.find((group) => group.id === current?.parentId) : undefined;
    }
    return ids;
  }, [groups, scope]);
  const ungroupedSites = sites.filter((site) => !groupedSiteSlugs.has(site.id));

  function siteRow(d: (typeof sites)[number], depth = 0) {
    const h = headline(d.id);
    const active = scope === d.id;
    return (
      <button
        key={`${d.id}-${depth}`}
        onClick={() => selectDomain(d.id)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-md py-2 pr-2 text-left transition-colors",
          active ? "bg-rail-selected" : "hover:bg-nav",
        )}
      >
        <Circle className="h-2.5 w-2.5 shrink-0" style={{ fill: d.accent, color: d.accent }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{d.name}</div>
          <div className="truncate text-[10px] text-white/40">{d.host}</div>
        </div>
        <span className="text-[10px] text-white/50 tnum">{h?.clicks28d != null ? compactNumber(h.clicks28d) : "—"}</span>
      </button>
    );
  }

  function groupRows(parentId: string | null = null, depth = 0): React.ReactNode {
    return (childGroups.get(parentId) ?? []).map((group) => {
      const children = childGroups.get(group.id) ?? [];
      const isOpen = expanded.has(group.id) || activePath.has(group.id);
      const directSites = group.siteSlugs.flatMap((slug) => sites.filter((site) => site.id === slug));
      return (
        <div key={group.id}>
          <div className="flex items-center">
            <button
              type="button"
              aria-label={isOpen ? `Collapse ${group.name}` : `Expand ${group.name}`}
              onClick={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id); else next.add(group.id);
                return next;
              })}
              style={{ marginLeft: `${depth * 12}px` }}
              className="rounded p-1 text-white/35 hover:bg-nav hover:text-white"
            >
              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <button
              onClick={() => selectGroup(group.id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left",
                scope === `group:${group.id}` ? "bg-rail-selected" : "hover:bg-nav",
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: group.color, fill: `${group.color}40` }} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</span>
              <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/50">{group.siteSlugs.length}</span>
            </button>
          </div>
          {isOpen && (
            <div>
              {groupRows(group.id, depth + 1)}
              {directSites.map((site) => siteRow(site, depth + 2))}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col bg-rail text-white lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
          <Layers className="h-4.5 w-4.5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Orwell</div>
          <div className="text-2xs text-white/50">SEO Command Centre</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={selectPortfolio}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors",
            scope === "portfolio" ? "bg-rail-selected" : "hover:bg-nav",
          )}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-white/70" />
            <span className="text-sm font-medium">Portfolio</span>
          </div>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-2xs text-white/70 tnum">
            {sites.length}
          </span>
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-white/40">
          <span>Portfolio map</span>
          <Link href="/sites" className="rounded p-1 hover:bg-nav hover:text-white" aria-label="Manage groups"><FolderPlus className="h-3.5 w-3.5" /></Link>
        </div>
        <nav className="space-y-0.5">
          {groups.length ? groupRows() : null}
          {groups.length > 0 && ungroupedSites.length > 0 && <div className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Ungrouped</div>}
          {(groups.length ? ungroupedSites : sites).map((site) => siteRow(site))}
        </nav>
        <Link
          href="/sites/new"
          className="mt-2 flex w-full items-center gap-2.5 rounded-md border border-dashed border-white/15 px-3 py-2 text-sm text-white/60 transition-colors hover:border-white/30 hover:bg-nav hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add website
        </Link>
      </div>

      <div className="mx-3 my-4 rounded-md bg-nav/60 p-3">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-white/40">
          Portfolio · last 28 days
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <RailStat label="Clicks" value={pm ? compactNumber(pm.totals.clicks28d) : "—"} />
          <RailStat
            label="Sessions"
            value={pm ? compactNumber(pm.totals.sessions28d) : "—"}
          />
          <RailStat
            label="Avg health"
            value={pm?.totals.avgHealth != null ? String(pm.totals.avgHealth) : "—"}
          />
          <RailStat
            label="Critical"
            value={pm ? String(pm.totals.criticalIssues) : "—"}
            tone={pm && pm.totals.criticalIssues > 0 ? "critical" : undefined}
          />
        </div>
        {pm && pm.totals.domainsSynced === 0 && (
          <p className="mt-2 text-[10px] leading-snug text-white/40">
            No sync has run yet — trigger the sync job to populate live data.
          </p>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/70 hover:bg-nav hover:text-white"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="h-4 w-4" /> Settings
          </span>
          <ChevronRight className="h-4 w-4 text-white/40" />
        </Link>
      </div>
    </aside>
  );
}

function RailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "critical";
}) {
  return (
    <div className="rounded bg-rail/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={cn("text-sm font-semibold tnum", tone === "critical" ? "text-critical" : "text-white")}>
        {value}
      </div>
    </div>
  );
}
