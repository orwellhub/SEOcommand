"use client";

import { useEffect, useState } from "react";
import type { DomainLiveBundle, PortfolioLive } from "./live";
import { useDomain } from "@/components/shell/domain-context";
import { actionQueueUrl, type ActionData } from "./action-queue";

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

export function useJson<T>(url: string | null, ttlMs = TTL_MS): LiveState<T> {
  const cached = (url ? cache.get(url) : undefined) as CacheEntry<T> | undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [dataUrl, setDataUrl] = useState(url);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDataUrl(url);
    if (!url) { setData(null); setLoading(false); return; }
    const entry = cache.get(url) as CacheEntry<T> | undefined;
    if (entry) {
      setData(entry.data);
      setLoading(false);
      if (Date.now() - entry.fetchedAt < ttlMs && tick === 0) return;
    } else {
      setData(null);
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
  }, [url, tick, ttlMs]);

  return { data: dataUrl === url ? data : cached?.data ?? null, loading: dataUrl !== url ? !cached : loading, error: dataUrl === url ? error : null, refresh: () => setTick((t) => t + 1) };
}

/** Saved alerts and workflow decisions for the selected reporting scope. */
export function useActionQueue(scope: string, options?: { page: number; filter: string }): LiveState<ActionData> {
  return useJson<ActionData>(options ? `/api/action-centre?scope=${encodeURIComponent(scope)}&offset=${options.page * 20}&limit=20&kind=${options.filter}` : actionQueueUrl(scope), 0);
}

/** Urgent work for the dashboard. */
export function usePriorityTasks(scope: string): LiveState<ActionData> {
  // Recheck saved status when returning from a working section.
  return useJson<ActionData>(actionQueueUrl(scope, true, 4), 0);
}

/** Live snapshot bundle for one domain. */
export function useLiveDomain(domainId: string): LiveState<DomainLiveBundle> {
  return useJson<DomainLiveBundle>(`/api/live/${domainId}`);
}

/** Portfolio headline aggregates. */
export function useLivePortfolio(groupId?: string, days = 28, end?: string | null): LiveState<PortfolioLive> {
  const params = new URLSearchParams({ days: String(days) });
  if (groupId) params.set("groupId", groupId);
  if (end) params.set("end", end);
  return useJson<PortfolioLive>(`/api/live/portfolio?${params}`);
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
  const { scope, sites, activeGroup } = useDomain();
  const isPortfolio = scope === "portfolio";
  const isGroup = scope.startsWith("group:");
  const active = sites.find((site) => site.id === scope);
  const state = useJson<DomainLiveBundle>(
    isPortfolio
      ? "/api/live/aggregate"
      : isGroup
        ? `/api/live/aggregate?groupId=${encodeURIComponent(scope.slice(6))}`
        : `/api/live/${scope}`,
  );
  const groupedSites = activeGroup
    ? new Set(activeGroup.siteSlugs).size
    : 0;
  return {
    ...state,
    isPortfolio,
    scopeLabel: isPortfolio ? "Portfolio" : isGroup ? (activeGroup?.name ?? "Group") : (active?.name ?? String(scope)),
    scopeHost: isPortfolio
      ? `all ${sites.length} properties`
      : isGroup
        ? `${groupedSites} directly assigned ${groupedSites === 1 ? "property" : "properties"}, plus subgroups`
      : (active?.host ?? String(scope)),
    scopeId: String(scope),
  };
}
