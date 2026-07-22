"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useLivePortfolio } from "@/lib/use-live";
import { SyncBadge } from "@/components/ui/sync-badge";

export function TopNav() {
  const pathname = usePathname();
  const { data: pm, loading } = useLivePortfolio();
  const lastSync =
    pm?.domains.reduce<string | null>(
      (acc, d) => (d.lastSync && (!acc || d.lastSync > acc) ? d.lastSync : acc),
      null,
    ) ?? null;

  return (
    <div className="flex h-11 items-center justify-between bg-nav px-2 text-white">
      <nav className="flex items-center gap-0.5 overflow-x-auto">
        {NAV_ITEMS.filter((n) => n.group !== "system").map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                active ? "bg-rail-selected text-white" : "text-white/60 hover:bg-rail-selected/50 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 pr-1">
        <SyncBadge lastSync={lastSync} loading={loading} className="hidden sm:inline-flex" />
        <div className="flex items-center gap-2 rounded-md px-2 py-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple text-2xs font-semibold">
            OA
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-2xs font-medium">Orwell Admin</div>
            <div className="text-[10px] text-white/40">admin</div>
          </div>
        </div>
      </div>
    </div>
  );
}
