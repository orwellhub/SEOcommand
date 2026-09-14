"use client";

import { Card, DeltaPill } from "./primitives";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  delta,
  invertDelta = false,
  spark,
  hint,
  accent,
}: {
  label: string;
  value: string;
  delta?: number;
  invertDelta?: boolean;
  spark?: number[];
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted">
          {label}
        </span>
        {delta !== undefined && <DeltaPill value={delta} invert={invertDelta} />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span
          className={cn(
            "text-[26px] font-semibold tabular-nums tracking-[-0.035em] text-ink tnum",
            accent && "text-[color:var(--accent)]",
          )}
        >
          {value}
        </span>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} className="h-8 w-20" />
        )}
      </div>
      {hint && <p className="mt-1 text-2xs text-muted">{hint}</p>}
    </Card>
  );
}
