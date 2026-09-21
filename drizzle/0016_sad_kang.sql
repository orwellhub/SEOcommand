ALTER TABLE "ai_crawler_audits" ADD COLUMN "checked_pages" integer;--> statement-breakpoint
ALTER TABLE "ai_crawler_audits" ADD COLUMN "blocked_pages" integer;--> statement-breakpoint
ALTER TABLE "ai_crawler_audits" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;