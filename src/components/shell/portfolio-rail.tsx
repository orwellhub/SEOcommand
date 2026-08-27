"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check, ChevronDown, ChevronRight, Circle, Ellipsis, Folder, FolderOpen,
  FolderPlus, GripVertical, Pencil, Plus, Settings2, Trash2, X,
} from "lucide-react";
import { GLOBAL_NAV } from "@/lib/nav";
import { useDomain } from "./domain-context";
import { cn } from "@/lib/cn";
import type { PortfolioGroup } from "@/platform/types";

type DropMode = "before" | "inside" | "after";

export function PortfolioRail() {
  const { scope, setScope, sites, groups, refreshPortfolio } = useDomain();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{ id: string; mode: DropMode } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const orderedGroups = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [groups],
  );
  const childGroups = useMemo(() => {
    const map = new Map<string | null, PortfolioGroup[]>();
    for (const group of orderedGroups) map.set(group.parentId, [...(map.get(group.parentId) ?? []), group]);
    return map;
  }, [orderedGroups]);
  const primaryGroupBySite = useMemo(() => {
    const result = new Map<string, string>();
    for (const group of orderedGroups) {
      for (const slug of group.primarySiteSlugs ?? []) result.set(slug, group.id);
    }
    for (const group of orderedGroups) {
      for (const slug of group.siteSlugs) if (!result.has(slug)) result.set(slug, group.id);
    }
    return result;
  }, [orderedGroups]);

  function announce(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4500);
  }

  function chooseSite(id: string) {
    setScope(id);
    router.push(`/sites/${id}`);
  }

  function chooseGroup(id: string) {
    setScope(`group:${id}`);
    setExpanded((value) => new Set(value).add(id));
    router.push("/portfolio");
  }

  async function updateGroup(id: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolio-groups/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The folder could not be updated.");
      await refreshPortfolio();
      announce(success);
    } catch (error) {
      announce(error instanceof Error ? error.message : "The folder could not be updated.");
    } finally {
      setBusy(false);
      setDragTarget(null);
    }
  }

  async function renameGroup(group: PortfolioGroup) {
    const next = editingName.trim();
    if (next.length < 2 || next === group.name) {
      setEditingId(null);
      return;
    }
    await updateGroup(group.id, { name: next }, `Renamed folder to ${next}.`);
    setEditingId(null);
  }

  async function deleteGroup(group: PortfolioGroup) {
    if (!window.confirm(`Delete “${group.name}”? Websites become unfiled and subfolders move to the portfolio root.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolio-groups/${group.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("The folder could not be deleted.");
      await refreshPortfolio();
      announce(`Deleted ${group.name}.`);
    } catch (error) {
      announce(error instanceof Error ? error.message : "The folder could not be deleted.");
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function moveSite(siteSlug: string, primaryGroupId: string | null) {
    const memberships = groups.filter((group) => group.siteSlugs.includes(siteSlug)).map((group) => group.id);
    const groupIds = primaryGroupId ? [...new Set([primaryGroupId, ...memberships])] : [];
    setBusy(true);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(siteSlug)}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupIds, primaryGroupId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The website could not be moved.");
      await refreshPortfolio();
      const target = primaryGroupId ? groups.find((group) => group.id === primaryGroupId)?.name : "Unfiled";
      announce(`Moved ${sites.find((site) => site.id === siteSlug)?.name ?? siteSlug} to ${target}.`);
      if (primaryGroupId) setExpanded((value) => new Set(value).add(primaryGroupId));
    } catch (error) {
      announce(error instanceof Error ? error.message : "The website could not be moved.");
    } finally {
      setBusy(false);
      setDragTarget(null);
    }
  }

  async function dropOnGroup(event: React.DragEvent, group: PortfolioGroup) {
    event.preventDefault();
    event.stopPropagation();
    const siteSlug = event.dataTransfer.getData("application/x-orwell-site");
    if (siteSlug) return moveSite(siteSlug, group.id);
    const sourceId = event.dataTransfer.getData("application/x-orwell-group");
    if (!sourceId || sourceId === group.id) return setDragTarget(null);
    const source = groups.find((item) => item.id === sourceId);
    if (!source) return;
    const mode = dragTarget?.id === group.id ? dragTarget.mode : "inside";
    if (mode === "inside") {
      await updateGroup(source.id, { parentId: group.id, sortOrder: (childGroups.get(group.id)?.length ?? 0) + 1 }, `Moved ${source.name} into ${group.name}.`);
    } else {
      const offset = mode === "before" ? -1 : 1;
      await updateGroup(source.id, { parentId: group.parentId, sortOrder: Math.max(0, group.sortOrder + offset) }, `Reordered ${source.name}.`);
    }
  }

  function dragPosition(event: React.DragEvent, groupId: string) {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - box.top) / box.height;
    setDragTarget({ id: groupId, mode: ratio < 0.26 ? "before" : ratio > 0.74 ? "after" : "inside" });
  }

  function siteRow(site: (typeof sites)[number], depth = 0) {
    const active = scope === site.id;
    return (
      <div key={`${site.id}-${depth}`} className="group/site flex items-center" draggable onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-orwell-site", site.id);
      }}>
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted/40 opacity-0 group-hover/site:opacity-100" aria-hidden />
        <button onClick={() => chooseSite(site.id)} style={{ paddingLeft: `${8 + depth * 14}px` }} className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pr-1 text-left transition-colors", active ? "bg-rail-selected text-ink" : "text-muted hover:bg-card hover:text-ink")}>
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
      const children = childGroups.get(group.id) ?? [];
      const primarySites = sites.filter((site) => primaryGroupBySite.get(site.id) === group.id);
      const target = dragTarget?.id === group.id ? dragTarget.mode : null;
      return (
        <div key={group.id}>
          <div className={cn("group/folder relative flex items-center rounded-md", target === "inside" && "bg-purple/10 ring-1 ring-purple/30", target === "before" && "border-t-2 border-purple", target === "after" && "border-b-2 border-purple")} draggable={editingId !== group.id} onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-orwell-group", group.id);
          }} onDragOver={(event) => dragPosition(event, group.id)} onDragLeave={() => dragTarget?.id === group.id && setDragTarget(null)} onDrop={(event) => void dropOnGroup(event, group)} style={{ marginLeft: `${depth * 12}px` }}>
            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted/45 opacity-0 group-hover/folder:opacity-100" aria-hidden />
            <button onClick={() => setExpanded((current) => {
              const next = new Set(current);
              next.has(group.id) ? next.delete(group.id) : next.add(group.id);
              return next;
            })} className="rounded p-1 text-muted hover:bg-card" aria-label={open ? `Collapse ${group.name}` : `Expand ${group.name}`}>
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            {editingId === group.id ? (
              <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void renameGroup(group); }}>
                <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onBlur={() => void renameGroup(group)} className="h-7 min-w-0 flex-1 rounded border border-purple bg-card px-2 text-xs font-semibold text-ink outline-none" aria-label={`Rename ${group.name}`} />
                <button type="submit" className="rounded p-1 text-success" aria-label="Save folder name"><Check className="h-3.5 w-3.5" /></button>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditingId(null)} className="rounded p-1 text-muted" aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></button>
              </form>
            ) : (
              <button onClick={() => chooseGroup(group.id)} onDoubleClick={() => { setEditingId(group.id); setEditingName(group.name); }} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left", active ? "bg-rail-selected text-ink" : "text-muted hover:bg-card hover:text-ink")}>
                {open ? <FolderOpen className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}25` }} /> : <Folder className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}30` }} />}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</span>
                <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px]">{group.siteSlugs.length}</span>
              </button>
            )}
            <button onClick={(event) => { event.stopPropagation(); setMenuId(menuId === group.id ? null : group.id); }} className="mr-1 rounded p-1 text-muted opacity-0 hover:bg-card hover:text-ink focus:opacity-100 group-hover/folder:opacity-100" aria-label={`Actions for ${group.name}`}><Ellipsis className="h-3.5 w-3.5" /></button>
            {menuId === group.id && (
              <div className="absolute right-1 top-9 z-30 w-44 rounded-md border border-border bg-card p-1 shadow-pop" onClick={(event) => event.stopPropagation()}>
                <button onClick={() => { setEditingId(group.id); setEditingName(group.name); setMenuId(null); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-ink hover:bg-workspace"><Pencil className="h-3.5 w-3.5" />Rename</button>
                <Link href={`/sites?parent=${group.id}`} onClick={() => setMenuId(null)} className="flex items-center gap-2 rounded px-2 py-2 text-xs text-ink hover:bg-workspace"><FolderPlus className="h-3.5 w-3.5" />New subfolder</Link>
                {group.parentId && <button onClick={() => void updateGroup(group.id, { parentId: null }, `Moved ${group.name} to the portfolio root.`)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-ink hover:bg-workspace"><Folder className="h-3.5 w-3.5" />Move to root</button>}
                <button onClick={() => void deleteGroup(group)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-critical hover:bg-critical/10"><Trash2 className="h-3.5 w-3.5" />Delete</button>
              </div>
            )}
          </div>
          {open && <div>{groupRows(group.id, depth + 1)}{primarySites.map((site) => siteRow(site, depth + 1))}</div>}
          {open && children.length === 0 && primarySites.length === 0 && <div className="py-2 pl-10 text-[10px] text-muted">Drop websites here</div>}
        </div>
      );
    });
  }

  const unfiled = sites.filter((site) => !primaryGroupBySite.has(site.id));

  return (
    <aside className="relative hidden w-[292px] shrink-0 flex-col border-r border-border bg-rail text-ink lg:flex" onDragOver={(event) => event.preventDefault()}>
      <Link href="/home" className="flex h-16 items-center gap-3 border-b border-border px-4">
        <span className="relative grid h-9 w-9 grid-cols-2 gap-1 rounded-md bg-ink p-2"><span className="rounded-[2px] bg-[#335CFF]" /><span className="rounded-[2px] bg-[#12B8C4]" /><span className="rounded-[2px] bg-[#FF6B5E]" /><span className="rounded-[2px] bg-[#F2B544]" /></span>
        <span className="leading-tight"><span className="block text-sm font-extrabold tracking-tight">Orwell Command</span><span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">SEO operations</span></span>
      </Link>
      <nav className="space-y-1 border-b border-border p-3">
        {GLOBAL_NAV.map((item) => {
          const active = item.href === "/research"
            ? pathname === "/research" && !searchParams.get("site")
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors", active ? "bg-ink text-card shadow-sm" : "text-muted hover:bg-card hover:text-ink")}><Icon className={cn("h-4 w-4", active && "text-[#7FE4EA]")} />{item.label}</Link>;
        })}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Portfolio map</div><div className="mt-0.5 text-2xs text-muted">{sites.length} websites · drag to organise</div></div>
          <Link href="/sites" className="rounded-md p-2 text-muted hover:bg-card hover:text-ink" aria-label="Manage portfolio folders"><FolderPlus className="h-4 w-4" /></Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" onClick={() => menuId && setMenuId(null)}>
          <div className="space-y-0.5">
            {groupRows()}
            {(
              <div className="mt-2 rounded-md border border-dashed border-transparent px-1 py-1 hover:border-border" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault();
                const siteSlug = event.dataTransfer.getData("application/x-orwell-site");
                const groupId = event.dataTransfer.getData("application/x-orwell-group");
                if (siteSlug) void moveSite(siteSlug, null);
                if (groupId) {
                  const source = groups.find((group) => group.id === groupId);
                  if (source) void updateGroup(groupId, { parentId: null }, `Moved ${source.name} to the portfolio root.`);
                }
              }}>
                <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Unfiled</div>
                {unfiled.map((site) => siteRow(site))}
                {unfiled.length === 0 && <div className="px-2 py-2 text-[10px] text-muted">Drop here to remove folder memberships</div>}
              </div>
            )}
          </div>
        </div>
        {notice && <div role="status" className="mx-3 mb-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] leading-4 text-ink shadow-sm">{notice}</div>}
        <div className="border-t border-border p-3">
          <Link href="/sites/new" className="flex items-center justify-center gap-2 rounded-md border border-dashed border-purple/40 bg-purple/5 px-3 py-2.5 text-sm font-semibold text-purple hover:bg-purple/10"><Plus className="h-4 w-4" /> Add website</Link>
        </div>
      </div>
      {busy && <div className="pointer-events-none absolute inset-0" aria-hidden />}
    </aside>
  );
}
