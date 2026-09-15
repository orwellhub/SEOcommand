"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Settings2 } from "lucide-react";
import { currentToolkit } from "@/lib/toolkits";
import { useDomain, type RangeKey } from "./domain-context";
import { ScopePicker } from "./scope-picker";
import { cn } from "@/lib/cn";

export function ContextBar() {
  const { activeDomain, activeGroup, range, setRange } = useDomain();
  const pathname = usePathname(), params = useSearchParams();
  const kit = currentToolkit(pathname, new URLSearchParams(params));
  const dateAware = ["/portfolio", "/reports/client", "/market-intelligence", "/performance", "/ai-visibility"].includes(pathname);
  return <div className="flex min-h-9 flex-wrap items-center gap-2 bg-workspace px-4 py-1 sm:px-5">
    <div className="w-full min-w-0 flex-none sm:w-auto sm:flex-1 lg:order-last lg:max-w-64"><ScopePicker compact /></div>
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-xs text-muted lg:flex"><Link href="/portfolio?scope=portfolio" className="hover:text-purple">Home</Link><ChevronRight className="h-3 w-3" /><span>{kit.label}</span><ChevronRight className="h-3 w-3" /><span className="max-w-80 truncate font-medium text-ink">{activeDomain?.host ?? activeGroup?.name ?? "All websites"}</span></nav>
    {dateAware && <div className="ml-auto flex items-center gap-1" aria-label="Reporting period">{(["7d", "28d", "90d"] as RangeKey[]).map((key) => <button key={key} aria-pressed={range === key} onClick={() => setRange(key)} className={cn("min-h-8 rounded px-2.5 text-xs", range === key ? "bg-rail-selected font-bold text-purple" : "text-muted hover:bg-workspace")}>{parseInt(key)} days</button>)}</div>}
    {activeDomain && <Link href={`/sites/${encodeURIComponent(activeDomain.id)}/settings`} aria-label="Website settings" className={cn("flex h-8 w-8 items-center justify-center rounded text-muted hover:bg-workspace", !dateAware && "ml-auto")}><Settings2 className="h-4 w-4" /></Link>}
  </div>;
}
