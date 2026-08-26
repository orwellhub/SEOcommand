ALTER TYPE "public"."provider_source" ADD VALUE 'orwell-crawler';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_crawler_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"captured_on" date NOT NULL,
	"bot" text NOT NULL,
	"category" text NOT NULL,
	"access" text NOT NULL,
	"evidence" text,
	"robots_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_prompt_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"prompt" text NOT NULL,
	"topic" text NOT NULL,
	"source" text NOT NULL,
	"intent" text,
	"ai_search_volume" integer,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_response_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"position" integer NOT NULL,
	"owned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_response_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"host" text,
	"entity_type" text DEFAULT 'brand' NOT NULL,
	"position" integer,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"owned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_response_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid,
	"site_slug" text NOT NULL,
	"prompt" text NOT NULL,
	"topic" text NOT NULL,
	"platform" text NOT NULL,
	"model_name" text NOT NULL,
	"sample_index" integer DEFAULT 0 NOT NULL,
	"captured_on" date NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"mentioned" boolean DEFAULT false NOT NULL,
	"cited" boolean DEFAULT false NOT NULL,
	"recommendation_position" integer,
	"sentiment" text DEFAULT 'neutral' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"response_text" text DEFAULT '' NOT NULL,
	"response_hash" text NOT NULL,
	"fan_out_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#7137F5' NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "cadence" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "priority" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "sample_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "location_code" integer;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "language_code" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "next_run_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "last_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_tracking_prompts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_response_citations" ADD CONSTRAINT "ai_response_citations_observation_id_ai_response_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_response_observations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_response_entities" ADD CONSTRAINT "ai_response_entities_observation_id_ai_response_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_response_observations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_response_observations" ADD CONSTRAINT "ai_response_observations_prompt_id_ai_tracking_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_tracking_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_group_memberships" ADD CONSTRAINT "site_group_memberships_group_id_portfolio_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."portfolio_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_crawler_audit" ON "ai_crawler_audits" USING btree ("site_slug","captured_on","bot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_crawler_audit_site_date_idx" ON "ai_crawler_audits" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_prompt_opportunity" ON "ai_prompt_opportunities" USING btree ("site_slug","prompt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_prompt_opportunity_priority_idx" ON "ai_prompt_opportunities" USING btree ("site_slug","status","priority_score");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_response_citation" ON "ai_response_citations" USING btree ("observation_id","url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_response_citation_domain_idx" ON "ai_response_citations" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_response_entity" ON "ai_response_entities" USING btree ("observation_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_response_entity_name_idx" ON "ai_response_entities" USING btree ("name","owned");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_response_sample" ON "ai_response_observations" USING btree ("site_slug","prompt","platform","captured_on","sample_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_response_site_date_idx" ON "ai_response_observations" USING btree ("site_slug","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_response_prompt_date_idx" ON "ai_response_observations" USING btree ("prompt_id","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_portfolio_group_slug" ON "portfolio_groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_group_parent_order_idx" ON "portfolio_groups" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_site_group_membership" ON "site_group_memberships" USING btree ("group_id","site_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_group_membership_site_idx" ON "site_group_memberships" USING btree ("site_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_tracking_prompt_due_idx" ON "ai_tracking_prompts" USING btree ("active","next_run_at");