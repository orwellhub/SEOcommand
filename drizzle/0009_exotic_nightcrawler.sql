CREATE TABLE IF NOT EXISTS "access_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_slug" text,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"area" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "portfolio_notification_inbox_idx";--> statement-breakpoint
ALTER TABLE "site_profiles" ALTER COLUMN "accent" SET DEFAULT '#335CFF';--> statement-breakpoint
ALTER TABLE "portfolio_notifications" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "portfolio_notifications" ADD COLUMN "snoozed_until" timestamp;--> statement-breakpoint
ALTER TABLE "portfolio_notifications" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "portfolio_notifications" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "site_profiles" ADD COLUMN "budget_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profiles" ADD COLUMN "monitoring_schedule" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profiles" ADD COLUMN "site_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_profiles" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_audit_site_idx" ON "access_audit_events" USING btree ("site_slug","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_audit_actor_idx" ON "access_audit_events" USING btree ("actor_email","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_notification_inbox_idx" ON "portfolio_notifications" USING btree ("status","read_at","created_at");