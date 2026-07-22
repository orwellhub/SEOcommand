"use client";

import { cn } from "@/lib/cn";

/** Dependency-free inline SVG sparkline. Uses the active accent colour. */
export function Sparkline({
  data,
  className,
  stroke = "var(--accent)",
}: {
  data: number[];
  className?: string;
  stroke?: string;
}) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const last = data[data.length - 1]!;
  const first = data[0]!;
  const rising = last >= first;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={rising ? stroke : "#EF4D56"}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
