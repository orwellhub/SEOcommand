"use client";

import { cn } from "@/lib/cn";
import { currency } from "@/lib/format";

/** Budget / usage meter with 50/75/90/100 threshold colouring. */
export function UsageMeter({
  spent,
  limit,
  label,
  compact = false,
}: {
  spent: number;
  limit: number;
  label?: string;
  compact?: boolean;
}) {
  const pct = limit === 0 ? 0 : Math.min(100, (spent / limit) * 100);
  const tone =
    pct >= 100 ? "bg-critical" : pct >= 90 ? "bg-critical" : pct >= 75 ? "bg-warning" : pct >= 50 ? "bg-warning" : "bg-success";
  return (
    <div className={cn(!compact && "space-y-1.5")}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-medium text-ink tnum">
            {currency(spent)} / {currency(limit)}
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-workspace">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-2xs text-muted tnum">
          <span>{pct.toFixed(0)}% used</span>
          <span>{currency(Math.max(0, limit - spent))} remaining</span>
        </div>
      )}
    </div>
  );
}
