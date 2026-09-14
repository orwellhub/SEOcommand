"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { navigateSafely } from "@/components/ui/unsaved-changes";
import { switchScopeHref } from "@/lib/site-context";
import { useDomain } from "./domain-context";

export function ScopePicker({ label = "Website or portfolio scope", onNavigate, compact = false }: { label?: string; onNavigate?: () => void; compact?: boolean }) {
  const { scope, setScope, sites, groups } = useDomain();
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  return <select aria-label={label} value={scope} onChange={(event) => {
    const next = event.target.value;
    navigateSafely(() => { setScope(next); router.push(switchScopeHref(pathname, new URLSearchParams(params), next)); onNavigate?.(); });
  }} className={compact ? "h-8 w-full min-w-0 rounded border border-border bg-card px-2 text-sm font-semibold text-ink" : "h-10 w-full min-w-0 rounded-md border border-border bg-card px-2 text-sm font-semibold text-ink"}>
    <option value="portfolio">All websites</option>{groups.length > 0 && <optgroup label="Groups">{groups.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.name}</option>)}</optgroup>}
    <optgroup label="Websites">{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</optgroup>
  </select>;
}
