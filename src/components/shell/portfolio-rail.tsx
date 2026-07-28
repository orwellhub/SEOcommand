"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Settings, ChevronRight, Circle } from "lucide-react";
import { DOMAINS } from "@/data/domains";
import { useDomain } from "./domain-context";
import { useLivePortfolio } from "@/lib/use-live";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";

export function PortfolioRail() {
  const { scope, setScope } = useDomain();
  const { data: pm } = useLivePortfolio();
  const router = useRouter();

  const headline = (id: string) => pm?.domains.find((d) => d.domainId === id);

  /** Selecting a property both scopes the app and lands on that site's page. */
  function selectDomain(id: string) {
    setScope(id);
    router.push(`/domain/${id}`);
  }

  function selectPortfolio() {
    setScope("portfolio");
    router.push("/portfolio");
  }

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col bg-rail text-white lg:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
          <Layers className="h-4.5 w-4.5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Orwell</div>
          <div className="text-2xs text-white/50">SEO Command Centre</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={selectPortfolio}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors",
            scope === "portfolio" ? "bg-rail-selected" : "hover:bg-nav",
          )}
        >
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-white/70" />
            <span className="text-sm font-medium">Portfolio</span>
          </div>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-2xs text-white/70 tnum">
            {DOMAINS.length}
          </span>
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-white/40">
          Domains
        </div>
        <nav className="space-y-0.5">
          {DOMAINS.map((d) => {
            const h = headline(d.id);
            const active = scope === d.id;
            return (
              <button
                key={d.id}
                onClick={() => selectDomain(d.id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                  active ? "bg-rail-selected" : "hover:bg-nav",
                )}
              >
                <Circle className="h-2.5 w-2.5 shrink-0" style={{ fill: d.accent, color: d.accent }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="truncate text-2xs text-white/45">{d.host}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xs font-medium text-white/80 tnum">
                    {h?.clicks28d != null ? compactNumber(h.clicks28d) : "—"}
                  </div>
                  <div className="text-[10px] text-white/40">clicks</div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mx-3 my-4 rounded-md bg-nav/60 p-3">
        <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-white/40">
          Portfolio · last 28 days
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <RailStat label="Clicks" value={pm ? compactNumber(pm.totals.clicks28d) : "—"} />
          <RailStat
            label="Sessions"
            value={pm ? compactNumber(pm.totals.sessions28d) : "—"}
          />
          <RailStat
            label="Avg health"
            value={pm?.totals.avgHealth != null ? String(pm.totals.avgHealth) : "—"}
          />
          <RailStat
            label="Critical"
            value={pm ? String(pm.totals.criticalIssues) : "—"}
            tone={pm && pm.totals.criticalIssues > 0 ? "critical" : undefined}
          />
        </div>
        {pm && pm.totals.domainsSynced === 0 && (
          <p className="mt-2 text-[10px] leading-snug text-white/40">
            No sync has run yet — trigger the sync job to populate live data.
          </p>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-3">
        <Link
          href="/settings"
          className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/70 hover:bg-nav hover:text-white"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="h-4 w-4" /> Settings
          </span>
          <ChevronRight className="h-4 w-4 text-white/40" />
        </Link>
      </div>
    </aside>
  );
}

function RailStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "critical";
}) {
  return (
    <div className="rounded bg-rail/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
      <div className={cn("text-sm font-semibold tnum", tone === "critical" ? "text-critical" : "text-white")}>
        {value}
      </div>
    </div>
  );
}
