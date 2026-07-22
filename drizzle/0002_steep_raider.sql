CREATE TABLE IF NOT EXISTS "dataset_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_slug" text NOT NULL,
	"dataset" text NOT NULL,
	"captured_on" date NOT NULL,
	"payload" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_dataset_snapshot" ON "dataset_snapshots" USING btree ("domain_slug","dataset","captured_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dataset_latest_idx" ON "dataset_snapshots" USING btree ("domain_slug","dataset","captured_on");