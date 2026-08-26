"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, Layers, Circle, Folder } from "lucide-react";
import { useDomain, type RangeKey } from "./domain-context";
import { cn } from "@/lib/cn";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
];

export function ContextBar() {
  const { scope, setScope, range, setRange, sites, groups, activeGroup } = useDomain();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  /** Switching scope from the picker also navigates to that scope's home. */
  function choose(next: string) {
    setScope(next as typeof scope);
    router.push(next === "portfolio" || next.startsWith("group:") ? "/portfolio" : `/domain/${next}`);
    setOpen(false);
  }

  const current =
    scope === "portfolio"
      ? { name: "Portfolio", host: "All domains", accent: "#7137F5" }
      : scope.startsWith("group:")
        ? { name: activeGroup?.name ?? "Portfolio group", host: "Includes nested subgroups", accent: activeGroup?.color ?? "#7137F5" }
      : sites.find((d) => d.id === scope) ?? { name: String(scope), host: String(scope), accent: "#7137F5" };

  const filtered = sites.filter(
    (d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.host.includes(q.toLowerCase()),
  );
  const orderedGroups = useMemo(() => {
    const ordered: { group: (typeof groups)[number]; depth: number }[] = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const group of groups.filter((item) => item.parentId === parentId)) {
        ordered.push({ group, depth });
        visit(group.id, depth + 1);
      }
    };
    visit(null, 0);
    return ordered.filter(({ group }) => group.name.toLowerCase().includes(q.toLowerCase()));
  }, [groups, q]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1.5 hover:bg-workspace"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {scope === "portfolio" ? (
            <Layers className="h-4 w-4 text-purple" />
          ) : scope.startsWith("group:") ? (
            <Folder className="h-4 w-4" style={{ color: current.accent, fill: `${current.accent}30` }} />
          ) : (
            <Circle className="h-3 w-3" style={{ fill: current.accent, color: current.accent }} />
          )}
          <div className="text-left leading-tight">
            <div className="text-sm font-semibold text-ink">{current.name}</div>
            <div className="text-2xs text-muted">{current.host}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
            <div className="animate-in absolute left-0 top-full z-30 mt-1.5 w-72 rounded-md border border-border bg-card p-1.5 shadow-pop">
              <div className="relative mb-1.5">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search groups or websites…"
                  className="h-8 w-full rounded-md border border-border bg-workspace pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:outline-none"
                />
              </div>
              <button
                onClick={() => choose("portfolio")}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-workspace"
              >
                <Layers className="h-4 w-4 text-purple" />
                <span className="flex-1 font-medium text-ink">Portfolio</span>
                {scope === "portfolio" && <Check className="h-4 w-4 text-purple" />}
              </button>
              {orderedGroups.map(({ group, depth }) => (
                <button
                  key={group.id}
                  onClick={() => choose(`group:${group.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-workspace"
                  style={{ paddingLeft: `${10 + depth * 16}px` }}
                >
                  <Folder className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}30` }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{group.name}</div>
                    <div className="text-2xs text-muted">{group.siteSlugs.length} directly assigned</div>
                  </div>
                  {scope === `group:${group.id}` && <Check className="h-4 w-4 text-purple" />}
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => choose(d.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-workspace"
                >
                  <Circle className="h-3 w-3" style={{ fill: d.accent, color: d.accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{d.name}</div>
                    <div className="truncate text-2xs text-muted">{d.host}</div>
                  </div>
                  {scope === d.id && <Check className="h-4 w-4 text-purple" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-2.5 py-4 text-center text-xs text-muted">No domains found</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Range selector */}
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-workspace p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              range === r.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
