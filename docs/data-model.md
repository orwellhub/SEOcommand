# Data model

The active runtime model has four concerns:

1. `dataset_snapshots`: one canonical payload per domain slug, dataset and day. Same-day
   refreshes upsert; historical days accumulate for trend reconstruction.
2. `provider_spend`: append-only DataForSEO cost ledger used by the monthly guardrail.
3. `workflow_items`: persisted recommendation approvals, dismissals and task status,
   keyed by stable domain slug and recommendation key.
4. `report_delivery_schedules`: persisted recipients, cadence, next run and delivery
   outcome for signed webhook handoff.

The schema also contains the longer-term normalised SEO model (organisations, users,
domains, keywords, crawls, links and reports). The live application currently serves the
canonical snapshot read model because it keeps provider ingestion idempotent and makes
missing datasets explicit.

Credentials never live in database rows. They are server-side environment secrets. Apply
schema changes with `npm run db:generate`, commit the migration and run
`npm run db:migrate` during deployment.
