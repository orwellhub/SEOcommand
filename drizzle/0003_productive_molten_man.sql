CREATE TABLE IF NOT EXISTS "report_delivery_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_slug" text,
	"template_id" text NOT NULL,
	"template_name" text NOT NULL,
	"cadence" text NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" text DEFAULT 'PDF' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run" timestamp NOT NULL,
	"last_delivered" timestamp,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_slug" text NOT NULL,
	"recommendation_key" text NOT NULL,
	"decision" text NOT NULL,
	"title" text NOT NULL,
	"module" text NOT NULL,
	"effort" text NOT NULL,
	"priority_score" integer NOT NULL,
	"status" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_delivery_due_idx" ON "report_delivery_schedules" USING btree ("enabled","next_run");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_workflow_recommendation" ON "workflow_items" USING btree ("domain_slug","recommendation_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_domain_idx" ON "workflow_items" USING btree ("domain_slug","updated_at");