"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  range: RangeKey;
  setRange: (r: RangeKey) => void;
}

export type RangeKey = "7d" | "28d" | "90d";

const DomainCtx = createContext<DomainState | null>(null);

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<Scope>("portfolio");
  const [range, setRange] = useState<RangeKey>("28d");
  const [sites, setSites] = useState<Domain[]>(DOMAINS);
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/sites")
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

  // Persist selection across navigation within the session.
  useEffect(() => {
    const saved = window.localStorage.getItem("orwell.scope");
    if (saved) {
      setScope(saved as Scope);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem("orwell.scope", scope);
  }, [scope]);

  // Reflect the active domain accent as a CSS variable for theming.
  const activeDomain = scope === "portfolio" || scope.startsWith("group:")
    ? null
    : (sites.find((site) => site.id === scope) ?? null);
  const activeGroup = scope.startsWith("group:")
    ? groups.find((group) => group.id === scope.slice(6)) ?? null
    : null;
  useEffect(() => {
    const accent = activeDomain?.accent ?? activeGroup?.color ?? "#7137F5";
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
      range,
      setRange,
    }),
    [scope, activeDomain, activeGroup, sites, groups, sitesLoading, range],
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
