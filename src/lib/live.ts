import type {
  AiPrompt,
  Backlink,
  Competitor,
  CrawlRun,
  Ga4ChannelRow,
  Ga4LandingPage,
  Ga4Overview,
  GscMover,
  GscRow,
  GscQueryPageRow,
  GscTotals,
  HealthBreakdown,
  Keyword,
  PositionBucket,
  Provenance,
  RankSnapshot,
  RecConfidence,
  RecEffort,
  ReferringDomain,
  ShareOfMarket,
  StrikingDistanceRow,
  TechnicalIssue,
} from "./types";
import type { BacklinkHistoryPoint, KeywordGapRow } from "@/platform/types";

/**
 * The live read-model contract. The sync engine writes these dataset keys to
 * the snapshot store; /api/live serves them; pages render them. Every value is
 * a canonical model from src/lib/types — no vendor shapes.
 */

export const DATASETS = [
  "keywords",
  "rank_snapshots",
  "position_buckets",
  "visibility_point",
  "competitors",
  "keyword_gaps",
  "backlinks",
  "referring_domains",
  "backlink_history",
  "onpage",
  "ai_prompts",
  "gsc_totals",
  "gsc_timeseries",
  "gsc_queries",
  "gsc_pages",
  "gsc_query_pages",
  "gsc_movers",
  "gsc_page_movers",
  "striking_distance",
  "share_of_market",
  "ga4_overview",
  "ga4_landing_pages",
  "ga4_channels",
  "recommendations",
] as const;

export type DatasetKey = (typeof DATASETS)[number];

export interface DS<T> {
  data: T;
  capturedOn: string;
  provenance: Provenance;
}

export interface OnPageResult {
  breakdown: HealthBreakdown[];
  crawlRun: CrawlRun | null;
  issues: TechnicalIssue[];
  healthScore: number;
}

export interface GscTimeseriesPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** A recommendation derived from live data signals at sync time. */
export interface DerivedRecommendation {
  id: string;
  domainId: string;
  title: string;
  module: string;
  priorityScore: number;
  estImpact: string;
  confidence: RecConfidence;
  effort: RecEffort;
  evidence: string;
  relatedMetric: string;
}

export interface DomainLiveBundle {
  domainId: string;
  lastSync: string | null;
  datasets: {
    keywords?: DS<Keyword[]>;
    rank_snapshots?: DS<RankSnapshot[]>;
    position_buckets?: DS<PositionBucket[]>;
    /** Accumulated daily visibility points (full history, ascending by date). */
    visibility_series?: DS<{ date: string; value: number }[]>;
    competitors?: DS<Competitor[]>;
    keyword_gaps?: DS<KeywordGapRow[]>;
    backlinks?: DS<Backlink[]>;
    referring_domains?: DS<ReferringDomain[]>;
    backlink_history?: DS<BacklinkHistoryPoint[]>;
    onpage?: DS<OnPageResult>;
    ai_prompts?: DS<AiPrompt[]>;
    gsc_totals?: DS<GscTotals>;
    gsc_timeseries?: DS<GscTimeseriesPoint[]>;
    gsc_queries?: DS<GscRow[]>;
    gsc_pages?: DS<GscRow[]>;
    gsc_query_pages?: DS<GscQueryPageRow[]>;
    gsc_movers?: DS<{ gains: GscMover[]; losses: GscMover[] }>;
    gsc_page_movers?: DS<{ gains: GscMover[]; losses: GscMover[] }>;
    striking_distance?: DS<StrikingDistanceRow[]>;
    share_of_market?: DS<ShareOfMarket | null>;
    ga4_overview?: DS<Ga4Overview>;
    ga4_landing_pages?: DS<Ga4LandingPage[]>;
    ga4_channels?: DS<Ga4ChannelRow[]>;
    recommendations?: DS<DerivedRecommendation[]>;
  };
}

/** Headline aggregates for the portfolio rail + portfolio page. */
export interface DomainHeadline {
  domainId: string;
  lastSync: string | null;
  clicks28d: number | null;
  impressions28d: number | null;
  avgPosition: number | null;
  sessions28d: number | null;
  conversions28d: number | null;
  visibility: number | null;
  health: number | null;
  authority: number | null;
  keywordsTracked: number | null;
  top10: number | null;
  referringDomains: number | null;
  criticalIssues: number | null;
  aiMentionRate: number | null;
  ga4Mapped: boolean;
}

export interface PortfolioLive {
  generatedAt: string;
  domains: DomainHeadline[];
  totals: {
    clicks28d: number;
    impressions28d: number;
    sessions28d: number;
    conversions28d: number;
    avgHealth: number | null;
    avgVisibility: number | null;
    criticalIssues: number;
    referringDomains: number;
    domainsSynced: number;
  };
}
