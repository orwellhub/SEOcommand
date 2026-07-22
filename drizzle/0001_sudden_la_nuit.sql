CREATE TABLE IF NOT EXISTS "provider_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"month" text NOT NULL,
	"endpoint" text NOT NULL,
	"domain_slug" text,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_spend_month_idx" ON "provider_spend" USING btree ("provider","month");