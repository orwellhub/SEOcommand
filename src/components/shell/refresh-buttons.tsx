"use client";

import { useState } from "react";
import { RefreshCw, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useDomain } from "./domain-context";
import { cn } from "@/lib/cn";

type Source = "google" | "dataforseo";
type Phase = "idle" | "running" | "done" | "error";

const LABEL: Record<Source, string> = {
  google: "Refresh Google data",
  dataforseo: "Refresh DataForSEO",
};

const HINT: Record<Source, string> = {
  google: "Search Console + GA4 — free, safe to run often.",
  dataforseo: "Keywords, rankings, competitors, backlinks — chargeable, runs inside the monthly budget.",
};

/**
 * The two dashboard refresh actions. Google data is free so it runs straight
 * away; the DataForSEO pull spends budget, so it asks for confirmation first.
 * Both scope to the selected property, or the whole portfolio on "Portfolio".
 */
export function RefreshButtons({ className }: { className?: string }) {
  const { scope } = useDomain();
  const [phase, setPhase] = useState<Record<Source, Phase>>({ google: "idle", dataforseo: "idle" });
  const [message, setMessage] = useState<string | null>(null);

  const busy = phase.google === "running" || phase.dataforseo === "running";

  async function run(source: Source) {
    if (busy) return;
    if (source === "dataforseo") {
      const target = scope === "portfolio" ? "all properties" : scope;
      const ok = window.confirm(
        `Run a chargeable DataForSEO pull for ${target}?\n\nThis spends from the monthly budget and is blocked automatically if it would breach the cap.`,
      );
      if (!ok) return;
    }

    setPhase((p) => ({ ...p, [source]: "running" }));
    setMessage(null);
    try {
      const res = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, domainId: scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setPhase((p) => ({ ...p, [source]: "error" }));
        setMessage(data.error ?? `Refresh failed (${res.status}).`);
        return;
      }
      setPhase((p) => ({ ...p, [source]: "done" }));
      const seconds = Math.max(1, Math.round((data.elapsedMs ?? 0) / 1000));
      setMessage(`${LABEL[source]} complete in ${seconds}s. Reloading…`);
      // Snapshots changed — pull the page's data again.
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setPhase((p) => ({ ...p, [source]: "error" }));
      setMessage("Could not reach the refresh service.");
    }
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {(["google", "dataforseo"] as Source[]).map((source) => {
          const state = phase[source];
          return (
            <Button
              key={source}
              variant={source === "google" ? "secondary" : "primary"}
              size="sm"
              onClick={() => run(source)}
              disabled={busy}
              title={HINT[source]}
            >
              {state === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : state === "done" ? (
                <Check className="h-3.5 w-3.5" />
              ) : state === "error" ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {LABEL[source]}
            </Button>
          );
        })}
      </div>
      {message && (
        <p
          className={cn(
            "max-w-md text-right text-2xs",
            phase.google === "error" || phase.dataforseo === "error" ? "text-critical" : "text-muted",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
