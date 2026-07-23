# CLAUDE.md — Working rules for this repository

Guidance for any AI agent (Claude Code or otherwise) operating in this repo.

## Data provider rule — DataForSEO ONLY

**This project pulls all live SEO data (keyword volume, difficulty, CPC, SERPs,
rankings, competitor and backlink data) exclusively from DataForSEO.**

- ✅ **ALWAYS** use **DataForSEO** for keyword scans and any live SEO metrics.
  Use the in-app DataForSEO provider (`src/providers/dataforseo/`) and its
  cost-guarded client — never bypass the `SpendGuard` / `$200/month` budget.
- ⛔ **NEVER** use **Semrush** (the `mcp__Semrush__*` tools) to pull data for
  this project. Do not call `keyword_research`, `execute_report`, or any other
  Semrush report. If a Semrush MCP server is connected, ignore it for data
  pulls here.
- ⛔ Do not substitute other keyword/SERP data sources (e.g. ad-hoc scrapers or
  third-party MCPs) in place of DataForSEO. If DataForSEO is unavailable or
  credentials are not configured, say so and stop — do not silently fall back
  to another provider.

Rationale: the platform is standardised on DataForSEO for consistent metrics,
a single billing surface, and the enforced monthly spend guardrail. Mixing in
Semrush produces inconsistent numbers and unbudgeted cost.

### How to run a keyword scan
Route keyword scans through the app's DataForSEO provider (respecting the
per-domain SERP market / location + language config and the SpendGuard). Do not
call Semrush or answer keyword metrics from general knowledge.

## Cost & credentials

- Respect the `$200/month` DataForSEO budget enforced by `SpendGuard`. Never
  disable or raise it without explicit human approval.
- Never commit secrets. Only `.env.example` may contain variable names and
  safe placeholder values.
- Do not make chargeable API calls or require live credentials during routine
  testing/CI.
