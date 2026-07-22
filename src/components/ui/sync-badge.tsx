"use client";

import { Database, CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeFromNow } from "@/lib/dates";

/**
 * Truthful data-state badge. Live datasets show their source + sync recency;
 * un-synced surfaces say so plainly. There is no demo data in the product.
 */
export function SyncBadge({
  lastSync,
  loading = false,
  className,
}: {
  lastSync: string | null | undefined;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-workspace px-2 py-0.5 text-2xs font-medium text-muted",
          className,
        )}
      >
        <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
      </span>
    );
  }
  if (!lastSync) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-[#9A6B12]",
          className,
        )}
        title="No live data stored yet for this view. Run a sync to populate it."
      >
        <CloudOff className="h-3 w-3" /> Awaiting first sync
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-2xs font-medium text-success",
        className,
      )}
      title={`Latest provider sync: ${lastSync}`}
    >
      <Database className="h-3 w-3" /> Live · {relativeFromNow(lastSync)}
    </span>
  );
}
