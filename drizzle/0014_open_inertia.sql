CREATE TABLE "custom_dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope_type" text DEFAULT 'site' NOT NULL,
	"scope_id" text,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "custom_dashboard_scope_idx" ON "custom_dashboards" USING btree ("scope_type","scope_id","updated_at");