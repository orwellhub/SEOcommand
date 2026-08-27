CREATE TABLE "research_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"source_value" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"location_label" text NOT NULL,
	"provider" text DEFAULT 'dataforseo' NOT NULL,
	"provider_cost_usd" real DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"site_slug" text NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"priority_score" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'mapped' NOT NULL,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "source_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD CONSTRAINT "research_mappings_evidence_id_research_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."research_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_evidence_recent_idx" ON "research_evidence" USING btree ("kind","captured_at");--> statement-breakpoint
CREATE INDEX "research_evidence_project_idx" ON "research_evidence" USING btree ("project_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_research_mapping_evidence_site" ON "research_mappings" USING btree ("evidence_id","site_slug");--> statement-breakpoint
CREATE INDEX "research_mapping_site_status_idx" ON "research_mappings" USING btree ("site_slug","status","updated_at");