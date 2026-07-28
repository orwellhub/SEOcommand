"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Search, Layers, Circle } from "lucide-react";
import { DOMAINS } from "@/data/domains";
import { useDomain, type RangeKey } from "./domain-context";
import { cn } from "@/lib/cn";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
];

export function ContextBar() {
  const { scope, setScope, comparison, toggleComparison, range, setRange } = useDomain();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  /** Switching scope from the picker also navigates to that scope's home. */
  function choose(next: string) {
    setScope(next as typeof scope);
    router.push(next === "portfolio" ? "/portfolio" : `/domain/${next}`);
    setOpen(false);
  }

  const current =
    scope === "portfolio"
      ? { name: "Portfolio", host: "All domains", accent: "#7137F5" }
      : DOMAINS.find((d) => d.id === scope)!;

  const filtered = DOMAINS.filter(
    (d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.host.includes(q.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-1.5 hover:bg-workspace"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {scope === "portfolio" ? (
            <Layers className="h-4 w-4 text-purple" />
          ) : (
            <Circle className="h-3 w-3" style={{ fill: current.accent, color: current.accent }} />
          )}
          <div className="text-left leading-tight">
            <div className="text-sm font-semibold text-ink">{current.name}</div>
            <div className="text-2xs text-muted">{current.host}</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
            <div className="animate-in absolute left-0 top-full z-30 mt-1.5 w-72 rounded-md border border-border bg-card p-1.5 shadow-pop">
              <div className="relative mb-1.5">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search domains…"
                  className="h-8 w-full rounded-md border border-border bg-workspace pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:outline-none"
                />
              </div>
              <button
                onClick={() => choose("portfolio")}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-workspace"
              >
                <Layers className="h-4 w-4 text-purple" />
                <span className="flex-1 font-medium text-ink">Portfolio</span>
                {scope === "portfolio" && <Check className="h-4 w-4 text-purple" />}
              </button>
              <div className="my-1 border-t border-border" />
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => choose(d.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-workspace"
                >
                  <Circle className="h-3 w-3" style={{ fill: d.accent, color: d.accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{d.name}</div>
                    <div className="truncate text-2xs text-muted">{d.host}</div>
                  </div>
                  {scope === d.id && <Check className="h-4 w-4 text-purple" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="px-2.5 py-4 text-center text-xs text-muted">No domains found</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Comparison chips */}
      <div className="hidden items-center gap-1.5 md:flex">
        <span className="text-2xs text-muted">Compare:</span>
        {DOMAINS.map((d) => {
          const on = comparison.includes(d.id);
          return (
            <button
              key={d.id}
              onClick={() => toggleComparison(d.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
                on ? "border-transparent text-white" : "border-border bg-card text-muted hover:bg-workspace",
              )}
              style={on ? { background: d.accent } : undefined}
            >
              <Circle
                className="h-2 w-2"
                style={{ fill: on ? "#fff" : d.accent, color: on ? "#fff" : d.accent }}
              />
              {d.name}
            </button>
          );
        })}
      </div>

      {/* Range selector */}
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-workspace p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              range === r.key ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
