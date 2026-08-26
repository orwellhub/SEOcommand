"use client";

import { cn } from "@/lib/cn";
import type { DataMode, FreshnessStatus, ProviderSource, Severity } from "@/lib/types";
import {
  AlertTriangle,
  CircleAlert,
  Info,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

/* --------------------------------- Card --------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-2xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

/* -------------------------------- Badges -------------------------------- */

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-critical/10 text-critical border-critical/20",
  high: "bg-warning/10 text-[#B9791A] border-warning/25",
  medium: "bg-[#3B82F6]/10 text-[#2563EB] border-[#3B82F6]/20",
  low: "bg-muted/10 text-muted border-border",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const icon =
    severity === "critical" ? (
      <CircleAlert className="h-3 w-3" />
    ) : severity === "high" ? (
      <AlertTriangle className="h-3 w-3" />
    ) : (
      <Info className="h-3 w-3" />
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium capitalize",
        SEVERITY_STYLES[severity],
      )}
    >
      {icon}
      {severity}
    </span>
  );
}

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "critical" | "neutral" | "info";
}) {
  const tones: Record<string, string> = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-[#B9791A] border-warning/25",
    critical: "bg-critical/10 text-critical border-critical/20",
    info: "bg-purple/10 text-purple border-purple/20",
    neutral: "bg-workspace text-muted border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium capitalize",
        tones[tone],
      )}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

const SOURCE_LABEL: Record<ProviderSource, string> = {
  demo: "Demo data",
  dataforseo: "DataForSEO",
  "google-search-console": "Search Console",
  "google-analytics": "GA4",
  "orwell-crawler": "Orwell crawler",
};

export function SourceBadge({
  source,
  mode,
  freshness,
}: {
  source: ProviderSource;
  mode: DataMode;
  freshness?: FreshnessStatus;
}) {
  const isDemo = mode === "demo";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium",
        isDemo
          ? "border-warning/30 bg-warning/10 text-[#9A6B12]"
          : "border-success/25 bg-success/10 text-success",
      )}
      title={`Source: ${SOURCE_LABEL[source]} · ${mode}${freshness ? " · " + freshness : ""}`}
    >
      <Database className="h-3 w-3" />
      {isDemo ? "Demo data" : SOURCE_LABEL[source]}
    </span>
  );
}

/* ----------------------------- Trend / delta ---------------------------- */

export function DeltaPill({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const isZero = Math.abs(value) < 0.05;
  const tone = isZero ? "muted" : positive ? "success" : "critical";
  const Icon = isZero ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const colours: Record<string, string> = {
    success: "text-success",
    critical: "text-critical",
    muted: "text-muted",
  };
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tnum", colours[tone])}>
      <Icon className="h-3.5 w-3.5" />
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

/* ------------------------------ Empty state ----------------------------- */

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-workspace/50 px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

/* ------------------------------- Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-skeleton rounded", className)} />;
}

/* -------------------------------- Button -------------------------------- */

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 focus-visible:outline-2 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    primary: "bg-purple text-white hover:bg-purple-deep",
    secondary: "border border-border bg-card text-ink hover:bg-workspace",
    ghost: "text-muted hover:bg-workspace hover:text-ink",
  };
  const sizes: Record<string, string> = {
    sm: "h-7 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
  };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}
