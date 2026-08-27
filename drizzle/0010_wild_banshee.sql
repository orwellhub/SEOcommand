CREATE TABLE "keyword_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messaging_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"provider" text DEFAULT 'meta_cloud' NOT NULL,
	"status" text DEFAULT 'not_configured' NOT NULL,
	"display_name" text,
	"phone_number" text,
	"account_id" text,
	"sender_id" text,
	"secret_ref" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_test_at" timestamp,
	"last_test_status" text,
	"last_error" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tracking_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_cadence" text DEFAULT 'weekly' NOT NULL,
	"search_engine" text DEFAULT 'google' NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alert_threshold" integer DEFAULT 5 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"password_hash" text,
	"invite_token_hash" text,
	"invite_expires_at" timestamp,
	"invited_by" text,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"last_signed_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "site_slug" text;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "source_type" text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "source_value" text;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "keyword_scans" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_jobs" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ADD COLUMN "cadence" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ADD COLUMN "search_engine" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "report_delivery_schedules" ADD COLUMN "scope_type" text DEFAULT 'portfolio' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_delivery_schedules" ADD COLUMN "scope_id" text;--> statement-breakpoint
ALTER TABLE "report_delivery_schedules" ADD COLUMN "channels" jsonb DEFAULT '["email"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "report_delivery_schedules" ADD COLUMN "definition" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "report_delivery_schedules" SET "scope_type" = 'site', "scope_id" = "domain_slug" WHERE "domain_slug" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "site_group_memberships" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "site_group_memberships" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_user_id_workspace_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."workspace_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_project_site_idx" ON "keyword_projects" USING btree ("site_slug","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_integration_channel_idx" ON "messaging_integrations" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "rank_tracking_campaign_site_idx" ON "rank_tracking_campaigns" USING btree ("site_slug","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_user_grant_idx" ON "user_access_grants" USING btree ("user_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "workspace_user_scope_idx" ON "user_access_grants" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_user_email_idx" ON "workspace_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workspace_user_status_idx" ON "workspace_users" USING btree ("status","updated_at");
