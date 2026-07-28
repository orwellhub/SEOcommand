CREATE TABLE IF NOT EXISTS "keyword_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"location_label" text NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"total_volume" integer DEFAULT 0 NOT NULL,
	"avg_difficulty" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_scans_recent_idx" ON "keyword_scans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_scans_seed_idx" ON "keyword_scans" USING btree ("seed","location_code");