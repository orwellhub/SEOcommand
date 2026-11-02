# SEO Command MCP connector

`/api/mcp` is a remote MCP (Model Context Protocol) server. It lets Claude read
and manage SEO Command's data directly, from claude.ai as a custom connector or
from Claude Code, without anyone driving the dashboard in a browser.

- Endpoint: `https://seo.187-7-22-248.sslip.io/api/mcp`
- Transport: Streamable HTTP, `POST` only, stateless JSON responses (no SSE, no
  sessions). `GET` and `DELETE` return `405`.
- Protocol: dual-era. Modern clients use revision `2026-07-28` (per-request
  `_meta`, `server/discover`, `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name`
  headers). Legacy clients use `initialize`, `notifications/initialized`, `ping`,
  `tools/list` and `tools/call` with `2025-11-25`, `2025-06-18` or `2025-03-26`.
- Auth: `Authorization: Bearer <token>`, compared in constant time with the
  `SEOCOMMAND_MCP_TOKEN` environment variable.

## Security

- The endpoint has its own bearer boundary, like `/api/sync`; the dashboard
  session cookie is not accepted and not needed.
- `SEOCOMMAND_MCP_TOKEN` unset or shorter than 32 characters: every request gets
  `503` and nothing runs.
- Missing or wrong token: `401` with `WWW-Authenticate: Bearer realm="seocommand-mcp"`.
- The token is never logged, stored or echoed in a response.
- Browser `Origin` headers are checked (same origin, `https://claude.ai`,
  `https://claude.com`, plus any in `SEOCOMMAND_MCP_ALLOWED_ORIGINS`). Requests
  with no `Origin` (claude.ai's connector backend, Claude Code) are unaffected.
- Holding the token is equivalent to an admin login: tools reuse the app's own
  routes in-process under an internal `claude-mcp` admin principal, signed with
  `AUTH_SECRET` (which must already be set for logins to work). That internal
  session never leaves the server.
- Every tool call is audited in `access_audit_events` (`area = "mcp"`,
  `actor_email = "claude-mcp"`, `action = "mcp.<tool>"`) with the site, cost,
  duration, outcome and argument names, plus one `mcp_tool_call` log line. No
  secrets or argument values are written to the audit trail.

## Budget rules

Paid tools spend DataForSEO credit. Three limits apply, and the tightest wins:

1. **claude-mcp budget**: `SEOCOMMAND_MCP_MONTHLY_BUDGET_USD`, default `50`.
   Everything spent through the connector is recorded on the `provider_spend`
   ledger with `actor = 'claude-mcp'`.
   - Before a paid tool runs, its estimated cost plus claude-mcp's
     month-to-date spend must fit the cap, or the tool is refused with a clear
     message and nothing is charged.
   - While it runs, SpendGuard checks the cap again before every provider
     request, so a run whose real cost outgrows the estimate stops at the cap.
     The result (or error) reports what was actually charged.
   - `0`, a negative number or an invalid value disables paid tools.
2. **Overall guardrail**: the existing `$200` per month SpendGuard
   (`MONTHLY_BUDGET_USD`). Unchanged, never bypassed. The connector's spend
   counts towards it.
3. **Site ceilings**: each database-managed site's approved monthly ceiling and
   category limits still apply. Paid site tools also need the site's spend
   approval.

Estimates come from SEO Command's own pre-flight figures
(`requestCostEstimate` and the Scan Centre module estimates). Months are UTC.

Manage tools spend nothing themselves. Prompts and keywords they add are
collected by the scheduler, and that spend counts against the site ceiling and
the overall guardrail, not the claude-mcp budget.

Spend before this release, and all scheduler and dashboard spend, is recorded
as `actor = 'app'`.

## Tools

All tools return JSON as `structuredContent`, with the same JSON in a text
block. Failures return `isError: true` and `{ "error": "..." }` (paid failures
add `estimateUsd`, `costUsd` and `budget`). Lists are paged: `{ total, offset,
limit, nextOffset, rows }`, where `nextOffset` is `null` on the last page.
`site` is always a slug from `list_sites`.

### Read tools (free)

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_sites` | none | `{ count, sites: [{ slug, name, host, industry, primaryMarket, locationCode, languageCode, gscProperty, ga4Property, lifecycleStatus, spendApproval, approvedMonthlyUsd, source }], generatedAt }` |
| `get_site_live` | `site`, `sections?` (any of `striking_distance`, `gsc_query_pages`, `page_movers`, `query_movers`, `ranked_keywords`, `keyword_gaps`, `competitors`, `recommendations`; default all), `limit?` (25, max 500), `offset?` | `{ site, lastSync, gscTotals: { clicks, impressions, ctr, position, freshness } \| null, sections: { <name>: { freshness, total, offset, limit, nextOffset, rows } } }`. Movers: `{ freshness, gains: page, losses: page }`. Unsynced: `{ status: "awaiting_first_sync" }`. `freshness = { capturedOn, collectedAt, source, rangeStart, rangeEnd, location }` |
| `get_keyword_strategy` | `site`, `limit?` (25, max 500), `offset?` | `{ site, capturedOn, createdAt, summary, clusters: page (by opportunityScore), pageMap: page, cannibalisation: page }` or `{ status: "awaiting_first_sync" }` |
| `get_market_intelligence` | `site`, `days?` (7, 28, 90 or 365; default 90), `limit?` (10, max 100) | `{ site, days, provenance, datasets, collection, aiSummary, totals, shareOfVoice, content, links, coverage, opportunities, forecasts }`; nested lists capped at `limit`, full sizes in `totals` |
| `get_ai_visibility` | `site`, `days?` (7 to 365, default 90), `platform?` (`chatgpt`, `claude`, `gemini`, `perplexity`, `google_ai_overview`, `google_ai_mode`, `copilot`), `limit?` (50, max 300), `offset?` | `{ site, days, platform, latestCapturedAt, summary, platforms, trackedPrompts, results: page of { prompt, topic, platform, model, capturedOn, capturedAt, mentioned, cited, position, sentiment, ownedCitations, citedDomains, competitorsMentioned }, competitorDomains: [{ name, host, mentions, shareOfVoice, avgPosition }], citedSources: [{ domain, citations, platforms, samplePrompts, sampleUrls }], recommendations }` |
| `get_rank_tracking` | `site`, `days?` (1 to 365, default 30), `limit?` (100, max 1000), `offset?` | `{ site, from, to, latestCapturedOn, volumeCollectedAt, totals: { keywords, active, ranked, top3, top10, notRanked }, campaigns, keywords: page of { id, keyword, device, locationCode, languageCode, cadence, active, campaignId, targetUrl, tags, volume, latest: { capturedOn, position, url } \| null, previousPosition, change, bestPosition, topCompetitors } }`. `change` is previous minus latest position, so positive means the keyword moved up |
| `get_collection_health` | `site?`, `limit?` (20, max 100), `offset?` | With `site`: `{ site, generatedAt, items: { rankings, competitors, coverage, links, ai, outcomes: { label, state, confidence, cadence, records, distinctDates, observedAt, nextRunAt, staleAfterDays, validationIssues } } }`. Without: `{ generatedAt, sites: page of { site, name, items: { <dataset>: { state, observedAt, nextRunAt, issues } } } }` |
| `get_spend` | none | `{ month, overall: { spentUsd, reservedUsd, limitUsd, remainingUsd, pctUsed, crossedThresholds }, mcp: { month, actor, spentUsd, limitUsd, remainingUsd, pctUsed }, byActor: [{ actor, costUsd, requests }], durable, generatedAt }` |
| `get_analytics` | `site`, `limit?` (50, max 250) | `{ site, lastSync, sources: { status: ok \| not_collected_yet, freshness, windows: { current, previous, days }, leadEvent, leadsCounted, truncated, classes: { google_organic, other_search, ai_assistants, paid, social, email, referral, direct, other: { label, sessions, engagedSessions, keyEvents, leads: { now, before, delta, pct } } }, nonGoogleShareOfOrganic: { now, before }, aiAssistants: [{ name, sessions, keyEvents, leads }], otherSearch: [...], rows }, channels, organicOverview, landingPages, generatedAt }`. GA4 by source/medium (dataset `ga4_sources`, daily Google sync): the AI-assistant and non-Google search traffic Search Console cannot see. Free. |

### Manage tools (free)

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_ai_prompts` | `site`, `includeInactive?` (default true) | `{ site, count, prompts: [{ id, prompt, topic, platforms, sampleCount, cadence, priority, locationCode, languageCode, active, source, nextRunAt, lastRunAt, updatedAt }] }` |
| `upsert_ai_prompt` | `site`, `id?`, `prompt` (8 to 1000 chars), `topic` (2 to 100), `platforms` (1+ of the platform list), `sampleCount?` (1 to 5, default 1), `cadence?` (`daily`, `weekly`, `monthly`; default weekly), `priority?` (0 to 100, default 50), `locationCode?` (or null), `languageCode?`, `active?` | `{ site, created, prompt, note }`. With `id` it updates that prompt; otherwise it updates the site's prompt with the same text or creates one. Market defaults to the site's |
| `delete_ai_prompt` | `site`, `id` | `{ site, id, action: "deactivated" \| "deleted", observationsKept }`. Prompts with observations are deactivated so history is kept |
| `list_rank_keywords` | `site`, `includeInactive?` (default true), `limit?` (200, max 5000), `offset?` | `{ site, campaigns: [{ id, name, defaultCadence, competitors }], keywords: page of { id, keyword, locationCode, languageCode, device, cadence, active, targetUrl, tags, campaignId, createdAt } }` |
| `upsert_rank_keywords` | `site`, `keywords` (1 to 500 of `{ keyword, targetUrl?` (http(s) URL or null)`, tags? }`), `locationCode?`, `languageCode?`, `device?` (`desktop` default, `mobile`), `cadence?` (`daily`, `weekly`), `active?`, `campaignId?`, `campaignName?` (default "Claude MCP") | `{ site, campaignId, locationCode, languageCode, device, added, updated, unchanged, note }`. A keyword is matched on site, keyword, location and device |
| `delete_rank_keywords` | `site`, `ids` (1 to 500) | `{ site, deleted, deactivated, notFound }`. Keywords with rank history are deactivated so history is kept |

### Paid tools (DataForSEO)

Every paid result includes `spend: { estimateUsd, costUsd, providerRequests, budget }`.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `keyword_research` | `seed` (keyword up to 80 chars, or a domain), `site?` (spend attribution and default market), `sourceType?` (`seed` default, `domain`, `competitor`, `questions`, `related`), `locationCode?`, `languageCode?`, `limit?` (50, max 1000), `offset?` (max 20000), `overview?` (false; adds seed metrics, questions and related, which are extra calls), `filters?` (`match`, `questions`, `include`, `exclude`, `intent`, `minVolume`, `maxVolume`, `minDifficulty`, `maxDifficulty`, `sort`, `direction`) | `{ seed, locationCode, locationLabel, languageCode, fetchedAt, total, nextOffset, primary, questions?, related?, rows: [{ keyword, volume, difficulty, cpc, competition, intent, serpFeatures, trend }], warnings, spend }` |
| `keyword_metrics` | `keywords` (1 to 700), `site?`, `locationCode?`, `languageCode?` (both required unless `site` supplies them) | `{ locationCode, languageCode, fetchedAt, rows, spend }` |
| `keyword_gap` | `site`, `competitors` (1 to 4 domains), `locationCode?`, `languageCode?`, `providerLimit?` (keywords per comparison, 250 default, max 1000; drives cost), `filter?` (`all`, `missing`, `untapped`, `weak`, `strong`, `shared`, `unique`), `limit?` (100, max 1000), `offset?` | `{ site, recordId, status, domains, locationCode, languageCode, collectedAt, counts, filter, keywords: page of { keyword, volume, difficulty, intent, sitePosition, siteUrl, competitors: { <domain>: position \| null \| "unknown" } }, spend }`. Also saved in the Keyword Gap workspace |
| `run_ai_visibility_now` | `site`, `promptIds?` (default: every active prompt) | `{ site, prompts: [{ id, prompt, platforms, sampleCount, reason: "requested" \| "already_due" }], aiPrompts: { status, note? }, results, startedAt, completedAt, next, spend }`. Uses the sync engine's AI collector; prompts already due also run. Read results with `get_ai_visibility` |
| `refresh_site` | `site`, `source` (`google` free, or `dataforseo` paid) | `{ site, source, elapsedMs, results: [{ dataset, status, note? }], startedAt, completedAt, spend }`. `dataforseo` is the light tier: tracked rankings, ranked keywords, competitors, keyword gaps and backlinks; no crawl or AI checks |

## Setup (Gareth)

Never paste the token into a chat, a file in a repo, or a ticket. It goes only
into Coolify and into the connector's request header.

### a. Generate a token on your own machine

```bash
openssl rand -hex 32
```

This prints 64 hex characters. Keep it in your password manager.

### b. Set it in Coolify and deploy

1. Open Coolify, then the SEO Command application, then **Environment Variables**.
2. Add `SEOCOMMAND_MCP_TOKEN` with the token as its value (mark it as a secret
   if Coolify offers that).
3. Optional: add `SEOCOMMAND_MCP_MONTHLY_BUDGET_USD` (default `50` when unset).
4. Make sure the deploy runs the database migrations. The repo configures this
   only for Render (`preDeployCommand: npm run db:migrate`). In Coolify, check
   the application's pre-deployment command (or start command) runs
   `npm run db:migrate`; if it does not, add it, or run `npm run db:migrate`
   once against the production database. This release adds migration
   `0017_provider_spend_actor`: one `actor` column on `provider_spend` (existing
   rows become `app`) and one index. It is additive and changes no data.
5. Press **Deploy**.

Until the migration has run, the app keeps recording spend normally, but paid
connector tools refuse to run because the claude-mcp budget cannot be read.

Check: `curl -i -X POST https://seo.187-7-22-248.sslip.io/api/mcp` should now
return `401`, not `503`.

### c. Add the connector in claude.ai

1. Go to **Customize > Connectors** and click **Add custom connector**. (On a
   Team or Enterprise plan an Owner adds it under **Organization settings >
   Connectors > Add > Custom**.)
2. Name: `SEO Command`. MCP server URL:
   `https://seo.187-7-22-248.sslip.io/api/mcp`
3. Authentication: **No sign-in**.
4. Under **Request headers**, choose `authorization` and enter the value
   `Bearer <token>` (the word `Bearer`, a space, then the token). Mark it
   **Required**, then click **Add**.
5. In a chat, turn the connector on from the **+** menu and ask Claude to call
   `get_spend` to confirm it works.

Request headers are a beta feature in claude.ai. If the **Request headers**
section is missing from the dialog, the account does not have it yet; use
Claude Code (step d) until it does. Headers cannot be edited after saving: to
rotate the token, set the new value in Coolify, deploy, then remove and re-add
the connector.

### d. Claude Code

```bash
claude mcp add --transport http --scope user seocommand https://seo.187-7-22-248.sslip.io/api/mcp \
  --header "Authorization: Bearer <token>"
```

Then run `/mcp` inside Claude Code to check the connection. To keep the token
out of shell history, put it in an environment variable with your own name (for
example `SEOCOMMAND_MCP_TOKEN`) and reference `Bearer ${SEOCOMMAND_MCP_TOKEN}`
in the server's `headers` in your Claude Code MCP config.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `503` "endpoint is disabled" | `SEOCOMMAND_MCP_TOKEN` is unset or under 32 characters, or the app was not redeployed after setting it |
| `401` | Header missing, `Bearer ` prefix missing, or token mismatch |
| Tool error "AUTH_SECRET is not configured" | Set `AUTH_SECRET` (the same value that signs dashboard logins) |
| Tool error "Refused before spending" | The estimate does not fit the claude-mcp budget or the overall guardrail; check `get_spend` |
| Tool error "DataForSEO credentials are not configured" | Paid tools need `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` |
| Tool error "not approved for paid collection" | Approve the site's spending limit in SEO Command |
| A dataset note says "claude-mcp monthly budget reached" | A paid run stopped at the actor cap part-way; completed datasets are kept |
| Paid tools fail with a database error about `actor` | Migration `0017_provider_spend_actor` has not run; run `npm run db:migrate` |

## Implementation

- Route: `src/app/api/mcp/route.ts` (listed in the proxy's public paths because
  it has its own bearer check).
- Protocol and dispatch: `src/mcp/protocol.ts`; auth: `src/mcp/auth.ts`;
  config: `src/mcp/config.ts`.
- Tools: `src/mcp/tools/read.ts`, `manage.ts`, `paid.ts`; registry
  `src/mcp/tools/index.ts`. Tools call the existing route handlers in-process
  (`src/mcp/internal.ts`) or the existing read models, so validation, access
  and business logic are not duplicated.
- Budget: `src/mcp/budget.ts`, `src/providers/dataforseo/actor.ts` (spend actor
  context) and the actor check in `SpendGuard.run` (`src/providers/dataforseo/cost.ts`).
- Audit: `src/mcp/audit.ts`.
- Tests: `src/mcp/protocol.test.ts`, `src/mcp/budget.test.ts` (no network; the
  provider is mocked).
