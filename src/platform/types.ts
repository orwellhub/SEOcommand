import type { Device, Domain } from "@/lib/types";

export type SiteLifecycle =
  | "draft"
  | "forecast_pending"
  | "approved"
  | "provisioning"
  | "active"
  | "pre_launch"
  | "paused"
  | "archived"
  | "error";

export type SpendApproval = "draft" | "pending" | "approved" | "rejected";
export type SiteConnectionKind = "github" | "hostinger_git" | "webhook";
export type AlertChannel = "in_app" | "whatsapp" | "email";
export type AiVisibilityPlatform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "google_ai_overview"
  | "google_ai_mode"
  | "copilot";
export type AiPromptCadence = "daily" | "weekly" | "monthly";
export type SpendCategory = "rankings" | "crawling" | "backlinks" | "competitors" | "ai" | "local_seo";

export type SiteBudgetLimits = Partial<Record<SpendCategory, number | null>>;

export interface SiteMonitoringSchedule {
  rankings?: AiPromptCadence;
  crawling?: AiPromptCadence;
  backlinks?: AiPromptCadence;
  competitors?: AiPromptCadence;
  ai?: AiPromptCadence;
  localSeo?: AiPromptCadence;
  reliability?: "hourly" | "daily";
}

export interface PortfolioGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  parentId: string | null;
  sortOrder: number;
  siteSlugs: string[];
  /** Websites whose navigational home is this folder. `siteSlugs` still
   * includes secondary reporting memberships. */
  primarySiteSlugs: string[];
}

export type ScanModule =
  | "google"
  | "rankings"
  | "keywords"
  | "competitors"
  | "technical"
  | "backlinks"
  | "ai"
  | "local"
  | "reliability";

export interface ScanRequest {
  siteSlug: string;
  modules: ScanModule[];
  label?: string;
}

export interface SiteCostForecastLine {
  key: string;
  label: string;
  cadence: string;
  units: number;
  unitCostUsd: number;
  monthlyUsd: number;
  note: string;
}

export interface SiteCostForecast {
  currency: "USD";
  monthlyUsd: number;
  lowUsd: number;
  highUsd: number;
  assumptions: {
    trackedKeywords: number;
    crawlMaxPages: number;
    backlinkLimit: number;
    aiPrompts: number;
    aiPlatforms: number;
    devices: Device[];
  };
  lines: SiteCostForecastLine[];
}

export interface ManagedSite extends Domain {
  devices: Device[];
  lifecycleStatus: SiteLifecycle;
  spendApproval: SpendApproval;
  forecastMonthlyUsd: number;
  approvedMonthlyUsd: number | null;
  budgetLimits: SiteBudgetLimits;
  forecast: SiteCostForecast | null;
  crawlMaxPages: number;
  backlinkLimit: number;
  monitoringSchedule: SiteMonitoringSchedule;
  siteSettings: Record<string, unknown>;
  archivedAt: string | null;
  source: "database" | "registry";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SiteConnectionInput {
  kind: SiteConnectionKind;
  displayName: string;
  remoteUrl?: string;
  config?: Record<string, unknown>;
}

export interface SiteOnboardingInput {
  name: string;
  host: string;
  industry: string;
  market: string;
  locationCode: number;
  languageCode: string;
  devices: Device[];
  gscProperty?: string | null;
  ga4Property?: string | null;
  trackedKeywords: number;
  crawlMaxPages: number;
  backlinkLimit: number;
  aiPrompts: number;
  aiPlatforms: AiVisibilityPlatform[];
  connections: SiteConnectionInput[];
  alertChannels: AlertChannel[];
  emailRecipients?: string[];
  whatsappRecipients?: string[];
}

export interface GooglePropertyCandidate {
  id: string;
  label: string;
  url: string | null;
  matched: boolean;
}

export interface GooglePropertyDiscovery {
  configured: boolean;
  gsc: GooglePropertyCandidate[];
  ga4: GooglePropertyCandidate[];
  warnings: string[];
}

export interface DetailedCrawlPage {
  url: string;
  statusCode: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  wordCount: number | null;
  contentType: string | null;
  depth: number | null;
  loadTimeMs: number | null;
  checks: Record<string, boolean | number | string>;
  links: Record<string, number>;
}

export interface KeywordGapRow {
  competitorHost: string;
  keyword: string;
  sitePosition: number | null;
  competitorPosition: number | null;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  trafficPotential: number | null;
}

export interface BacklinkHistoryPoint {
  date: string;
  backlinks: number;
  referringDomains: number;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
  rank: number | null;
  raw: Record<string, unknown>;
}

export interface TrackedRankingResult {
  trackedKeywordId: string;
  keyword: string;
  device: Device;
  locationCode: number;
  position: number | null;
  previousPosition: number | null;
  url: string | null;
  serpFeatures: string[];
  ownedFeatures: string[];
  intent: string | null;
  competitors: Array<{ host: string; position: number; url: string | null }>;
}

export interface AiCitationEvidence {
  url: string;
  domain: string;
  title: string | null;
  position: number;
  owned: boolean;
}

export interface AiEntityEvidence {
  name: string;
  host: string | null;
  entityType: "brand" | "competitor" | "product";
  position: number | null;
  sentiment: "positive" | "neutral" | "negative";
  owned: boolean;
}

export interface AiObservationInput {
  promptId: string | null;
  siteSlug: string;
  prompt: string;
  topic: string;
  platform: AiVisibilityPlatform;
  modelName: string;
  sampleIndex: number;
  capturedOn: string;
  mentioned: boolean;
  cited: boolean;
  recommendationPosition: number | null;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  responseText: string;
  responseHash: string;
  fanOutQueries: string[];
  raw: Record<string, unknown>;
  costUsd: number;
  citations: AiCitationEvidence[];
  entities: AiEntityEvidence[];
}

export interface AiVisibilityRun {
  prompts: import("@/lib/types").AiPrompt[];
  observations: AiObservationInput[];
  skippedPlatforms: { platform: AiVisibilityPlatform; reason: string }[];
}

export interface AiPromptOpportunity {
  id: string;
  siteSlug: string;
  prompt: string;
  topic: string;
  source: string;
  intent: string | null;
  aiSearchVolume: number | null;
  priorityScore: number;
  status: string;
  evidence: Record<string, unknown>;
}

export interface AiCrawlerAuditRow {
  bot: string;
  category: "training" | "search" | "assistant";
  access: "allowed" | "blocked" | "unknown";
  evidence: string;
  robotsUrl: string;
}
