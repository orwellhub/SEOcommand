"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, X, Layers, Circle, Folder } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { useDomain } from "./domain-context";
import { cn } from "@/lib/cn";

/** Accessible mobile navigation drawer (hidden on lg+). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { scope, setScope, sites, groups, refreshPortfolio } = useDomain();
  const router = useRouter();

  /** Picking a site closes the drawer and lands on that property's page. */
  function selectDomain(id: string) {
    setScope(id);
    router.push(`/sites/${id}`);
    setOpen(false);
  }

  function selectPortfolio() {
    setScope("portfolio");
    router.push("/portfolio");
    setOpen(false);
  }

  function selectGroup(id: string) {
    setScope(`group:${id}`);
    router.push("/portfolio");
    setOpen(false);
  }

  async function moveSite(siteId: string, primaryGroupId: string | null) {
    const memberships = groups.filter((group) => group.siteSlugs.includes(siteId)).map((group) => group.id);
    const groupIds = primaryGroupId ? [...new Set([primaryGroupId, ...memberships])] : [];
    const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/groups`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupIds, primaryGroupId }),
    });
    if (response.ok) await refreshPortfolio();
  }

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-ink hover:bg-workspace"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-drawer absolute left-0 top-0 flex h-full w-[84%] max-w-sm flex-col border-r border-border bg-card text-ink">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold">Orwell</span>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-nav">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-3 pb-2">
              <div className="px-2 pb-1 text-2xs font-bold uppercase tracking-wider text-muted">Portfolio</div>
              <button
                onClick={selectPortfolio}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
                  scope === "portfolio" ? "bg-rail-selected" : "hover:bg-workspace",
                )}
              >
                <Layers className="h-4 w-4" /> Portfolio
              </button>
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => selectGroup(group.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
                    scope === `group:${group.id}` ? "bg-rail-selected" : "hover:bg-workspace",
                  )}
                >
                  <Folder className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}40` }} />
                  {group.name}
                </button>
              ))}
              {sites.map((d) => {
                const primary = groups.find((group) => group.primarySiteSlugs?.includes(d.id))?.id
                  ?? groups.find((group) => group.siteSlugs.includes(d.id))?.id
                  ?? "";
                return <div key={d.id} className={cn("flex items-center rounded-md", scope === d.id ? "bg-rail-selected" : "hover:bg-workspace")}>
                  <button onClick={() => selectDomain(d.id)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm">
                    <Circle className="h-2.5 w-2.5 shrink-0" style={{ fill: d.accent, color: d.accent }} />
                    <span className="truncate">{d.name}</span>
                  </button>
                  <select aria-label={`Move ${d.name} to folder`} value={primary} onChange={(event) => void moveSite(d.id, event.target.value || null)} className="mr-2 h-7 max-w-24 rounded border border-border bg-card px-1 text-[10px] text-muted">
                    <option value="">Unfiled</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </div>;
              })}
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-3">
              <div className="px-2 pb-1 text-2xs font-bold uppercase tracking-wider text-muted">Tools</div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const [itemPath, itemQuery] = item.href.split("?");
                const itemView = new URLSearchParams(itemQuery ?? "").get("view");
                const active = itemPath === "/research"
                  ? pathname === "/research" && (item.group === "site" ? Boolean(searchParams.get("site")) : !searchParams.get("site"))
                  : pathname.startsWith(itemPath!) && (itemView ? searchParams.get("view") === itemView : true);
                return (
                  <Link
                    key={`${item.group}:${item.href}:${item.label}`}
                    href={scope !== "portfolio" && !scope.startsWith("group:") && item.group === "site" ? `${item.href}?site=${scope}` : item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                      active ? "bg-ink text-card" : "text-muted hover:bg-workspace hover:text-ink",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
