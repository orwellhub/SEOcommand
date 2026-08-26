CREATE TABLE IF NOT EXISTS "ai_tracking_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"prompt" text NOT NULL,
	"topic" text NOT NULL,
	"platforms" jsonb DEFAULT '["chatgpt","claude","gemini","perplexity"]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backlink_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"fingerprint" text NOT NULL,
	"source_domain" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor" text,
	"authority" integer,
	"follow" boolean DEFAULT true NOT NULL,
	"toxicity" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen" date,
	"last_seen" date,
	"last_observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "backlink_profile_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"captured_on" date NOT NULL,
	"backlinks" integer DEFAULT 0 NOT NULL,
	"referring_domains" integer DEFAULT 0 NOT NULL,
	"new_backlinks" integer DEFAULT 0 NOT NULL,
	"lost_backlinks" integer DEFAULT 0 NOT NULL,
	"new_referring_domains" integer DEFAULT 0 NOT NULL,
	"lost_referring_domains" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_rank_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_keyword_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"captured_on" date NOT NULL,
	"position" integer,
	"previous_position" integer,
	"url" text,
	"serp_features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detailed_crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"title" text,
	"description" text,
	"canonical" text,
	"word_count" integer,
	"content_type" text,
	"depth" integer,
	"load_time_ms" integer,
	"checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "detailed_crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"provider_task_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"max_pages" integer NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"health_score" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_gap_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"competitor_host" text NOT NULL,
	"keyword" text NOT NULL,
	"captured_on" date NOT NULL,
	"site_position" integer,
	"competitor_position" integer,
	"volume" integer,
	"difficulty" integer,
	"intent" text,
	"traffic_potential" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recipient" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank_drop_threshold" integer DEFAULT 5 NOT NULL,
	"traffic_drop_pct" integer DEFAULT 20 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text,
	"event_type" text NOT NULL,
	"severity" "severity" NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"action_url" text,
	"fingerprint" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rank_tracking_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"device" "device" DEFAULT 'desktop' NOT NULL,
	"target_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"review_url" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"display_name" text NOT NULL,
	"remote_url" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ref" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"accent" text DEFAULT '#7137F5' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"primary_market" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"devices" jsonb DEFAULT '["desktop"]'::jsonb NOT NULL,
	"gsc_property" text,
	"ga4_property" text,
	"lifecycle_status" text DEFAULT 'draft' NOT NULL,
	"spend_approval" "approval_status" DEFAULT 'pending' NOT NULL,
	"forecast_monthly_usd" real DEFAULT 0 NOT NULL,
	"approved_monthly_usd" real,
	"forecast_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"crawl_max_pages" integer DEFAULT 10000 NOT NULL,
	"backlink_limit" integer DEFAULT 10000 NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_rank_history" ADD CONSTRAINT "daily_rank_history_tracked_keyword_id_rank_tracking_keywords_id_fk" FOREIGN KEY ("tracked_keyword_id") REFERENCES "public"."rank_tracking_keywords"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "detailed_crawl_pages" ADD CONSTRAINT "detailed_crawl_pages_run_id_detailed_crawl_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."detailed_crawl_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_portfolio_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."portfolio_notifications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_change_proposals" ADD CONSTRAINT "site_change_proposals_connection_id_site_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."site_connections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_tracking_prompt" ON "ai_tracking_prompts" USING btree ("site_slug","prompt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_backlink_ledger_entry" ON "backlink_ledger_entries" USING btree ("site_slug","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backlink_ledger_site_status_idx" ON "backlink_ledger_entries" USING btree ("site_slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_backlink_profile_day" ON "backlink_profile_history" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_daily_rank_history" ON "daily_rank_history" USING btree ("tracked_keyword_id","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_rank_site_date_idx" ON "daily_rank_history" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_detailed_crawl_page" ON "detailed_crawl_pages" USING btree ("run_id","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_page_site_status_idx" ON "detailed_crawl_pages" USING btree ("site_slug","status_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "detailed_crawl_site_idx" ON "detailed_crawl_runs" USING btree ("site_slug","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_keyword_gap_history" ON "keyword_gap_history" USING btree ("site_slug","competitor_host","keyword","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_gap_site_date_idx" ON "keyword_gap_history" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_delivery_queue_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_rule_site_idx" ON "notification_rules" USING btree ("site_slug","enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_job_queue_idx" ON "platform_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_job_site_idx" ON "platform_jobs" USING btree ("site_slug","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_portfolio_notification" ON "portfolio_notifications" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_notification_inbox_idx" ON "portfolio_notifications" USING btree ("read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_rank_tracking_keyword" ON "rank_tracking_keywords" USING btree ("site_slug","keyword","location_code","device");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rank_tracking_active_idx" ON "rank_tracking_keywords" USING btree ("site_slug","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_change_proposal_idx" ON "site_change_proposals" USING btree ("site_slug","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_site_connection_kind" ON "site_connections" USING btree ("site_slug","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_connection_site_idx" ON "site_connections" USING btree ("site_slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_site_profile_slug" ON "site_profiles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_site_profile_host" ON "site_profiles" USING btree ("host");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_profile_status_idx" ON "site_profiles" USING btree ("lifecycle_status","updated_at");