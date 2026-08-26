"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useLivePortfolio } from "@/lib/use-live";
import { SyncBadge } from "@/components/ui/sync-badge";
import { NotificationBell } from "./notification-bell";

export function TopNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string | null; email: string | null; role: string | null } | null>(null);
  const { data: pm, loading } = useLivePortfolio();
  const lastSync =
    pm?.domains.reduce<string | null>(
      (acc, d) => (d.lastSync && (!acc || d.lastSync > acc) ? d.lastSync : acc),
      null,
    ) ?? null;

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: { name: string | null; email: string | null; role: string | null } } | null) => {
        if (active && body?.user) setUser(body.user);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }

  const initials = (user?.name || user?.email || "Orwell Admin")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex h-11 items-center justify-between bg-nav px-2 text-white">
      <nav className="flex items-center gap-0.5 overflow-x-auto">
        {NAV_SECTIONS.map((section) => {
          const active = section.items.some((item) => pathname.startsWith(item.href));
          const Icon = section.icon;
          if (section.items.length === 1) {
            const item = section.items[0]!;
            return <Link key={section.label} href={item.href} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", active ? "bg-rail-selected text-white" : "text-white/60 hover:bg-rail-selected/50 hover:text-white")}><Icon className="h-3.5 w-3.5" />{section.label}</Link>;
          }
          return <div key={section.label} className="group relative"><Link href={section.items[0]!.href} className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors", active ? "bg-rail-selected text-white" : "text-white/60 hover:bg-rail-selected/50 hover:text-white")}><Icon className="h-3.5 w-3.5" />{section.label}<ChevronDown className="h-3 w-3 opacity-50" /></Link><div className="invisible absolute left-0 top-full z-50 w-52 translate-y-1 rounded-md border border-white/10 bg-nav p-1.5 opacity-0 shadow-pop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">{section.items.map((item) => { const ItemIcon = item.icon; return <Link key={item.href} href={item.href} className={cn("flex items-center gap-2 rounded-md px-2.5 py-2 text-xs", pathname.startsWith(item.href) ? "bg-rail-selected text-white" : "text-white/65 hover:bg-rail-selected/60 hover:text-white")}><ItemIcon className="h-3.5 w-3.5" />{item.label}</Link>; })}</div></div>;
        })}
      </nav>
      <div className="flex items-center gap-2 pr-1">
        <SyncBadge lastSync={lastSync} loading={loading} className="hidden sm:inline-flex" />
        <NotificationBell />
        <div className="flex items-center gap-2 rounded-md px-2 py-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple text-2xs font-semibold">
            {initials || "OA"}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="max-w-32 truncate text-2xs font-medium">{user?.name || user?.email || "Orwell user"}</div>
            <div className="text-[10px] text-white/40">{user?.role?.replace(/_/g, " ") || "signed in"}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-rail-selected hover:text-white"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
