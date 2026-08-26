CREATE TABLE IF NOT EXISTS "browser_crawl_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor" text,
	"nofollow" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "browser_crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"status_code" integer,
	"depth" integer DEFAULT 0 NOT NULL,
	"raw_title" text,
	"rendered_title" text,
	"description" text,
	"canonical" text,
	"h1_count" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"raw_hash" text,
	"rendered_hash" text,
	"js_dependent" boolean DEFAULT false NOT NULL,
	"indexable" boolean DEFAULT true NOT NULL,
	"schema_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hreflang" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"internal_links" integer DEFAULT 0 NOT NULL,
	"external_links" integer DEFAULT 0 NOT NULL,
	"load_time_ms" integer,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "browser_crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"max_pages" integer DEFAULT 500 NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"previous_run_id" uuid,
	"issue_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diff_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competitor_research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"target_host" text NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"overview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"backlinks" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_strategy_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"captured_on" date NOT NULL,
	"clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cannibalisation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "link_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"source_domain" text NOT NULL,
	"source_url" text,
	"authority" integer,
	"relevance" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"competitor_hosts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'discovered' NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "local_rank_grid_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"keyword" text NOT NULL,
	"captured_on" date NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"position" integer,
	"result_name" text,
	"matched" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "local_seo_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"name" text NOT NULL,
	"business_keyword" text NOT NULL,
	"address" text,
	"place_id" text,
	"cid" text,
	"latitude" real,
	"longitude" real,
	"grid_radius_km" real DEFAULT 5 NOT NULL,
	"grid_size" integer DEFAULT 3 NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_monthly_usd" real DEFAULT 0 NOT NULL,
	"approval" "approval_status" DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "local_seo_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"captured_on" date NOT NULL,
	"rating" real,
	"review_count" integer,
	"profile_completeness" integer,
	"matched" boolean DEFAULT false NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"recipient_email" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"sent_at" timestamp,
	"delivery" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reliability_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"available" boolean DEFAULT false NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"tls_valid" boolean,
	"tls_expires_at" timestamp,
	"domain_expires_at" timestamp,
	"robots_status" integer,
	"robots_hash" text,
	"sitemap_status" integer,
	"sitemap_hash" text,
	"homepage_hash" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "browser_crawl_edges" ADD CONSTRAINT "browser_crawl_edges_run_id_browser_crawl_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."browser_crawl_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "browser_crawl_pages" ADD CONSTRAINT "browser_crawl_pages_run_id_browser_crawl_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."browser_crawl_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "local_rank_grid_points" ADD CONSTRAINT "local_rank_grid_points_location_id_local_seo_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."local_seo_locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "local_seo_snapshots" ADD CONSTRAINT "local_seo_snapshots_location_id_local_seo_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."local_seo_locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_prospect_id_link_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."link_prospects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_crawl_edge_target_idx" ON "browser_crawl_edges" USING btree ("run_id","target_url");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_browser_crawl_page" ON "browser_crawl_pages" USING btree ("run_id","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_crawl_page_site_status_idx" ON "browser_crawl_pages" USING btree ("site_slug","status_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_crawl_site_date_idx" ON "browser_crawl_runs" USING btree ("site_slug","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competitor_research_site_target_idx" ON "competitor_research_runs" USING btree ("site_slug","target_host","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_keyword_strategy_site_day" ON "keyword_strategy_snapshots" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_link_prospect_site_domain" ON "link_prospects" USING btree ("site_slug","source_domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "link_prospect_site_status_idx" ON "link_prospects" USING btree ("site_slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_local_rank_grid_point" ON "local_rank_grid_points" USING btree ("location_id","keyword","captured_on","latitude","longitude");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "local_seo_location_site_idx" ON "local_seo_locations" USING btree ("site_slug","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_local_seo_location_day" ON "local_seo_snapshots" USING btree ("location_id","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_draft_prospect_idx" ON "outreach_drafts" USING btree ("prospect_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_draft_approval_idx" ON "outreach_drafts" USING btree ("site_slug","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reliability_check_site_date_idx" ON "reliability_checks" USING btree ("site_slug","checked_at");
--> statement-breakpoint
UPDATE "notification_rules"
SET "event_types" = (
	SELECT jsonb_agg("event" ORDER BY "event"::text)
	FROM (
		SELECT DISTINCT "event"
		FROM jsonb_array_elements(
			"notification_rules"."event_types" ||
			'["technical_regression","site_unavailable","site_recovered","tls_risk","domain_expiry","robots_changed","sitemap_changed","new_local_review","local_rating_drop"]'::jsonb
		) AS "events"("event")
	) AS "unique_events"
)
WHERE jsonb_array_length("event_types") > 0;
