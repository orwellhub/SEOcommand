"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Search, Sun, Command, ChevronRight } from "lucide-react";
import { useDomain } from "./domain-context";
import { SITE_NAV } from "@/lib/nav";
import { roleLabel } from "@/lib/auth";
import { NotificationBell } from "./notification-bell";
import { JobDrawer } from "./job-drawer";

interface SessionUser {
  name: string | null;
  email: string | null;
  role: string | null;
}

export function TopNav() {
  const { sites, groups, activeDomain, setScope } = useDomain();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [dark, setDark] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("orwell.theme");
    const nextDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(nextDark);
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    fetch("/api/auth/session").then((response) => response.ok ? response.json() : null)
      .then((body: { user?: SessionUser } | null) => body?.user && setUser(body.user)).catch(() => undefined);
  }, []);

  useEffect(() => setSearchOpen(false), [pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    window.localStorage.setItem("orwell.theme", next ? "dark" : "light");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { sites: sites.slice(0, 5), groups: groups.slice(0, 3), modules: SITE_NAV.slice(0, 4) };
    return {
      sites: sites.filter((site) => site.name.toLowerCase().includes(q) || site.host.includes(q)).slice(0, 8),
      groups: groups.filter((group) => group.name.toLowerCase().includes(q)).slice(0, 5),
      modules: SITE_NAV.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 5),
    };
  }, [groups, query, sites]);

  function openSite(id: string) {
    setScope(id);
    router.push(`/sites/${id}`);
  }

  const initials = (user?.name || user?.email || "Orwell")
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <div className="relative flex h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-md border border-border bg-workspace px-3 text-left text-sm text-muted transition-colors hover:border-purple/40 sm:max-w-lg"
        aria-label="Search websites, groups and modules"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search websites, groups or tools…</span>
        <span className="ml-auto hidden items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-2xs sm:flex"><Command className="h-3 w-3" /> K</span>
      </button>
      <button onClick={toggleTheme} className="rounded-md p-2.5 text-muted hover:bg-workspace hover:text-ink" aria-label={dark ? "Use light theme" : "Use dark theme"}>
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <JobDrawer />
      <NotificationBell />
      <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple text-2xs font-bold text-white">{initials || "O"}</div>
        <div className="max-w-32 leading-tight">
          <div className="truncate text-xs font-semibold text-ink">{user?.name || user?.email || "Orwell user"}</div>
          <div className="text-[10px] text-muted">{roleLabel(user?.role ?? null)}</div>
        </div>
        <button onClick={signOut} className="rounded-md p-2 text-muted hover:bg-workspace hover:text-ink" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
      </div>

      {searchOpen && (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-ink/20 backdrop-blur-[2px]" onClick={() => setSearchOpen(false)} aria-label="Close search" />
          <div className="absolute left-4 right-4 top-[72px] z-50 mx-auto max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-pop sm:left-6 sm:right-auto sm:w-[640px]">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-5 w-5 text-purple" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted" placeholder="Jump to a website, group or tool" />
              <button onClick={() => setSearchOpen(false)} className="rounded border border-border px-2 py-1 text-2xs text-muted">Esc</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              <SearchSection label="Websites">
                {matches.sites.map((site) => <SearchResult key={site.id} color={site.accent} title={site.name} subtitle={site.host} onClick={() => openSite(site.id)} />)}
              </SearchSection>
              <SearchSection label="Groups">
                {matches.groups.map((group) => <SearchResult key={group.id} color={group.color} title={group.name} subtitle={`${group.siteSlugs.length} websites`} onClick={() => { setScope(`group:${group.id}`); router.push("/portfolio"); }} />)}
              </SearchSection>
              <SearchSection label="Tools">
                {matches.modules.map((item) => <SearchResult key={item.href} title={item.label} subtitle="Open for the current website" onClick={() => router.push(`${item.href}${activeDomain ?? sites[0] ? `?site=${(activeDomain ?? sites[0])!.id}` : ""}`)} />)}
              </SearchSection>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SearchSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-2"><div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>{children}</div>;
}

function SearchResult({ color = "#335CFF", title, subtitle, onClick }: { color?: string; title: string; subtitle: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-workspace"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{title}</span><span className="block truncate text-2xs text-muted">{subtitle}</span></span><ChevronRight className="h-4 w-4 text-muted" /></button>;
}
