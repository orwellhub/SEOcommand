import type { ScanModule } from "./types";
import type { SyncTiers } from "@/sync/engine";

export const SCAN_MODULES: { id: ScanModule; label: string; description: string; paid: boolean; estimatedUsd: number; color: string }[] = [
  { id: "google", label: "Google data", description: "Search Console and GA4 performance", paid: false, estimatedUsd: 0, color: "#335CFF" },
  { id: "rankings", label: "Rankings", description: "Exact tracked keyword positions", paid: true, estimatedUsd: 0.06, color: "#2563EB" },
  { id: "keywords", label: "Keywords", description: "Organic footprint and search demand", paid: true, estimatedUsd: 0.12, color: "#12B8C4" },
  { id: "competitors", label: "Competitors", description: "Competitor discovery, keyword gaps and content history", paid: true, estimatedUsd: 0.20, color: "#FF6B5E" },
  { id: "technical", label: "Technical", description: "Inventory crawl and rendered evidence", paid: true, estimatedUsd: 0.08, color: "#5965D8" },
  { id: "backlinks", label: "Backlinks", description: "Links, referring domains and history", paid: true, estimatedUsd: 0.14, color: "#16A879" },
  { id: "ai", label: "AI visibility", description: "Due prompts and crawler access", paid: true, estimatedUsd: 0.48, color: "#7137F5" },
  { id: "local", label: "Local SEO", description: "Business profile and approved map grids", paid: true, estimatedUsd: 0.09, color: "#E46A45" },
  { id: "reliability", label: "Reliability", description: "Availability, TLS, robots and sitemap", paid: false, estimatedUsd: 0, color: "#F2B544" },
];

export const FULL_SCAN_MODULES = SCAN_MODULES.map((item) => item.id);

export function estimateScanCost(modules: ScanModule[]) {
  const unique = [...new Set(modules)];
  const lines = SCAN_MODULES.filter((item) => unique.includes(item.id));
  return {
    currency: "USD" as const,
    estimatedUsd: Number(lines.reduce((sum, item) => sum + item.estimatedUsd, 0).toFixed(2)),
    paidModules: lines.filter((item) => item.paid).map((item) => item.id),
    freeModules: lines.filter((item) => !item.paid).map((item) => item.id),
    lines,
  };
}

export function tiersForModules(modules: ScanModule[]): SyncTiers {
  const selected = new Set(modules);
  return {
    google: selected.has("google"),
    rankings: selected.has("rankings"),
    dfsLight: selected.has("keywords") || selected.has("competitors") || selected.has("backlinks"),
    dfsHeavy: selected.has("technical"),
    ai: selected.has("ai"),
    dedupePaid: false,
    dfsLightModules: ["keywords", "competitors", "backlinks"].filter((module): module is "keywords" | "competitors" | "backlinks" => selected.has(module as ScanModule)),
  };
}
