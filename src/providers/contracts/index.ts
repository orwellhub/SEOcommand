/**
 * Provider contracts.
 *
 * Provider adapters return canonical internal models from @/lib/types, never
 * raw vendor payloads. UI code reads stored bundles and does not branch on the
 * active provider. See docs/provider-contracts.md.
 */
import type {
  AiPrompt,
  Backlink,
  Competitor,
  ContentItem,
  CrawlRun,
  DomainId,
  Ga4ChannelRow,
  Ga4LandingPage,
  Ga4Overview,
  GscMover,
  GscRow,
  GscTotals,
  HealthBreakdown,
  Keyword,
  KeywordList,
  PositionBucket,
  Provenance,
  RankSnapshot,
  ReferringDomain,
  ShareOfMarket,
  StrikingDistanceRow,
  TechnicalIssue,
} from "@/lib/types";

export interface Envelope<T> {
  data: T;
  provenance: Provenance;
}

export interface KeywordResearchProvider {
  keywords(domainId: DomainId): Promise<Envelope<Keyword[]>>;
  keywordLists(domainId: DomainId): Promise<Envelope<KeywordList[]>>;
}

export interface RankTrackingProvider {
  rankSnapshots(domainId: DomainId): Promise<Envelope<RankSnapshot[]>>;
  positionBuckets(domainId: DomainId): Promise<Envelope<PositionBucket[]>>;
  visibility(domainId: DomainId): Promise<Envelope<{ date: string; value: number }[]>>;
}

export interface CompetitorIntelligenceProvider {
  competitors(domainId: DomainId): Promise<Envelope<Competitor[]>>;
}

export interface TechnicalCrawlProvider {
  issues(domainId: DomainId): Promise<Envelope<TechnicalIssue[]>>;
  health(domainId: DomainId): Promise<Envelope<HealthBreakdown[]>>;
  crawlRuns(domainId: DomainId): Promise<Envelope<CrawlRun[]>>;
}

export interface BacklinkIntelligenceProvider {
  backlinks(domainId: DomainId): Promise<Envelope<Backlink[]>>;
  referringDomains(domainId: DomainId): Promise<Envelope<ReferringDomain[]>>;
}

export interface AiVisibilityProvider {
  prompts(domainId: DomainId): Promise<Envelope<AiPrompt[]>>;
}

export interface ContentIntelligenceProvider {
  content(domainId: DomainId): Promise<Envelope<ContentItem[]>>;
}

/** First-party search performance — Google Search Console-backed in production. */
export interface SearchPerformanceProvider {
  gscTotals(domainId: DomainId, days?: number): Promise<Envelope<GscTotals>>;
  gscBreakdown(
    domainId: DomainId,
    dimension: "query" | "page" | "country" | "device",
    days?: number,
    rowLimit?: number,
  ): Promise<Envelope<GscRow[]>>;
  gscStrikingDistance(domainId: DomainId, days?: number): Promise<Envelope<StrikingDistanceRow[]>>;
  gscMovers(domainId: DomainId, days?: number): Promise<Envelope<{ gains: GscMover[]; losses: GscMover[] }>>;
  shareOfMarket(domainId: DomainId, days?: number): Promise<Envelope<ShareOfMarket | null>>;
}

/** Analytics & conversions — GA4-backed in production. */
export interface AnalyticsProvider {
  ga4OrganicOverview(domainId: DomainId, days?: number): Promise<Envelope<Ga4Overview>>;
  ga4LandingPages(domainId: DomainId, days?: number): Promise<Envelope<Ga4LandingPage[]>>;
  ga4Channels(domainId: DomainId, days?: number): Promise<Envelope<Ga4ChannelRow[]>>;
}

/** Combined first-party provider (GSC + GA4). */
export interface GoogleProvider extends SearchPerformanceProvider, AnalyticsProvider {
  readonly name: string;
  readonly live: boolean;
}

export interface SeoProvider
  extends KeywordResearchProvider,
    RankTrackingProvider,
    CompetitorIntelligenceProvider,
    TechnicalCrawlProvider,
    BacklinkIntelligenceProvider,
    AiVisibilityProvider,
    ContentIntelligenceProvider {
  readonly name: string;
  readonly live: boolean;
}
