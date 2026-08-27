"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/dates";
import { compactNumber } from "@/lib/format";

const AXIS = { fontSize: 11, fill: "rgb(var(--muted))" };
const GRID = "rgb(var(--border))";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 font-medium text-ink">
        {typeof label === "string" && label.length === 10 ? formatDate(label) : label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color || p.stroke || p.fill }}
          />
          <span className="capitalize">{p.name}:</span>
          <span className="font-medium tabular-nums text-ink">
            {typeof p.value === "number" ? compactNumber(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AreaTrend({
  data,
  dataKey,
  height = 220,
  color = "var(--accent)",
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tickFormatter={(v) => (typeof v === "string" && v.length === 10 ? formatDate(v).slice(0, 6) : v)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compactNumber} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${dataKey})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({
  data,
  series,
  height = 240,
}: {
  data: Record<string, number | string>[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tickFormatter={(v) => (typeof v === "string" && v.length === 10 ? formatDate(v).slice(0, 6) : v)}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={compactNumber} />
        <Tooltip content={<ChartTooltip />} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarSeries({
  data,
  xKey,
  yKey,
  height = 220,
  colors,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  height?: number;
  colors?: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={compactNumber} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(51,92,255,0.07)" }} />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors?.[i % colors.length] ?? "var(--accent)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
