"use client";

import { useEffect, useState } from "react";
import type { DomainLiveBundle, PortfolioLive } from "./live";
import { useDomain } from "@/components/shell/domain-context";

/**
 * Client data access for the live read-models. Small SWR-style cache: instant
 * render from memory on revisit, refresh in the background. All pages consume
 * live data through these hooks — there is no demo fallback.
 */

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const TTL_MS = 60_000;

async function fetchJson<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;
  const p = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as T;
      cache.set(url, { data: json, fetchedAt: Date.now() });
      return json;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export interface LiveState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function useJson<T>(url: string): LiveState<T> {
  const cached = cache.get(url) as CacheEntry<T> | undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const entry = cache.get(url) as CacheEntry<T> | undefined;
    if (entry) {
      setData(entry.data);
      setLoading(false);
      if (Date.now() - entry.fetchedAt < TTL_MS && tick === 0) return;
    } else {
      setLoading(true);
    }
    fetchJson<T>(url)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/** Live snapshot bundle for one domain. */
export function useLiveDomain(domainId: string): LiveState<DomainLiveBundle> {
  return useJson<DomainLiveBundle>(`/api/live/${domainId}`);
}

/** Portfolio headline aggregates. */
export function useLivePortfolio(): LiveState<PortfolioLive> {
  return useJson<PortfolioLive>(`/api/live/portfolio`);
}

/**
 * Portfolio-wide bundle: every domain merged, shaped like a domain bundle.
 * Module pages consume this when the scope selector is set to "Portfolio".
 */
export function useLiveAggregate(): LiveState<DomainLiveBundle> {
  return useJson<DomainLiveBundle>(`/api/live/aggregate`);
}

export interface ScopedLiveState extends LiveState<DomainLiveBundle> {
  /** True when the picker is on "Portfolio" and data is combined. */
  isPortfolio: boolean;
  /** Human label for the active scope, for page headers. */
  scopeLabel: string;
  /** Host (or "all N properties" for portfolio), for prose descriptions. */
  scopeHost: string;
  /** Slug for the active scope — "portfolio" or the domain id. For exports. */
  scopeId: string;
}

/**
 * The bundle for whatever the scope selector is pointing at: combined portfolio
 * data on "Portfolio", that property's data on a domain. Module pages should
 * use this rather than useLiveDomain(useResolvedDomain().id), which always
 * rendered the first domain while the picker said "Portfolio".
 */
export function useScopedLive(): ScopedLiveState {
  const { scope, sites } = useDomain();
  const isPortfolio = scope === "portfolio";
  const active = sites.find((site) => site.id === scope);
  const state = useJson<DomainLiveBundle>(
    isPortfolio ? "/api/live/aggregate" : `/api/live/${scope}`,
  );
  return {
    ...state,
    isPortfolio,
    scopeLabel: isPortfolio ? "Portfolio" : (active?.name ?? String(scope)),
    scopeHost: isPortfolio
      ? `all ${sites.length} properties`
      : (active?.host ?? String(scope)),
    scopeId: String(scope),
  };
}
