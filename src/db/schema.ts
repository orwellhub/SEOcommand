import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  date,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

/**
 * Orwell SEO Command Centre — production data model (Drizzle / PostgreSQL).
 *
 * Provider syncs write canonical snapshots here; workflow and reporting APIs
 * persist operator decisions alongside the analytical data.
 *
 * Run `npm run db:generate` to emit migrations and `npm run db:migrate` to apply.
 */

/* ------------------------------- Enums ---------------------------------- */

export const roleEnum = pgEnum("role", ["admin", "manager", "seo_analyst", "viewer"]);
export const deviceEnum = pgEnum("device", ["desktop", "mobile"]);
export const providerEnum = pgEnum("provider_source", [
  "demo",
  "dataforseo",
  "google-search-console",
  "google-analytics",
  "orwell-crawler",
]);
export const severityEnum = pgEnum("severity", ["critical", "high", "medium", "low"]);
export const issueStatusEnum = pgEnum("issue_status", [
  "open",
  "in_progress",
  "resolved",
  "ignored",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "approved",
  "in_progress",
  "review",
  "done",
]);
export const approvalEnum = pgEnum("approval_status", [
  "draft",
  "pending",
  "approved",
  "rejected",
]);
export const dataModeEnum = pgEnum("data_mode", ["demo", "cached", "live"]);

/* --------------------- Scalable portfolio platform --------------------- */

/**
 * Runtime portfolio registry. This is deliberately independent of the legacy
 * `domains` seed table: deployments can add hundreds of sites without editing
 * source code or requiring the original organisation bootstrap.
 */
export const siteProfiles = pgTable(
  "site_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    accent: text("accent").notNull().default("#335CFF"),
    industry: text("industry").notNull().default(""),
    primaryMarket: text("primary_market").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    devices: jsonb("devices").$type<("desktop" | "mobile")[]>().notNull().default(["desktop"]),
    gscProperty: text("gsc_property"),
    ga4Property: text("ga4_property"),
    lifecycleStatus: text("lifecycle_status").notNull().default("draft"),
    spendApproval: approvalEnum("spend_approval").notNull().default("pending"),
    forecastMonthlyUsd: real("forecast_monthly_usd").notNull().default(0),
    approvedMonthlyUsd: real("approved_monthly_usd"),
    budgetLimits: jsonb("budget_limits").$type<Record<string, number | null>>().notNull().default({}),
    forecastDetails: jsonb("forecast_details").$type<Record<string, unknown>>().notNull().default({}),
    onboardingProgress: jsonb("onboarding_progress").$type<Record<string, unknown>>().notNull().default({}),
    monitoringSchedule: jsonb("monitoring_schedule").$type<Record<string, unknown>>().notNull().default({}),
    siteSettings: jsonb("site_settings").$type<Record<string, unknown>>().notNull().default({}),
    crawlMaxPages: integer("crawl_max_pages").notNull().default(10000),
    backlinkLimit: integer("backlink_limit").notNull().default(10000),
    createdBy: text("created_by"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("uniq_site_profile_slug").on(t.slug),
    uniqHost: uniqueIndex("uniq_site_profile_host").on(t.host),
    statusIdx: index("site_profile_status_idx").on(t.lifecycleStatus, t.updatedAt),
  }),
);

/** Nested portfolio folders. Membership is many-to-many so operational views
 * can overlap (for example “Finance → UAE” and “Launches”). */
export const portfolioGroups = pgTable(
  "portfolio_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#7137F5"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("uniq_portfolio_group_slug").on(t.slug),
    parentOrderIdx: index("portfolio_group_parent_order_idx").on(t.parentId, t.sortOrder),
  }),
);

export const siteGroupMemberships = pgTable(
  "site_group_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id").references(() => portfolioGroups.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqMembership: uniqueIndex("uniq_site_group_membership").on(t.groupId, t.siteSlug),
    siteIdx: index("site_group_membership_site_idx").on(t.siteSlug),
  }),
);

/** Connection metadata only. Credentials remain in environment/secret stores. */
export const siteConnections = pgTable(
  "site_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    kind: text("kind").notNull(), // github | hostinger_git | webhook
    status: text("status").notNull().default("pending"),
    displayName: text("display_name").notNull(),
    remoteUrl: text("remote_url"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secretRef: text("secret_ref"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSiteKind: uniqueIndex("uniq_site_connection_kind").on(t.siteSlug, t.kind),
    siteIdx: index("site_connection_site_idx").on(t.siteSlug),
  }),
);

/** Human-readable, append-only record of portfolio and site administration. */
export const accessAuditEvents = pgTable(
  "access_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    area: text("area").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    siteIdx: index("access_audit_site_idx").on(t.siteSlug, t.createdAt),
    actorIdx: index("access_audit_actor_idx").on(t.actorEmail, t.createdAt),
  }),
);

/** Durable work queue for onboarding and sync fan-out across 300+ sites. */
export const platformJobs = pgTable(
  "platform_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    progress: jsonb("progress").$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    queueIdx: index("platform_job_queue_idx").on(t.status, t.runAfter),
    siteIdx: index("platform_job_site_idx").on(t.siteSlug, t.createdAt),
  }),
);

export const rankTrackingKeywords = pgTable(
  "rank_tracking_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    device: deviceEnum("device").notNull().default("desktop"),
    targetUrl: text("target_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqTrackedKeyword: uniqueIndex("uniq_rank_tracking_keyword").on(
      t.siteSlug,
      t.keyword,
      t.locationCode,
      t.device,
    ),
    activeIdx: index("rank_tracking_active_idx").on(t.siteSlug, t.active),
  }),
);

export const dailyRankHistory = pgTable(
  "daily_rank_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedKeywordId: uuid("tracked_keyword_id").references(() => rankTrackingKeywords.id).notNull(),
    siteSlug: text("site_slug").notNull(),
    capturedOn: date("captured_on").notNull(),
    position: integer("position"),
    previousPosition: integer("previous_position"),
    url: text("url"),
    serpFeatures: jsonb("serp_features").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqDailyRank: uniqueIndex("uniq_daily_rank_history").on(t.trackedKeywordId, t.capturedOn),
    siteDateIdx: index("daily_rank_site_date_idx").on(t.siteSlug, t.capturedOn),
  }),
);

export const detailedCrawlRuns = pgTable(
  "detailed_crawl_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    providerTaskId: text("provider_task_id"),
    status: text("status").notNull().default("queued"),
    maxPages: integer("max_pages").notNull(),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    healthScore: integer("health_score"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    siteDateIdx: index("detailed_crawl_site_idx").on(t.siteSlug, t.startedAt),
  }),
);

export const detailedCrawlPages = pgTable(
  "detailed_crawl_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").references(() => detailedCrawlRuns.id).notNull(),
    siteSlug: text("site_slug").notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    title: text("title"),
    description: text("description"),
    canonical: text("canonical"),
    wordCount: integer("word_count"),
    contentType: text("content_type"),
    depth: integer("depth"),
    loadTimeMs: integer("load_time_ms"),
    checks: jsonb("checks").$type<Record<string, boolean | number | string>>().notNull().default({}),
    links: jsonb("links").$type<Record<string, number>>().notNull().default({}),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqRunUrl: uniqueIndex("uniq_detailed_crawl_page").on(t.runId, t.url),
    siteStatusIdx: index("crawl_page_site_status_idx").on(t.siteSlug, t.statusCode),
  }),
);

/** Browser-rendered complement to the DataForSEO inventory crawl. The hybrid
 * crawler keeps rendered evidence and crawl-to-crawl changes without storing
 * heavyweight HTML in Postgres. */
export const browserCrawlRuns = pgTable(
  "browser_crawl_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    status: text("status").notNull().default("queued"),
    maxPages: integer("max_pages").notNull().default(500),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    previousRunId: uuid("previous_run_id"),
    issueCounts: jsonb("issue_counts").$type<Record<string, number>>().notNull().default({}),
    diffSummary: jsonb("diff_summary").$type<Record<string, number>>().notNull().default({}),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    lastError: text("last_error"),
  },
  (t) => ({
    siteDateIdx: index("browser_crawl_site_date_idx").on(t.siteSlug, t.startedAt),
  }),
);

export const browserCrawlPages = pgTable(
  "browser_crawl_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").references(() => browserCrawlRuns.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    url: text("url").notNull(),
    finalUrl: text("final_url"),
    statusCode: integer("status_code"),
    depth: integer("depth").notNull().default(0),
    rawTitle: text("raw_title"),
    renderedTitle: text("rendered_title"),
    description: text("description"),
    canonical: text("canonical"),
    h1Count: integer("h1_count").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    rawHash: text("raw_hash"),
    renderedHash: text("rendered_hash"),
    jsDependent: boolean("js_dependent").notNull().default(false),
    indexable: boolean("indexable").notNull().default(true),
    schemaTypes: jsonb("schema_types").$type<string[]>().notNull().default([]),
    hreflang: jsonb("hreflang").$type<Record<string, string>>().notNull().default({}),
    internalLinks: integer("internal_links").notNull().default(0),
    externalLinks: integer("external_links").notNull().default(0),
    loadTimeMs: integer("load_time_ms"),
    issues: jsonb("issues").$type<string[]>().notNull().default([]),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqRunUrl: uniqueIndex("uniq_browser_crawl_page").on(t.runId, t.url),
    siteStatusIdx: index("browser_crawl_page_site_status_idx").on(t.siteSlug, t.statusCode),
  }),
);

export const browserCrawlEdges = pgTable(
  "browser_crawl_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").references(() => browserCrawlRuns.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    anchor: text("anchor"),
    nofollow: boolean("nofollow").notNull().default(false),
  },
  (t) => ({
    runTargetIdx: index("browser_crawl_edge_target_idx").on(t.runId, t.targetUrl),
  }),
);

/** Independent availability evidence. Alerts are derived from state changes,
 * not from fabricated dashboard status. */
export const reliabilityChecks = pgTable(
  "reliability_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
    available: boolean("available").notNull().default(false),
    statusCode: integer("status_code"),
    responseTimeMs: integer("response_time_ms"),
    tlsValid: boolean("tls_valid"),
    tlsExpiresAt: timestamp("tls_expires_at"),
    domainExpiresAt: timestamp("domain_expires_at"),
    robotsStatus: integer("robots_status"),
    robotsHash: text("robots_hash"),
    sitemapStatus: integer("sitemap_status"),
    sitemapHash: text("sitemap_hash"),
    homepageHash: text("homepage_hash"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    siteDateIdx: index("reliability_check_site_date_idx").on(t.siteSlug, t.checkedAt),
  }),
);

export const competitorResearchRuns = pgTable(
  "competitor_research_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    targetHost: text("target_host").notNull(),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    overview: jsonb("overview").$type<Record<string, unknown>>().notNull().default({}),
    keywords: jsonb("keywords").$type<Record<string, unknown>[]>().notNull().default([]),
    pages: jsonb("pages").$type<Record<string, unknown>[]>().notNull().default([]),
    backlinks: jsonb("backlinks").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    siteTargetIdx: index("competitor_research_site_target_idx").on(t.siteSlug, t.targetHost, t.capturedAt),
  }),
);

export const keywordStrategySnapshots = pgTable(
  "keyword_strategy_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    capturedOn: date("captured_on").notNull(),
    clusters: jsonb("clusters").$type<Record<string, unknown>[]>().notNull().default([]),
    pageMap: jsonb("page_map").$type<Record<string, unknown>[]>().notNull().default([]),
    cannibalisation: jsonb("cannibalisation").$type<Record<string, unknown>[]>().notNull().default([]),
    summary: jsonb("summary").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSiteDay: uniqueIndex("uniq_keyword_strategy_site_day").on(t.siteSlug, t.capturedOn),
  }),
);

export const localSeoLocations = pgTable(
  "local_seo_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    name: text("name").notNull(),
    businessKeyword: text("business_keyword").notNull(),
    address: text("address"),
    placeId: text("place_id"),
    cid: text("cid"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    gridRadiusKm: real("grid_radius_km").notNull().default(5),
    gridSize: integer("grid_size").notNull().default(3),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    estimatedMonthlyUsd: real("estimated_monthly_usd").notNull().default(0),
    approval: approvalEnum("approval").notNull().default("pending"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    siteIdx: index("local_seo_location_site_idx").on(t.siteSlug, t.active),
  }),
);

export const localSeoSnapshots = pgTable(
  "local_seo_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationId: uuid("location_id").references(() => localSeoLocations.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    capturedOn: date("captured_on").notNull(),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    profileCompleteness: integer("profile_completeness"),
    matched: boolean("matched").notNull().default(false),
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    uniqLocationDay: uniqueIndex("uniq_local_seo_location_day").on(t.locationId, t.capturedOn),
  }),
);

export const localRankGridPoints = pgTable(
  "local_rank_grid_points",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationId: uuid("location_id").references(() => localSeoLocations.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    keyword: text("keyword").notNull(),
    capturedOn: date("captured_on").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    position: integer("position"),
    resultName: text("result_name"),
    matched: boolean("matched").notNull().default(false),
  },
  (t) => ({
    uniqGridPoint: uniqueIndex("uniq_local_rank_grid_point").on(t.locationId, t.keyword, t.capturedOn, t.latitude, t.longitude),
  }),
);

export const linkProspects = pgTable(
  "link_prospects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceUrl: text("source_url"),
    authority: integer("authority"),
    relevance: integer("relevance").notNull().default(0),
    reason: text("reason").notNull(),
    competitorHosts: jsonb("competitor_hosts").$type<string[]>().notNull().default([]),
    contacts: jsonb("contacts").$type<Record<string, unknown>[]>().notNull().default([]),
    status: text("status").notNull().default("discovered"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSiteDomain: uniqueIndex("uniq_link_prospect_site_domain").on(t.siteSlug, t.sourceDomain),
    siteStatusIdx: index("link_prospect_site_status_idx").on(t.siteSlug, t.status),
  }),
);

export const outreachDrafts = pgTable(
  "outreach_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prospectId: uuid("prospect_id").references(() => linkProspects.id, { onDelete: "cascade" }).notNull(),
    siteSlug: text("site_slug").notNull(),
    recipientEmail: text("recipient_email"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("draft"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    sentAt: timestamp("sent_at"),
    delivery: jsonb("delivery").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    prospectIdx: index("outreach_draft_prospect_idx").on(t.prospectId, t.createdAt),
    approvalIdx: index("outreach_draft_approval_idx").on(t.siteSlug, t.status),
  }),
);

export const keywordGapHistory = pgTable(
  "keyword_gap_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    competitorHost: text("competitor_host").notNull(),
    keyword: text("keyword").notNull(),
    capturedOn: date("captured_on").notNull(),
    sitePosition: integer("site_position"),
    competitorPosition: integer("competitor_position"),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    intent: text("intent"),
    trafficPotential: real("traffic_potential"),
  },
  (t) => ({
    uniqGap: uniqueIndex("uniq_keyword_gap_history").on(
      t.siteSlug,
      t.competitorHost,
      t.keyword,
      t.capturedOn,
    ),
    siteDateIdx: index("keyword_gap_site_date_idx").on(t.siteSlug, t.capturedOn),
  }),
);

export const backlinkProfileHistory = pgTable(
  "backlink_profile_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    capturedOn: date("captured_on").notNull(),
    backlinks: integer("backlinks").notNull().default(0),
    referringDomains: integer("referring_domains").notNull().default(0),
    newBacklinks: integer("new_backlinks").notNull().default(0),
    lostBacklinks: integer("lost_backlinks").notNull().default(0),
    newReferringDomains: integer("new_referring_domains").notNull().default(0),
    lostReferringDomains: integer("lost_referring_domains").notNull().default(0),
    rank: integer("rank"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    uniqHistoryDay: uniqueIndex("uniq_backlink_profile_day").on(t.siteSlug, t.capturedOn),
  }),
);

export const backlinkLedgerEntries = pgTable(
  "backlink_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    fingerprint: text("fingerprint").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    anchor: text("anchor"),
    authority: integer("authority"),
    follow: boolean("follow").notNull().default(true),
    toxicity: integer("toxicity").notNull().default(0),
    status: text("status").notNull().default("active"),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
    lastObservedAt: timestamp("last_observed_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqLedgerLink: uniqueIndex("uniq_backlink_ledger_entry").on(t.siteSlug, t.fingerprint),
    siteStatusIdx: index("backlink_ledger_site_status_idx").on(t.siteSlug, t.status),
  }),
);

export const aiTrackingPrompts = pgTable(
  "ai_tracking_prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    prompt: text("prompt").notNull(),
    topic: text("topic").notNull(),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([
      "chatgpt",
      "claude",
      "gemini",
      "perplexity",
    ]),
    cadence: text("cadence").notNull().default("weekly"),
    priority: integer("priority").notNull().default(50),
    sampleCount: integer("sample_count").notNull().default(1),
    locationCode: integer("location_code"),
    languageCode: text("language_code").notNull().default("en"),
    source: text("source").notNull().default("manual"),
    active: boolean("active").notNull().default(true),
    nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqAiPrompt: uniqueIndex("uniq_ai_tracking_prompt").on(t.siteSlug, t.prompt),
    dueIdx: index("ai_tracking_prompt_due_idx").on(t.active, t.nextRunAt),
  }),
);

/** Immutable AI measurements. The latest dashboard is derived from these rows,
 * while trends and alerts retain the complete evidence trail. */
export const aiResponseObservations = pgTable(
  "ai_response_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promptId: uuid("prompt_id").references(() => aiTrackingPrompts.id, { onDelete: "cascade" }),
    siteSlug: text("site_slug").notNull(),
    prompt: text("prompt").notNull(),
    topic: text("topic").notNull(),
    platform: text("platform").notNull(),
    modelName: text("model_name").notNull(),
    sampleIndex: integer("sample_index").notNull().default(0),
    capturedOn: date("captured_on").notNull(),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
    mentioned: boolean("mentioned").notNull().default(false),
    cited: boolean("cited").notNull().default(false),
    recommendationPosition: integer("recommendation_position"),
    sentiment: text("sentiment").notNull().default("neutral"),
    confidence: real("confidence").notNull().default(0),
    responseText: text("response_text").notNull().default(""),
    responseHash: text("response_hash").notNull(),
    fanOutQueries: jsonb("fan_out_queries").$type<string[]>().notNull().default([]),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    costUsd: real("cost_usd").notNull().default(0),
  },
  (t) => ({
    uniqSample: uniqueIndex("uniq_ai_response_sample").on(
      t.siteSlug,
      t.prompt,
      t.platform,
      t.capturedOn,
      t.sampleIndex,
    ),
    siteDateIdx: index("ai_response_site_date_idx").on(t.siteSlug, t.capturedOn),
    promptDateIdx: index("ai_response_prompt_date_idx").on(t.promptId, t.capturedOn),
  }),
);

export const aiResponseCitations = pgTable(
  "ai_response_citations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").references(() => aiResponseObservations.id, { onDelete: "cascade" }).notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    position: integer("position").notNull(),
    owned: boolean("owned").notNull().default(false),
  },
  (t) => ({
    uniqCitation: uniqueIndex("uniq_ai_response_citation").on(t.observationId, t.url),
    domainIdx: index("ai_response_citation_domain_idx").on(t.domain),
  }),
);

export const aiResponseEntities = pgTable(
  "ai_response_entities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").references(() => aiResponseObservations.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    host: text("host"),
    entityType: text("entity_type").notNull().default("brand"),
    position: integer("position"),
    sentiment: text("sentiment").notNull().default("neutral"),
    owned: boolean("owned").notNull().default(false),
  },
  (t) => ({
    uniqEntity: uniqueIndex("uniq_ai_response_entity").on(t.observationId, t.name),
    entityIdx: index("ai_response_entity_name_idx").on(t.name, t.owned),
  }),
);

export const aiPromptOpportunities = pgTable(
  "ai_prompt_opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    prompt: text("prompt").notNull(),
    topic: text("topic").notNull(),
    source: text("source").notNull(),
    intent: text("intent"),
    aiSearchVolume: integer("ai_search_volume"),
    priorityScore: integer("priority_score").notNull().default(0),
    status: text("status").notNull().default("suggested"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqOpportunity: uniqueIndex("uniq_ai_prompt_opportunity").on(t.siteSlug, t.prompt),
    priorityIdx: index("ai_prompt_opportunity_priority_idx").on(t.siteSlug, t.status, t.priorityScore),
  }),
);

export const aiCrawlerAudits = pgTable(
  "ai_crawler_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    capturedOn: date("captured_on").notNull(),
    bot: text("bot").notNull(),
    category: text("category").notNull(),
    access: text("access").notNull(),
    evidence: text("evidence"),
    robotsUrl: text("robots_url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqAudit: uniqueIndex("uniq_ai_crawler_audit").on(t.siteSlug, t.capturedOn, t.bot),
    siteDateIdx: index("ai_crawler_audit_site_date_idx").on(t.siteSlug, t.capturedOn),
  }),
);

export const notificationRules = pgTable(
  "notification_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug"), // null = portfolio-wide
    eventTypes: jsonb("event_types").$type<string[]>().notNull().default([]),
    channels: jsonb("channels").$type<string[]>().notNull().default(["in_app"]),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    rankDropThreshold: integer("rank_drop_threshold").notNull().default(5),
    trafficDropPct: integer("traffic_drop_pct").notNull().default(20),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    siteIdx: index("notification_rule_site_idx").on(t.siteSlug, t.enabled),
  }),
);

export const portfolioNotifications = pgTable(
  "portfolio_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug"),
    eventType: text("event_type").notNull(),
    severity: severityEnum("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    actionUrl: text("action_url"),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull().default("open"),
    readAt: timestamp("read_at"),
    snoozedUntil: timestamp("snoozed_until"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqFingerprint: uniqueIndex("uniq_portfolio_notification").on(t.fingerprint),
    inboxIdx: index("portfolio_notification_inbox_idx").on(t.status, t.readAt, t.createdAt),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notificationId: uuid("notification_id").references(() => portfolioNotifications.id).notNull(),
    channel: text("channel").notNull(),
    recipient: text("recipient"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    deliveredAt: timestamp("delivered_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    queueIdx: index("notification_delivery_queue_idx").on(t.status, t.createdAt),
  }),
);

/** Safe change proposals: connectors may draft review work, never auto-publish. */
export const siteChangeProposals = pgTable(
  "site_change_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteSlug: text("site_slug").notNull(),
    connectionId: uuid("connection_id").references(() => siteConnections.id).notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("draft"),
    reviewUrl: text("review_url"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    siteIdx: index("site_change_proposal_idx").on(t.siteSlug, t.createdAt),
  }),
);

/* ---------------------------- Org & identity ---------------------------- */

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  monthlyBudgetUsd: integer("monthly_budget_usd").notNull().default(200),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organisations.id).notNull(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    role: roleEnum("role").notNull().default("viewer"),
  },
  (t) => ({
    uniqMember: uniqueIndex("uniq_member").on(t.orgId, t.userId),
  }),
);

/* -------------------------------- Domains ------------------------------- */

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organisations.id).notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    accent: text("accent").notNull(),
    industry: text("industry"),
    primaryMarket: text("primary_market"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("uniq_domain_slug").on(t.orgId, t.slug),
    hostIdx: index("domain_host_idx").on(t.host),
  }),
);

export const domainProperties = pgTable("domain_properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  gscProperty: text("gsc_property"),
  ga4Property: text("ga4_property"),
  defaultLocation: text("default_location"),
  defaultDevice: deviceEnum("default_device").default("desktop"),
});

/* --------------------------- Provider plumbing -------------------------- */

export const providerConnections = pgTable("provider_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").references(() => organisations.id).notNull(),
  provider: providerEnum("provider").notNull(),
  connected: boolean("connected").notNull().default(false),
  status: text("status").notNull().default("disconnected"),
  lastSync: timestamp("last_sync"),
  // Secret material is NEVER stored here — credentials live in env/secret store.
  configRef: text("config_ref"),
});

export const providerSyncRuns = pgTable(
  "provider_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id").references(() => providerConnections.id).notNull(),
    domainId: uuid("domain_id").references(() => domains.id),
    module: text("module").notNull(),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    status: text("status").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    error: text("error"),
    // Idempotency key prevents duplicate runs for the same window.
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => ({
    uniqRun: uniqueIndex("uniq_sync_idempotency").on(t.idempotencyKey),
    domainModuleIdx: index("sync_domain_module_idx").on(t.domainId, t.module),
  }),
);

export const apiUsageLedger = pgTable(
  "api_usage_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").references(() => organisations.id).notNull(),
    domainId: uuid("domain_id").references(() => domains.id),
    day: date("day").notNull(),
    provider: providerEnum("provider").notNull(),
    module: text("module").notNull(),
    requests: integer("requests").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
  },
  (t) => ({
    dayIdx: index("usage_day_idx").on(t.orgId, t.day),
  }),
);

/* -------------------------------- Keywords ------------------------------ */

export const keywordLists = pgTable("keyword_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const keywords = pgTable(
  "keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainId: uuid("domain_id").references(() => domains.id).notNull(),
    keyword: text("keyword").notNull(),
    location: text("location").notNull(),
    intent: text("intent"),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    cpc: real("cpc"),
    competition: real("competition"),
  },
  (t) => ({
    uniqKw: uniqueIndex("uniq_keyword").on(t.domainId, t.keyword, t.location),
  }),
);

export const trackedKeywords = pgTable("tracked_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  keywordId: uuid("keyword_id").references(() => keywords.id).notNull(),
  listId: uuid("list_id").references(() => keywordLists.id),
  device: deviceEnum("device").notNull().default("desktop"),
  targetUrl: text("target_url"),
  tags: jsonb("tags").$type<string[]>().default([]),
});

export const rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keywordId: uuid("keyword_id").references(() => keywords.id).notNull(),
    capturedOn: date("captured_on").notNull(),
    position: integer("position"),
    url: text("url"),
    device: deviceEnum("device").notNull(),
    mode: dataModeEnum("mode").notNull().default("live"),
    serpFeatures: jsonb("serp_features").$type<string[]>().default([]),
  },
  (t) => ({
    // Immutable snapshots — one per keyword/device/day.
    uniqSnap: uniqueIndex("uniq_ranking_snapshot").on(t.keywordId, t.device, t.capturedOn),
    dateIdx: index("ranking_date_idx").on(t.capturedOn),
  }),
);

/* ------------------------------- Competitors ---------------------------- */

export const competitors = pgTable("competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  host: text("host").notNull(),
  commonKeywords: integer("common_keywords"),
  authority: integer("authority"),
  estTraffic: integer("est_traffic"),
});

export const domainMetricSnapshots = pgTable(
  "domain_metric_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainId: uuid("domain_id").references(() => domains.id).notNull(),
    capturedOn: date("captured_on").notNull(),
    visibility: real("visibility"),
    organicClicks: integer("organic_clicks"),
    impressions: integer("impressions"),
    conversions: integer("conversions"),
    healthScore: integer("health_score"),
  },
  (t) => ({
    uniqMetric: uniqueIndex("uniq_domain_metric").on(t.domainId, t.capturedOn),
  }),
);

/* --------------------------- First-party data --------------------------- */

export const searchConsoleSnapshots = pgTable("search_console_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  capturedOn: date("captured_on").notNull(),
  dimension: text("dimension").notNull(), // query | page | device | country
  dimensionValue: text("dimension_value").notNull(),
  clicks: integer("clicks"),
  impressions: integer("impressions"),
  ctr: real("ctr"),
  position: real("position"),
});

export const ga4Snapshots = pgTable("ga4_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  capturedOn: date("captured_on").notNull(),
  landingPage: text("landing_page"),
  sessions: integer("sessions"),
  engagedSessions: integer("engaged_sessions"),
  conversions: integer("conversions"),
  revenue: real("revenue"),
});

/* ------------------------------ Site audit ------------------------------ */

export const crawlProjects = pgTable("crawl_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  frequency: text("frequency").notNull().default("weekly"),
  maxPages: integer("max_pages").notNull().default(5000),
  respectRobots: boolean("respect_robots").notNull().default(true),
});

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => crawlProjects.id).notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  pagesCrawled: integer("pages_crawled"),
  healthScore: integer("health_score"),
  status: text("status").notNull(),
});

export const crawledPages = pgTable("crawled_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").references(() => crawlRuns.id).notNull(),
  url: text("url").notNull(),
  statusCode: integer("status_code"),
  title: text("title"),
  wordCount: integer("word_count"),
  lcpMs: integer("lcp_ms"),
});

export const technicalIssues = pgTable(
  "technical_issues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainId: uuid("domain_id").references(() => domains.id).notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    severity: severityEnum("severity").notNull(),
    affectedPages: integer("affected_pages").notNull().default(0),
    status: issueStatusEnum("status").notNull().default("open"),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
    taskId: uuid("task_id"),
  },
  (t) => ({
    domainSeverityIdx: index("issue_domain_severity_idx").on(t.domainId, t.severity),
  }),
);

/* ------------------------------- Backlinks ------------------------------ */

export const referringDomains = pgTable("referring_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  host: text("host").notNull(),
  authority: integer("authority"),
  topicalRelevance: integer("topical_relevance"),
  firstSeen: date("first_seen"),
});

export const backlinks = pgTable(
  "backlinks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainId: uuid("domain_id").references(() => domains.id).notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourceUrl: text("source_url").notNull(),
    targetUrl: text("target_url").notNull(),
    anchor: text("anchor"),
    authority: integer("authority"),
    follow: boolean("follow").notNull().default(true),
    toxicity: integer("toxicity").notNull().default(0),
    status: text("status").notNull().default("active"),
    firstSeen: date("first_seen"),
    lastSeen: date("last_seen"),
  },
  (t) => ({
    domainIdx: index("backlink_domain_idx").on(t.domainId),
  }),
);

/* ----------------------------- AI visibility ---------------------------- */

export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  prompt: text("prompt").notNull(),
  topic: text("topic"),
  platforms: jsonb("platforms").$type<string[]>().default([]),
});

export const aiResponseChecks = pgTable("ai_response_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  promptId: uuid("prompt_id").references(() => aiPrompts.id).notNull(),
  checkedAt: timestamp("checked_at").notNull(),
  platform: text("platform").notNull(),
  mentioned: boolean("mentioned").notNull().default(false),
  cited: boolean("cited").notNull().default(false),
  position: integer("position"),
  sentiment: text("sentiment"),
  rawResponse: text("raw_response"),
});

export const brandMentions = pgTable("brand_mentions", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  sourceDomain: text("source_domain"),
  platform: text("platform"),
  citedUrl: text("cited_url"),
  observedAt: timestamp("observed_at"),
});

/* ------------------------- Recommendations & tasks ---------------------- */

export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  title: text("title").notNull(),
  module: text("module").notNull(),
  priorityScore: integer("priority_score").notNull(),
  confidence: text("confidence"),
  effort: text("effort"),
  approval: approvalEnum("approval").notNull().default("draft"),
  relatedMetric: text("related_metric"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  domainId: uuid("domain_id").references(() => domains.id).notNull(),
  recommendationId: uuid("recommendation_id").references(() => recommendations.id),
  title: text("title").notNull(),
  status: taskStatusEnum("status").notNull().default("backlog"),
  approval: approvalEnum("approval").notNull().default("pending"),
  ownerId: uuid("owner_id").references(() => users.id),
  dueDate: date("due_date"),
});

export const taskComments = pgTable("task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  userId: uuid("user_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskStatusHistory = pgTable("task_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  fromStatus: taskStatusEnum("from_status"),
  toStatus: taskStatusEnum("to_status").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

/**
 * Runtime workflow state keyed by the registry's stable domain slug. This table
 * is deliberately FK-free so recommendation decisions work with the live
 * snapshot pipeline without requiring the legacy relational seed bootstrap.
 */
export const workflowItems = pgTable(
  "workflow_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainSlug: text("domain_slug").notNull(),
    recommendationKey: text("recommendation_key").notNull(),
    decision: text("decision").notNull(), // approved | dismissed
    title: text("title").notNull(),
    module: text("module").notNull(),
    effort: text("effort").notNull(),
    priorityScore: integer("priority_score").notNull(),
    status: text("status"), // approved | in_progress | done (null when dismissed)
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqDecision: uniqueIndex("uniq_workflow_recommendation").on(
      t.domainSlug,
      t.recommendationKey,
    ),
    domainIdx: index("workflow_domain_idx").on(t.domainSlug, t.updatedAt),
  }),
);

/* -------------------------------- Reports ------------------------------- */

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").references(() => organisations.id).notNull(),
  domainId: uuid("domain_id").references(() => domains.id),
  templateId: text("template_id").notNull(),
  name: text("name").notNull(),
  generatedAt: timestamp("generated_at"),
  format: text("format").notNull().default("PDF"),
});

export const reportSchedules = pgTable("report_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").references(() => organisations.id).notNull(),
  domainId: uuid("domain_id").references(() => domains.id),
  templateId: text("template_id").notNull(),
  cadence: text("cadence").notNull(),
  nextRun: timestamp("next_run"),
  recipients: jsonb("recipients").$type<string[]>().default([]),
});

/** Live report schedules, also registry-slug based and independent of seed rows. */
export const reportDeliverySchedules = pgTable(
  "report_delivery_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainSlug: text("domain_slug"), // null = portfolio
    templateId: text("template_id").notNull(),
    templateName: text("template_name").notNull(),
    cadence: text("cadence").notNull(),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    format: text("format").notNull().default("PDF"),
    enabled: boolean("enabled").notNull().default(true),
    nextRun: timestamp("next_run").notNull(),
    lastDelivered: timestamp("last_delivered"),
    lastError: text("last_error"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    dueIdx: index("report_delivery_due_idx").on(t.enabled, t.nextRun),
  }),
);

/* ------------------------- Keyword research scans ------------------------ */

/**
 * Saved seed keyword-research scans.
 *
 * Each row is one completed DataForSEO run, stored WITH its result rows so a
 * past search can be reopened, re-read and re-exported without calling the
 * provider again — reopening a saved scan costs nothing. Deliberately FK-free
 * (like dataset_snapshots) so it works without any relational bootstrap.
 */
export const keywordScans = pgTable(
  "keyword_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seed: text("seed").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    locationLabel: text("location_label").notNull(),
    /** Canonical KeywordResearchRow[] exactly as the UI renders it. */
    rows: jsonb("rows").$type<unknown[]>().notNull().default([]),
    rowCount: integer("row_count").notNull().default(0),
    totalVolume: integer("total_volume").notNull().default(0),
    avgDifficulty: integer("avg_difficulty"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    recentIdx: index("keyword_scans_recent_idx").on(t.createdAt),
    seedIdx: index("keyword_scans_seed_idx").on(t.seed, t.locationCode),
  }),
);

/* --------------------------- Dataset snapshots -------------------------- */

/**
 * Live read-model store. Each provider sync writes one row per
 * (domain, dataset, day) holding the CANONICAL payload (already normalised to
 * the shapes in src/lib/types) plus its provenance. Pages read the latest row
 * per dataset; history-style datasets (visibility points) read all rows.
 * Deliberately FK-free so sync works before any relational bootstrap.
 */
export const datasetSnapshots = pgTable(
  "dataset_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainSlug: text("domain_slug").notNull(),
    dataset: text("dataset").notNull(),
    capturedOn: date("captured_on").notNull(),
    payload: jsonb("payload").notNull(),
    provenance: jsonb("provenance").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqSnapshot: uniqueIndex("uniq_dataset_snapshot").on(t.domainSlug, t.dataset, t.capturedOn),
    latestIdx: index("dataset_latest_idx").on(t.domainSlug, t.dataset, t.capturedOn),
  }),
);

/* --------------------------- Provider spend ----------------------------- */

/**
 * Append-only spend ledger for the app-owned monthly budget guardrail.
 * Deliberately has NO foreign keys so the spend guard works even before the
 * rest of the schema is seeded. Month-to-date spend = SUM(cost_usd) for the
 * current `month` and provider. See src/providers/dataforseo/cost.ts.
 */
export const providerSpend = pgTable(
  "provider_spend",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(), // e.g. "dataforseo"
    month: text("month").notNull(), // "YYYY-MM" (UTC)
    endpoint: text("endpoint").notNull(),
    domainSlug: text("domain_slug"),
    costUsd: real("cost_usd").notNull().default(0),
    requests: integer("requests").notNull().default(1),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => ({
    monthIdx: index("provider_spend_month_idx").on(t.provider, t.month),
  }),
);

/* -------------------------------- Alerts -------------------------------- */

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").references(() => organisations.id).notNull(),
  domainId: uuid("domain_id").references(() => domains.id),
  severity: severityEnum("severity").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  module: text("module"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
