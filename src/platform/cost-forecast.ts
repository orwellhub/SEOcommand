import type { SiteCostForecast } from "./types";

export interface ForecastInput {
  trackedKeywords: number;
  crawlMaxPages: number;
  backlinkLimit: number;
  aiPrompts: number;
  aiPlatforms: number;
  devices: ("desktop" | "mobile")[];
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Conservative planning estimate. Provider responses remain the source of
 * truth for actual spend; this estimate exists to obtain site-level approval
 * before any paid task is queued.
 */
export function forecastSiteCost(input: ForecastInput): SiteCostForecast {
  const devices = Math.max(1, input.devices.length);
  const rankingUnits = Math.max(0, input.trackedKeywords) * devices * 30;
  const crawlUnits = Math.ceil(Math.max(0, input.crawlMaxPages) / 100);
  const backlinkUnits = Math.ceil(Math.max(0, input.backlinkLimit) / 1000);
  const aiUnits = Math.max(0, input.aiPrompts) * Math.max(0, input.aiPlatforms);

  const lines = [
    {
      key: "daily_rankings",
      label: "Daily keyword rankings",
      cadence: "daily",
      units: rankingUnits,
      unitCostUsd: 0.003,
      monthlyUsd: money(rankingUnits * 0.003),
      note: `${input.trackedKeywords} keywords × ${devices} device${devices === 1 ? "" : "s"} × 30 days`,
    },
    {
      key: "technical_crawl",
      label: "Full technical crawl",
      cadence: "monthly",
      units: crawlUnits,
      unitCostUsd: 0.03,
      monthlyUsd: money(crawlUnits * 0.03),
      note: `Up to ${input.crawlMaxPages.toLocaleString()} pages`,
    },
    {
      key: "keyword_competitor_gap",
      label: "Keywords and competitor gaps",
      cadence: "weekly",
      units: 12,
      unitCostUsd: 0.04,
      monthlyUsd: money(12 * 0.04),
      note: "Three principal competitors refreshed weekly",
    },
    {
      key: "backlink_history",
      label: "Backlink ledger and history",
      cadence: "weekly",
      units: backlinkUnits * 4 + 4,
      unitCostUsd: 0.04,
      monthlyUsd: money((backlinkUnits * 4 + 4) * 0.04),
      note: `Up to ${input.backlinkLimit.toLocaleString()} links plus historical summary`,
    },
    {
      key: "ai_visibility",
      label: "Multi-model AI visibility",
      cadence: "monthly",
      units: aiUnits,
      unitCostUsd: 0.06,
      monthlyUsd: money(aiUnits * 0.06),
      note: `${input.aiPrompts} prompts × ${input.aiPlatforms} model${input.aiPlatforms === 1 ? "" : "s"}`,
    },
  ];
  const monthlyUsd = money(lines.reduce((sum, line) => sum + line.monthlyUsd, 0));
  return {
    currency: "USD",
    monthlyUsd,
    lowUsd: money(monthlyUsd * 0.8),
    highUsd: money(monthlyUsd * 1.25),
    assumptions: { ...input },
    lines,
  };
}
