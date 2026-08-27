CREATE TABLE "workflow_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_item_id" uuid NOT NULL,
	"actor_email" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_item_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "execution_type" text DEFAULT 'content_brief' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "page_mode" text DEFAULT 'new_page' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "target_url" text;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "planned_url" text;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "target_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "research_mappings" ADD COLUMN "duplicate_warning" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "execution_type" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "owner_email" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "page_mode" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "target_url" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "planned_url" text;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "execution_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "verification" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "shipped_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_items" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_workflow_item_id_workflow_items_id_fk" FOREIGN KEY ("workflow_item_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_status_history" ADD CONSTRAINT "workflow_status_history_workflow_item_id_workflow_items_id_fk" FOREIGN KEY ("workflow_item_id") REFERENCES "public"."workflow_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_comment_item_date_idx" ON "workflow_comments" USING btree ("workflow_item_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_status_item_date_idx" ON "workflow_status_history" USING btree ("workflow_item_id","created_at");