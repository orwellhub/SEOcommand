"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Circle, Folder, FolderPlus, Plus, Settings2 } from "lucide-react";
import { GLOBAL_NAV } from "@/lib/nav";
import { useDomain } from "./domain-context";
import { cn } from "@/lib/cn";

export function PortfolioRail() {
  const { scope, setScope, sites, groups } = useDomain();
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const childGroups = useMemo(() => {
    const map = new Map<string | null, typeof groups>();
    for (const group of groups) map.set(group.parentId, [...(map.get(group.parentId) ?? []), group]);
    return map;
  }, [groups]);
  const assigned = useMemo(() => new Set(groups.flatMap((group) => group.siteSlugs)), [groups]);

  function chooseSite(id: string) {
    setScope(id);
    router.push(`/sites/${id}`);
  }

  function chooseGroup(id: string) {
    setScope(`group:${id}`);
    setExpanded((value) => new Set(value).add(id));
    router.push("/portfolio");
  }

  function siteRow(site: (typeof sites)[number], depth = 0) {
    const active = scope === site.id;
    return (
      <div key={`${site.id}-${depth}`} className="group/site flex items-center">
        <button
          onClick={() => chooseSite(site.id)}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pr-1 text-left transition-colors", active ? "bg-rail-selected text-ink" : "text-muted hover:bg-card hover:text-ink")}
        >
          <Circle className="h-2.5 w-2.5 shrink-0" style={{ color: site.accent, fill: site.accent }} />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{site.name}</span><span className="block truncate text-[10px] opacity-65">{site.host}</span></span>
        </button>
        <Link href={`/sites/${site.id}/settings`} className="invisible mr-1 rounded p-1.5 text-muted hover:bg-card hover:text-ink group-hover/site:visible focus:visible" aria-label={`Settings for ${site.name}`}><Settings2 className="h-3.5 w-3.5" /></Link>
      </div>
    );
  }

  function groupRows(parentId: string | null = null, depth = 0): React.ReactNode {
    return (childGroups.get(parentId) ?? []).map((group) => {
      const active = scope === `group:${group.id}`;
      const open = expanded.has(group.id) || active;
      return (
        <div key={group.id}>
          <div className="flex items-center">
            <button onClick={() => setExpanded((current) => {
              const next = new Set(current);
              next.has(group.id) ? next.delete(group.id) : next.add(group.id);
              return next;
            })} className="rounded p-1 text-muted hover:bg-card" style={{ marginLeft: `${depth * 12}px` }} aria-label={open ? `Collapse ${group.name}` : `Expand ${group.name}`}>
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <button onClick={() => chooseGroup(group.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left", active ? "bg-rail-selected text-ink" : "text-muted hover:bg-card hover:text-ink")}>
              <Folder className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}30` }} />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</span>
              <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px]">{group.siteSlugs.length}</span>
            </button>
          </div>
          {open && <div>{groupRows(group.id, depth + 1)}{group.siteSlugs.flatMap((slug) => sites.filter((site) => site.id === slug)).map((site) => siteRow(site, depth + 2))}</div>}
        </div>
      );
    });
  }

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-rail text-ink lg:flex">
      <Link href="/action-centre" className="flex h-16 items-center gap-3 border-b border-border px-4">
        <span className="relative grid h-9 w-9 grid-cols-2 gap-1 rounded-md bg-ink p-2">
          <span className="rounded-[2px] bg-[#335CFF]" /><span className="rounded-[2px] bg-[#12B8C4]" /><span className="rounded-[2px] bg-[#FF6B5E]" /><span className="rounded-[2px] bg-[#F2B544]" />
        </span>
        <span className="leading-tight"><span className="block text-sm font-extrabold tracking-tight">Orwell Command</span><span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">SEO operations</span></span>
      </Link>

      <nav className="space-y-1 border-b border-border p-3">
        {GLOBAL_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors", active ? "bg-ink text-card shadow-sm" : "text-muted hover:bg-card hover:text-ink")}><Icon className={cn("h-4 w-4", active && "text-[#7FE4EA]")} />{item.label}</Link>;
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Portfolio map</div><div className="mt-0.5 text-2xs text-muted">{sites.length} websites</div></div>
          <Link href="/sites" className="rounded-md p-2 text-muted hover:bg-card hover:text-ink" aria-label="Manage portfolio groups"><FolderPlus className="h-4 w-4" /></Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div className="space-y-0.5">
            {groupRows()}
            {groups.length > 0 && sites.some((site) => !assigned.has(site.id)) && <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Ungrouped</div>}
            {(groups.length ? sites.filter((site) => !assigned.has(site.id)) : sites).map((site) => siteRow(site))}
          </div>
        </div>
        <div className="border-t border-border p-3">
          <Link href="/sites/new" className="flex items-center justify-center gap-2 rounded-md border border-dashed border-purple/40 bg-purple/5 px-3 py-2.5 text-sm font-semibold text-purple hover:bg-purple/10"><Plus className="h-4 w-4" /> Add website</Link>
        </div>
      </div>
    </aside>
  );
}
