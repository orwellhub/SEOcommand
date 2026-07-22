"use client";

import { useEffect, useState } from "react";
import type { DomainLiveBundle, PortfolioLive } from "./live";

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
