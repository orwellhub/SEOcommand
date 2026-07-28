"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Domain, DomainId } from "@/lib/types";
import { DOMAINS, DOMAIN_MAP } from "@/data/domains";

export type Scope = DomainId | "portfolio";

interface DomainState {
  scope: Scope;
  setScope: (s: Scope) => void;
  activeDomain: Domain | null; // null when scope === "portfolio"
  range: RangeKey;
  setRange: (r: RangeKey) => void;
}

export type RangeKey = "7d" | "28d" | "90d";

const DomainCtx = createContext<DomainState | null>(null);

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<Scope>("portfolio");
  const [range, setRange] = useState<RangeKey>("28d");

  // Persist selection across navigation within the session.
  useEffect(() => {
    const saved = window.localStorage.getItem("orwell.scope");
    if (saved && (saved === "portfolio" || saved in DOMAIN_MAP)) {
      setScope(saved as Scope);
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem("orwell.scope", scope);
  }, [scope]);

  // Reflect the active domain accent as a CSS variable for theming.
  const activeDomain = scope === "portfolio" ? null : DOMAIN_MAP[scope];
  useEffect(() => {
    const accent = activeDomain?.accent ?? "#7137F5";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", accent + "1a");
  }, [activeDomain]);

  const value = useMemo<DomainState>(
    () => ({
      scope,
      setScope,
      activeDomain,
      range,
      setRange,
    }),
    [scope, activeDomain, range],
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
  const { activeDomain } = useDomain();
  return activeDomain ?? DOMAINS[0]!;
}
