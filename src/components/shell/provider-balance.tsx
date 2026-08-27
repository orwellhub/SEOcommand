"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WalletCards } from "lucide-react";
import { cn } from "@/lib/cn";

type BalanceState =
  | { status: "loading" }
  | { status: "ready"; balanceUsd: number; updatedAt: string }
  | { status: "unavailable" };

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function ProviderBalance() {
  const [state, setState] = useState<BalanceState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/providers/dataforseo/balance").catch(() => null);
      const body = response?.ok ? await response.json().catch(() => null) as { available?: boolean; balanceUsd?: number; updatedAt?: string } | null : null;
      if (!active) return;
      if (body?.available && typeof body.balanceUsd === "number" && body.updatedAt) {
        setState({ status: "ready", balanceUsd: body.balanceUsd, updatedAt: body.updatedAt });
      } else {
        setState({ status: "unavailable" });
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const tone = state.status === "ready"
    ? state.balanceUsd <= 10 ? "critical" : state.balanceUsd <= 50 ? "warning" : "healthy"
    : "neutral";
  const label = state.status === "loading" ? "Loading DataForSEO balance"
    : state.status === "ready" ? `DataForSEO balance ${formatter.format(state.balanceUsd)}. Updated ${new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "DataForSEO balance unavailable";

  return (
    <Link
      href="/settings"
      aria-label={label}
      title={label}
      className={cn(
        "group flex h-9 shrink-0 items-center gap-2 rounded-md border px-2.5 transition-colors",
        tone === "healthy" && "border-success/20 bg-success/5 hover:bg-success/10",
        tone === "warning" && "border-warning/25 bg-warning/5 hover:bg-warning/10",
        tone === "critical" && "border-critical/25 bg-critical/5 hover:bg-critical/10",
        tone === "neutral" && "border-border bg-workspace hover:border-purple/30",
      )}
    >
      <span className={cn(
        "flex h-6 w-6 items-center justify-center rounded",
        tone === "healthy" ? "bg-success/10 text-success" : tone === "warning" ? "bg-warning/10 text-warning" : tone === "critical" ? "bg-critical/10 text-critical" : "bg-card text-muted",
      )}><WalletCards className="h-3.5 w-3.5" /></span>
      <span className="hidden leading-tight xl:block">
        <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted">DataForSEO</span>
        <span className="block text-xs font-extrabold text-ink tnum">{state.status === "ready" ? formatter.format(state.balanceUsd) : state.status === "loading" ? "Loading…" : "Unavailable"}</span>
      </span>
      <span className="text-xs font-extrabold text-ink tnum xl:hidden">{state.status === "ready" ? formatter.format(state.balanceUsd) : "—"}</span>
    </Link>
  );
}
