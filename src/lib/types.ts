/**
 * Canonical internal models for the Orwell SEO Command Centre.
 *
 * Provider adapters (DataForSEO, Google Search Console, GA4, demo) normalise
 * their raw responses into these shapes. UI and business logic only ever touch
 * these types — never a vendor payload shape. See docs/provider-contracts.md.
 */

export type DomainId = "mortgagecompare" | "busrentalglobal" | "pettransportglobal";

export type AccentKey = "mortgage" | "bus" | "pet";

export interface Domain {
  id: DomainId;
  name: string;
  host: string;
  accentKey: AccentKey;
  accent: string;
  industry: string;
  primaryMarket: string;
  gscConnected: boolean;
  ga4Connected: boolean;
  dataForSeoConnected: boolean;
}

/** Where a displayed dataset came from and how fresh it is. */
export type ProviderSource =
  | "demo"
  | "dataforseo"
  | "google-search-console"
  | "google-analytics";

export type FreshnessStatus = "fresh" | "recent" | "stale";
export type DataMode = "demo" | "cached" | "live";
export type Device = "desktop" | "mobile";

export interface Provenance {
  source: ProviderSource;
  collectedAt: string; // ISO
  rangeStart: string; // ISO (date)
  rangeEnd: string; // ISO (date)
  location: string;
  device: Device;
  freshness: FreshnessStatus;
  mode: DataMode;
}

export type Trend = "up" | "down" | "flat";
export type Severity = "critical" | "high" | "medium" | "low";
export type SearchIntent = "informational" | "navigational" | "commercial" | "transactional";

export interface KpiPoint {
  label: string;
  value: number;
  unit?: "count" | "percent" | "currency" | "position" | "score";
  deltaPct?: number;
  trend?: Trend;
  spark?: number[];
}

export interface SeriesPoint {
  date: string; // ISO date
  [key: string]: number | string;
}

/* ------------------------------- Keywords ------------------------------- */

export type SerpFeature =
  | "featured_snippet"
  | "people_also_ask"
  | "local_pack"
  | "image_pack"
  | "video"
  | "sitelinks"
  | "reviews"
  | "top_stories"
  | "ai_overview"
  | "knowledge_panel";

export interface Keyword {
  id: string;
  domainId: DomainId;
  keyword: string;
  location: string;
  intent: SearchIntent;
  volume: number;
  difficulty: number; // 0-100
  cpc: number;
  competition: number; // 0-1
  position: number | null;
  prevPosition: number | null;
  competitorPositions: Record<string, number | null>;
  trafficPotential: number;
  serpFeatures: SerpFeature[];
  trend: number[]; // 12-month volume index
  targetUrl: string | null;
  listId?: string | null;
}

export interface KeywordList {
  id: string;
  domainId: DomainId;
  name: string;
  description: string;
  keywordCount: number;
  totalVolume: number;
  avgDifficulty: number;
  updatedAt: string;
}

/* ------------------------------- Rankings ------------------------------- */

export interface RankSnapshot {
  keywordId: string;
  keyword: string;
  date: string;
  position: number;
  prevPosition: number;
  device: Device;
  location: string;
  url: string;
  volume: number;
  serpFeatures: SerpFeature[];
  tags: string[];
}

export interface PositionBucket {
  label: string; // "1-3", "4-10", ...
  count: number;
  prevCount: number;
}

/* ----------------------------- Competitors ------------------------------ */

export interface Competitor {
  id: string;
  domainId: DomainId;
  host: string;
  commonKeywords: number;
  keywords: number;
  authority: number;
  estTraffic: number;
  overlapPct: number;
  trend: Trend;
}

/* ------------------------------ Site Audit ------------------------------ */

export type IssueStatus = "open" | "in_progress" | "resolved" | "ignored";

export interface TechnicalIssue {
  id: string;
  domainId: DomainId;
  title: string;
  category: string;
  severity: Severity;
  explanation: string;
  affectedPages: number;
  samplePages: string[];
  evidence: string;
  recommendedFix: string;
  potentialImpact: string;
  firstSeen: string;
  lastSeen: string;
  status: IssueStatus;
  taskId: string | null;
}

export interface HealthBreakdown {
  category: string;
  weight: number; // fraction of overall score
  score: number; // 0-100
  issues: number;
}

export interface CrawlRun {
  id: string;
  domainId: DomainId;
  startedAt: string;
  completedAt: string;
  pagesCrawled: number;
  healthScore: number;
  newIssues: number;
  resolvedIssues: number;
  status: "completed" | "running" | "failed";
}

/* ------------------------------ Backlinks ------------------------------- */

export interface Backlink {
  id: string;
  domainId: DomainId;
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchor: string;
  authority: number; // Orwell Authority Score of source
  follow: boolean;
  firstSeen: string;
  lastSeen: string;
  status: "new" | "active" | "lost";
  toxicity: number; // 0-100 risk
}

export interface ReferringDomain {
  id: string;
  domainId: DomainId;
  host: string;
  authority: number;
  backlinks: number;
  firstSeen: string;
  follow: boolean;
  topicalRelevance: number; // 0-100
}

/* ----------------------------- AI Visibility ---------------------------- */

export type AiPlatform = "chatgpt" | "google_ai" | "gemini" | "perplexity" | "claude";
export type Sentiment = "positive" | "neutral" | "negative";

export interface AiPrompt {
  id: string;
  domainId: DomainId;
  prompt: string;
  topic: string;
  platforms: AiPlatform[];
  mentionRate: number; // 0-100
  citationRate: number; // 0-100
  avgPosition: number | null; // recommendation rank
  sentiment: Sentiment;
  lastChecked: string;
  competitorsMentioned: string[];
  sampleResponse: string;
  cited: boolean;
}

/* -------------------------- Recommendations ----------------------------- */

export type RecConfidence = "high" | "medium" | "low";
export type RecEffort = "S" | "M" | "L";
export type TaskStatus = "backlog" | "approved" | "in_progress" | "review" | "done";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export interface Recommendation {
  id: string;
  domainId: DomainId;
  title: string;
  module: string;
  priorityScore: number; // 0-100
  estImpact: string;
  confidence: RecConfidence;
  effort: RecEffort;
  evidence: string;
  relatedMetric: string;
  approval: ApprovalStatus;
  taskId: string | null;
}

export interface Task {
  id: string;
  domainId: DomainId;
  title: string;
  status: TaskStatus;
  approval: ApprovalStatus;
  owner: string;
  dueDate: string;
  effort: RecEffort;
  sourceRecommendationId: string | null;
  beforeMetric: string;
  afterMetric: string | null;
}

/* -------------------------------- Reports ------------------------------- */

export interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  sections: string[];
}

export interface ReportSchedule {
  id: string;
  domainId: DomainId | "portfolio";
  templateId: string;
  templateName: string;
  cadence: "daily" | "weekly" | "monthly";
  nextRun: string;
  recipients: string[];
  lastDelivered: string | null;
  format: "PDF" | "CSV" | "PDF+CSV";
}

/* ---------------------------- Content module ---------------------------- */

export type ContentStatus = "performing" | "decaying" | "opportunity" | "cannibalising";

export interface ContentItem {
  id: string;
  domainId: DomainId;
  url: string;
  title: string;
  status: ContentStatus;
  clicks: number;
  clicksDeltaPct: number;
  impressions: number;
  avgPosition: number;
  words: number;
  lastUpdated: string;
  primaryKeyword: string;
  opportunity: string;
}

/* ------------------------------- Cost/usage ----------------------------- */

export interface UsageLedgerEntry {
  id: string;
  date: string;
  provider: ProviderSource;
  module: string;
  requests: number;
  cost: number;
  domainId: DomainId | "portfolio";
}

export interface ProviderConnection {
  id: string;
  provider: ProviderSource;
  label: string;
  connected: boolean;
  lastSync: string | null;
  status: "connected" | "disconnected" | "error" | "syncing";
  detail: string;
}

/* ------------------- First-party: Search Console & GA4 ------------------ */

/** GSC headline totals for a window (owned-site performance). */
export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number; // percent
  position: number; // average
}

export interface GscRow {
  key: string; // query | page | country | device value
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** A query ranking just off page one — the cheapest available win. */
export interface StrikingDistanceRow {
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface GscMover {
  key: string;
  clicksNow: number;
  clicksBefore: number;
  change: number;
  positionNow: number | null;
  positionBefore: number | null;
}

/** Measured share of the researched click pool (from benchmarks.json). */
export interface ShareOfMarket {
  site: string;
  windowDays: number;
  measuredClicks: number;
  measuredImpressions: number;
  keywordCount: number;
  monthlySearchVolume: number;
  availableMonthlyClicks: number;
  availableClicksInWindow: number;
  shareOfAvailableClicksPct: number;
  impressionShareOfDemandPct: number;
  baselined: string | null;
}

/** GA4 organic overview for a window. */
export interface Ga4Overview {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  engagedSessions: number;
  engagementRate: number;
  conversions: number; // keyEvents
  screenPageViews: number;
}

export interface Ga4LandingPage {
  landingPage: string;
  sessions: number;
  totalUsers: number;
  engagementRate: number;
  conversions: number;
}

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  conversions: number;
}

/* ------------------------------- Alerts --------------------------------- */

export interface AlertItem {
  id: string;
  domainId: DomainId | "portfolio";
  severity: Severity;
  title: string;
  detail: string;
  createdAt: string;
  module: string;
  read: boolean;
}
