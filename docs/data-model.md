# Data model

Two representations exist and are kept in lockstep:

1. **Canonical TypeScript models** — `src/lib/types.ts`. Every provider returns these;
   the UI only ever touches these. This is the contract that matters day-to-day.
2. **Persistence schema** — `src/db/schema.ts` (Drizzle / PostgreSQL). What the live
   product stores. The demo build does not require it.

## Canonical models (`src/lib/types.ts`)

| Model | Purpose |
| --- | --- |
| `Domain` | A portfolio brand (id, host, accent, market, connection flags) |
| `Provenance` | Source, collected timestamp, range, location, device, freshness, mode |
| `Keyword`, `KeywordList` | Research entities incl. volume, difficulty, CPC, position, SERP features, trend |
| `RankSnapshot`, `PositionBucket` | Immutable ranking history + distribution |
| `Competitor` | Organic competitor overlap & authority |
| `TechnicalIssue`, `HealthBreakdown`, `CrawlRun` | Site-audit entities incl. evidence & fix |
| `Backlink`, `ReferringDomain` | Link intelligence incl. toxicity & topical relevance |
| `AiPrompt` | AI-visibility prompt tracking incl. mention/citation/sentiment |
| `Recommendation`, `Task` | Operational workflow with approval gates |
| `ContentItem` | Content inventory / decay / cannibalisation |
| `ReportTemplate`, `ReportSchedule` | Reporting |
| `UsageLedgerEntry`, `ProviderConnection` | Cost control & provider state |
| `AlertItem` | Alerts feed |

Every provider method returns an `Envelope<T>` = `{ data, provenance }` so freshness and
source travel with the data and can be badged truthfully in the UI.

## Persistence tables (`src/db/schema.ts`)

Grouped as required by the brief (section 8):

- **Org & identity:** `organisations`, `users`, `memberships` (role enum)
- **Domains:** `domains`, `domain_properties`
- **Provider plumbing:** `provider_connections`, `provider_sync_runs` (idempotency key,
  cost, request count, errors), `api_usage_ledger`
- **Keywords:** `keyword_lists`, `keywords`, `tracked_keywords`, `ranking_snapshots`
- **Competitors & metrics:** `competitors`, `domain_metric_snapshots`
- **First-party:** `search_console_snapshots`, `ga4_snapshots`
- **Site audit:** `crawl_projects`, `crawl_runs`, `crawled_pages`, `technical_issues`
- **Backlinks:** `referring_domains`, `backlinks`
- **AI visibility:** `ai_prompts`, `ai_response_checks`, `brand_mentions`
- **Workflow:** `recommendations`, `tasks`, `task_comments`, `task_status_history`
- **Reports & alerts:** `reports`, `report_schedules`, `alerts`

### Indexes & constraints (highlights)

- `ranking_snapshots` has a **unique** `(keyword_id, device, captured_on)` — snapshots are
  immutable and one-per-day, so history can be reconstructed and re-ingestion is idempotent.
- `provider_sync_runs` has a **unique** `idempotency_key` — duplicate job protection.
- `keywords` unique on `(domain_id, keyword, location)`; `domains` unique slug per org.
- Compound indexes on `(domain_id, severity)`, `(domain_id, module)`, `(org_id, day)` for
  the common query paths.

### Raw payloads & retention

Raw provider payloads are stored only where genuinely useful for debugging/reprocessing
(e.g. `ai_response_checks.raw_response`), and are subject to retention rules (see
`docs/cost-controls.md`). Secrets are never stored in the database.

## Migrations & seed

```bash
npm run db:generate   # drizzle-kit generate → ./drizzle
npm run db:migrate    # apply migrations
npm run db:seed       # bootstrap org/users/domains/keywords (live persistence only)
```

The demo never runs these — it renders from `src/data`.
