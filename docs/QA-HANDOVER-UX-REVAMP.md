# SEOcommand full UX revamp — QA handover

Date: 27 August 2026  
Review branch: `codex/full-ux-revamp`  
Staging application commit: `452f28ce4ee68fc4989fe5d724f1a8d9aafb7d93`
Staging service: `orwell-qa-web`  
Production status: unchanged

## Executive result

The product-wide UX revamp is complete on the isolated review branch and has passed the available automated, migration, scale and Chrome desktop staging checks. The application now follows a portfolio signal → group/site → evidence → action flow, with a global Action Centre, nested portfolio groups, consistent website workspaces, guided onboarding, per-site spend controls, and connector management.

The current release candidate is suitable for product-owner review in staging. Production release should remain gated on a disposable hosted-database rehearsal, live connector/provider smoke tests, and the outstanding cross-browser/mobile device matrix described below.

## Product and interaction model

- Global navigation: Action Centre, Portfolio, Reports, Notifications, Admin.
- Website navigation: Overview, Search performance, Rankings, Keywords, Competitors, Technical, Content, Backlinks, AI visibility, Local SEO, Reports, Settings.
- Nested portfolio groups and subgroups with multi-group website assignment.
- A colour-forward portfolio constellation with health-coded website nodes and a non-overlapping 20-site grid.
- Per-site settings for identity, lifecycle, groups, targeting, strategy, monitoring, Local SEO, budgets, connectors, alerts, and access/audit.
- Email-only alert delivery for new websites by default; in-app and WhatsApp remain opt-in.
- Free Google/reliability monitoring starts without paid approval; paid provider work remains blocked until an Admin or Owner approves a forecast-backed ceiling.
- Outreach drafts require human approval; sending remains a separate action.

## Verification summary

| Check | Result |
|---|---:|
| Vitest files | 25 passed |
| Automated tests | 117 passed |
| TypeScript | Passed, zero errors |
| ESLint | Passed, zero warnings |
| Next.js production build | Passed, 33 static/dynamic route entries generated |
| PostgreSQL migration rehearsal | 10/10 migrations; 71 tables; transactional rollback passed |
| Primary live route sweep | 23/23 passed |
| Live website overview regression | Passed after closing the synthetic workflow 503 |
| Post-fix 5xx/error log sweep | 0 |
| Production dependency audit | 0 vulnerabilities |
| Full dependency audit | 4 moderate, development-only, inherited through Drizzle CLI's legacy esbuild |
| Provider spend during QA | $0 |

## Feature matrix

| Area | Staging result | Evidence exercised |
|---|---|---|
| Action Centre | Pass | Priority filtering, alert resolution, evidence links, risk/opportunity split |
| Portfolio | Pass | 20 sites, nested groups, group scoping, comparison entry points, readable constellation |
| Group management | Pass | Created a nested subgroup and assigned sites to multiple groups |
| Website onboarding | Pass | Five steps, optional group/Google/connector setup, seven AI surfaces, cost forecast, free-only activation handoff |
| Site overview | Pass | GSC, GA4, crawl health, movers, landing pages, share of market, competitors and recommendations |
| Per-site budgets | Pass | MortgageCompare ceiling set to $10, forecast validation, approval state and usage meter updated in place |
| Per-site connectors | Pass | GSC, GA4, DataForSEO, GitHub, Hostinger Git and webhook cards; synthetic Hostinger mapping saved in place |
| Rankings and research | Pass | Daily ranking surfaces, keyword gaps, competitor evidence and scoped tables |
| Keyword discovery | Pass | Ran an 18-row synthetic scan, saved it, reopened it, and enabled export |
| Advanced crawler | Pass | Rendered page inventory, crawl issues/diffs and queue action |
| Reliability | Pass | Uptime, TLS/domain/robots/sitemap signals and manual check action |
| Competitor explorer | Pass | Reopened a historical scan without a new provider request |
| Keyword strategy | Pass | Clusters, page mapping and cannibalisation views |
| Local SEO | Pass | Public profile, rating/reviews, 3×3/5×5 grid data and queued scan feedback |
| Link building | Pass | Seven prospects, draft creation and approval; no message sent |
| AI visibility v2 | Pass | Seven platforms, trends, citations, entities, sentiment, rank position, share of voice and crawler access |
| Reports | Pass | Route, fields, cadence and recipient accessibility |
| Notifications | Pass | Inbox lifecycle surfaces and Action Centre integration |
| Roles and access | Pass / integration | Admin/operator/Owner-viewer permissions, inherited subgroup scope and endpoint isolation covered by signed-session/API integration tests; full multi-account browser matrix remains a release gate |

## Scale and migration evidence

The production read model was exercised locally against the compiled application with no provider calls. Each route received 80 requests at concurrency 12.

| Portfolio size / route | p50 | p95 | Failures |
|---|---:|---:|---:|
| 20 sites · portfolio API | 21.9 ms | 69.1 ms | 0 |
| 20 sites · Action Centre | 30.3 ms | 68.5 ms | 0 |
| 20 sites · portfolio HTML | 19.1 ms | 51.8 ms | 0 |
| 300 sites · portfolio API | 52.4 ms | 110.5 ms | 0 |
| 300 sites · Action Centre | 68.7 ms | 140.1 ms | 0 |
| 300 sites · sites API | 79.4 ms | 173.1 ms | 0 |
| 300 sites · portfolio HTML | 31.1 ms | 57.7 ms | 0 |

The first 300-site run exposed a 514 KB Action Centre payload. The endpoint now returns a bounded priority queue (150 items by default, 250 maximum), preserves counts across the full queue, and reports `returned`, `total` and `hasMore`. The resulting payload is approximately 51 KB.

The migration harness applies the complete Drizzle migration journal to PGlite PostgreSQL 16. The rehearsal created 71 tables and confirmed that transactional DDL rollback leaves no partial schema. A second rehearsal on Render's empty disposable PostgreSQL service is blocked by the Render connector returning `FATAL: SSL/TLS required`; no production database was contacted.

## Accessibility and responsive checks

The route/accessibility audit returned:

- one level-one heading on every route;
- `lang="en"` on every document;
- no document-level horizontal overflow;
- no unnamed visible buttons, links, inputs, selects, or text areas;
- labelled DataTable search, keyword, competitor, link-gap, report and settings controls.

Responsive layouts were reviewed in source and use mobile-first breakpoints, scroll-contained tables, a mobile drawer, and touch-sized primary actions. The managed QA browser exposed desktop Chrome only; it did not expose viewport resizing, Safari, Firefox, or a physical mobile browser. Mobile screenshots and a real-device interaction pass therefore remain an explicit release gate rather than fabricated evidence.

## Defects found and closed during end-to-end QA

1. Fixed a website-overview crash caused by an obsolete synthetic share-of-market shape and malformed GA4 landing-page fields.
2. Added contract coverage for the overview datasets across all 20 QA websites.
3. Allowed onboarding forecasts to include all seven supported AI visibility surfaces.
4. Made synthetic keyword scans persist in the current session and reopen from saved-search history.
5. Added missing accessible labels to discovery, competitor, report and reusable table controls.
6. Made Local SEO scan/approval actions return clear operator feedback.
7. Made synthetic outreach drafts and approvals update visibly while keeping Send separate.
8. Enforced role and schema validation before synthetic settings/outreach mutations.
9. Made per-site budget approval reject ceilings below the forecast and retain the approved value in the UI.
10. Made synthetic site settings and connector changes update in place rather than snapping back to fixtures.
11. Changed new-site alert delivery to email only by default.
12. Replaced the synthetic onboarding dead end with an explicit completion handoff to Website Operations.
13. Reworked the portfolio constellation into a tested 20-node grid to prevent overlaps.
14. Preserved `groupIds` through credential authentication and signed-session creation, closing a group-scope loss after login.
15. Moved role, schema, site-existence and access checks ahead of every synthetic success path.
16. Scoped Action Centre, notifications, AI visibility, monitoring, Local SEO, reports, settings and operational APIs to each user's allowed groups and descendant groups.
17. Made report schedules use the managed-site registry instead of the obsolete static domain list.
18. Bounded the Action Centre read model at scale, reducing the 300-site response by approximately 90%.
19. Added signed email webhook contract tests for headers, HTTPS enforcement and failure handling without sending an email.
20. Added a synthetic workflow-task read model after the live browser pass exposed a website-overview `503`; the overview now loads its recommendation evidence and the post-fix Render log sweep is clean.

## Runtime and security observations

- Render deployment completed successfully on the isolated service.
- Observed CPU peaked at approximately 0.03 cores during the sampled QA/deploy window.
- Observed memory peaked at approximately 188 MB; the latest sample was approximately 168 MB.
- Render returned no HTTP request-count or latency series for the free staging service, so p50/p95 latency could not be asserted from provider telemetry.
- `npm audit --omit=dev` reports zero vulnerabilities.
- The four moderate full-tree findings are development-only transitive packages inside Drizzle Kit's legacy loader/esbuild chain; there are no high or critical findings.
- The live QA service is running commit `452f28ce4ee68fc4989fe5d724f1a8d9aafb7d93` from `codex/full-ux-revamp` with auto-deploy disabled.
- Chrome desktop exercised every feature route plus global search, nested group selection, five-step onboarding, per-site Budget & usage, per-site Connections, and the MortgageCompare overview.
- Synthetic credential injection for the browser role matrix was rejected by the external-write safeguard. The role matrix is covered by integration tests, but a true multi-account browser pass remains outstanding rather than being represented as completed.
- No GSC, GA4, DataForSEO, AI provider, Copilot, email, WhatsApp, GitHub publishing, Hostinger deployment, webhook delivery, or outreach-send call was made from staging.

## Remaining release gates

1. Rehearse the included migrations against the empty Render QA PostgreSQL service when the Render connector's TLS issue is resolved, then use a disposable production-data clone before release.
2. Run OAuth/credential smoke tests for GSC, GA4, GitHub and Hostinger using test accounts.
3. Exercise one tightly capped DataForSEO/AI collection per module and reconcile the cost ledger.
4. Test Admin, SEO operator, Owner and Viewer browser journeys with explicit staging accounts and group grants.
5. Complete Chrome mobile, Safari desktop/mobile and Firefox desktop checks, including screenshots and keyboard/focus-order testing.
6. Verify email delivery in a sandbox mailbox once an approved HTTPS webhook endpoint is configured; WhatsApp remains intentionally disabled for this release.

## Release and rollback

- Keep `claude/seo-dashboard-dataforseo-112fbm` unchanged until the release gates pass.
- Release through a reviewed pull request from `codex/full-ux-revamp`.
- Apply database migrations as the pre-deploy gate before switching web or worker traffic.
- Confirm `/api/healthz`, the Action Centre, MortgageCompare overview, per-site settings, and worker startup after deployment.
- Roll back the web/worker services to the prior Render deploy if the health check, migration, authentication, or read-model smoke test fails.
- Database rollback should use the rehearsed migration-specific recovery procedure; do not rely on an application rollback to reverse schema changes.
