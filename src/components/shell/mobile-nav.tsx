"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Layers, Circle, Folder } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { useDomain } from "./domain-context";
import { cn } from "@/lib/cn";

/** Accessible mobile navigation drawer (hidden on lg+). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { scope, setScope, sites, groups } = useDomain();
  const router = useRouter();

  /** Picking a site closes the drawer and lands on that property's page. */
  function selectDomain(id: string) {
    setScope(id);
    router.push(`/domain/${id}`);
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

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-white hover:bg-rail-selected/50"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-rail/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-drawer absolute left-0 top-0 flex h-full w-[80%] max-w-xs flex-col bg-rail text-white">
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
              <div className="px-2 pb-1 text-2xs uppercase tracking-wider text-white/40">Domain</div>
              <button
                onClick={selectPortfolio}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
                  scope === "portfolio" ? "bg-rail-selected" : "hover:bg-nav",
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
                    scope === `group:${group.id}` ? "bg-rail-selected" : "hover:bg-nav",
                  )}
                >
                  <Folder className="h-3.5 w-3.5" style={{ color: group.color, fill: `${group.color}40` }} />
                  {group.name}
                </button>
              ))}
              {sites.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDomain(d.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm",
                    scope === d.id ? "bg-rail-selected" : "hover:bg-nav",
                  )}
                >
                  <Circle className="h-2.5 w-2.5" style={{ fill: d.accent, color: d.accent }} />
                  {d.name}
                </button>
              ))}
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-3">
              <div className="px-2 pb-1 text-2xs uppercase tracking-wider text-white/40">Modules</div>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                      active ? "bg-rail-selected text-white" : "text-white/70 hover:bg-nav hover:text-white",
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
