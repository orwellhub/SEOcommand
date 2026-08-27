"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Domain, DomainId } from "@/lib/types";
import { DOMAINS } from "@/data/domains";
import type { PortfolioGroup } from "@/platform/types";

export type Scope = DomainId | "portfolio" | `group:${string}`;

interface DomainState {
  scope: Scope;
  setScope: (s: Scope) => void;
  activeDomain: Domain | null; // null when scope === "portfolio"
  activeGroup: PortfolioGroup | null;
  sites: Domain[];
  groups: PortfolioGroup[];
  sitesLoading: boolean;
  refreshPortfolio: () => Promise<void>;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
}

export type RangeKey = "7d" | "28d" | "90d";

const DomainCtx = createContext<DomainState | null>(null);

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [scope, setScope] = useState<Scope>("portfolio");
  const [scopeReady, setScopeReady] = useState(false);
  const [range, setRange] = useState<RangeKey>("28d");
  const [sites, setSites] = useState<Domain[]>(DOMAINS);
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);

  const refreshPortfolio = useCallback(async () => {
    setSitesLoading(true);
    try {
      const response = await fetch("/api/sites", { cache: "no-store" });
      if (!response.ok) throw new Error(`Site registry request failed (${response.status})`);
      const body = await response.json() as { sites?: Domain[]; groups?: PortfolioGroup[] };
      if (body.sites?.length) setSites(body.sites);
      if (body.groups) setGroups(body.groups);
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/sites", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Site registry request failed (${response.status})`);
        return response.json() as Promise<{ sites?: Domain[]; groups?: PortfolioGroup[] }>;
      })
      .then((body) => {
        if (active && body.sites?.length) setSites(body.sites);
        if (active && body.groups) setGroups(body.groups);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSitesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  // A route-level website is authoritative. Otherwise restore the user's last
  // reporting scope. Keeping this in one effect prevents a saved portfolio
  // scope from racing and overwriting a directly opened website workspace.
  useEffect(() => {
    const siteMatch = pathname.match(/^\/sites\/([^/]+)/);
    const requested = siteMatch?.[1] ?? searchParams.get("site");
    const saved = window.localStorage.getItem("orwell.scope");
    if (requested && requested !== "new") setScope(requested as Scope);
    else if (pathname === "/portfolio" && saved?.startsWith("group:")) setScope(saved as Scope);
    else setScope("portfolio");
    setScopeReady(true);
  }, [pathname, searchParams]);

  // Persist selection across navigation within the session after hydration.
  useEffect(() => {
    if (scopeReady) window.localStorage.setItem("orwell.scope", scope);
  }, [scope, scopeReady]);

  // Reflect the active domain accent as a CSS variable for theming.
  const activeDomain = scope === "portfolio" || scope.startsWith("group:")
    ? null
    : (sites.find((site) => site.id === scope) ?? null);
  const activeGroup = scope.startsWith("group:")
    ? groups.find((group) => group.id === scope.slice(6)) ?? null
    : null;
  useEffect(() => {
    const accent = activeDomain?.accent ?? activeGroup?.color ?? "#335CFF";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", accent + "1a");
  }, [activeDomain, activeGroup]);

  const value = useMemo<DomainState>(
    () => ({
      scope,
      setScope,
      activeDomain,
      activeGroup,
      sites,
      groups,
      sitesLoading,
      refreshPortfolio,
      range,
      setRange,
    }),
    [scope, activeDomain, activeGroup, sites, groups, sitesLoading, refreshPortfolio, range],
  );

  return <DomainCtx.Provider value={value}>{children}</DomainCtx.Provider>;
}

export function useDomain(): DomainState {
  const ctx = useContext(DomainCtx);
  if (!ctx) throw new Error("useDomain must be used within DomainProvider");
  return ctx;
}

/** Resolve the domain a module page should render for. Modules that require a
 * specific domain fall back to the first pilot when scope is portfolio. */
export function useResolvedDomain(): Domain {
  const { activeDomain, sites } = useDomain();
  return activeDomain ?? sites[0] ?? DOMAINS[0]!;
}
