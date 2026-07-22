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
 * The demo build runs entirely off deterministic seed modules in src/data so
 * the app builds and runs with no database. These tables define the shape the
 * live product persists into once providers are connected: provider sync runs
 * write immutable snapshots here, and the UI reads through the provider layer.
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
    mode: dataModeEnum("mode").notNull().default("demo"),
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
