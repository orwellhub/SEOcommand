ALTER TABLE "daily_rank_history" ADD COLUMN "owned_features" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_rank_history" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "daily_rank_history" ADD COLUMN "competitors" jsonb DEFAULT '[]'::jsonb NOT NULL;