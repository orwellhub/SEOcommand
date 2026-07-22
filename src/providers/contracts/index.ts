/**
 * Provider contracts.
 *
 * Every data provider (demo, DataForSEO, Google Search Console, GA4) implements
 * these interfaces and returns CANONICAL internal models from @/lib/types —
 * never a raw vendor payload. Swapping demo → live is a factory change only;
 * no UI or business logic is rewritten. See docs/provider-contracts.md.
 */
import type {
  AiPrompt,
  Backlink,
  Competitor,
  ContentItem,
  CrawlRun,
  DomainId,
  HealthBreakdown,
  Keyword,
  KeywordList,
  PositionBucket,
  Provenance,
  RankSnapshot,
  ReferringDomain,
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

/** First-party search performance — GSC-backed in production. */
export interface SearchPerformanceProvider {
  // Reserved: query/page/device/country snapshots from Google Search Console.
  readonly source: "google-search-console" | "demo";
}

/** Analytics & conversions — GA4-backed in production. */
export interface AnalyticsProvider {
  // Reserved: organic sessions, conversions and landing-page performance.
  readonly source: "google-analytics" | "demo";
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
