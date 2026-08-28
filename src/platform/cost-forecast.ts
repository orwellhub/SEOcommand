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
  const aiPromptCount = Math.max(0, input.aiPrompts);
  const dailyAiPrompts = Math.min(aiPromptCount, 2);
  const weeklyAiPrompts = Math.min(Math.max(aiPromptCount - dailyAiPrompts, 0), 6);
  const monthlyAiPrompts = Math.max(aiPromptCount - dailyAiPrompts - weeklyAiPrompts, 0);
  const aiChecksPerPlatform = dailyAiPrompts * 2 * 30 + weeklyAiPrompts * 4 + monthlyAiPrompts;
  const aiUnits = aiChecksPerPlatform * Math.max(0, input.aiPlatforms);

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
      label: "Keywords, competitor gaps and content history",
      cadence: "weekly",
      units: 20,
      unitCostUsd: 0.04,
      monthlyUsd: money(20 * 0.04),
      note: "Weekly domain discovery, three principal gaps and one principal competitor page snapshot",
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
      cadence: "tiered daily / weekly / monthly",
      units: aiUnits,
      unitCostUsd: 0.06,
      monthlyUsd: money(aiUnits * 0.06),
      note: `${dailyAiPrompts} daily (2 samples), ${weeklyAiPrompts} weekly, ${monthlyAiPrompts} monthly × ${input.aiPlatforms} platform${input.aiPlatforms === 1 ? "" : "s"}`,
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
