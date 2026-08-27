# SEOcommand full UX revamp — QA handover

Date: 27 August 2026  
Review branch: `codex/full-ux-revamp`  
Staging application commit: `9307a8c68ab4615f8fbe9b12cc2f10adaf520ac3`  
Staging service: `orwell-qa-web`  
Production status: unchanged

## Executive result

The product-wide UX revamp is complete on the isolated review branch and has passed the available automated and Chrome desktop staging checks. The application now follows a portfolio signal → group/site → evidence → action flow, with a global Action Centre, nested portfolio groups, consistent website workspaces, guided onboarding, per-site spend controls, and connector management.

The current release candidate is suitable for product-owner review in staging. Production release should remain gated on a real database migration rehearsal, live connector/provider smoke tests, and the outstanding cross-browser/mobile device matrix described below.

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
| Vitest files | 22 passed |
| Automated tests | 106 passed |
| TypeScript | Passed, zero errors |
| ESLint | Passed, zero warnings |
| Next.js production build | Passed, 33 static/dynamic route entries generated |
| Primary live route sweep | 22/22 passed |
| Post-deploy application console errors | 0 |
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
| Roles and access | Pass / automated | Admin/operator/Owner-viewer rules and group scope covered by tests; full browser role matrix remains a release gate |

## Accessibility and responsive checks

The 22-route audit returned:

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

## Runtime and security observations

- Render deployment completed successfully on the isolated service.
- Observed CPU peaked at approximately 0.03 cores during the sampled QA/deploy window.
- Observed memory peaked at approximately 188 MB; the latest sample was approximately 168 MB.
- Render returned no HTTP request-count or latency series for the free staging service, so p50/p95 latency could not be asserted from provider telemetry.
- `npm audit --omit=dev` reports zero vulnerabilities.
- The four moderate full-tree findings are development-only transitive packages inside Drizzle Kit's legacy loader/esbuild chain; there are no high or critical findings.
- No GSC, GA4, DataForSEO, AI provider, Copilot, email, WhatsApp, GitHub publishing, Hostinger deployment, webhook delivery, or outreach-send call was made from staging.

## Remaining release gates

1. Rehearse the included database migrations against a disposable clone of production data and verify rollback.
2. Run OAuth/credential smoke tests for GSC, GA4, GitHub and Hostinger using test accounts.
3. Exercise one tightly capped DataForSEO/AI collection per module and reconcile the cost ledger.
4. Test Admin, SEO operator and Owner/viewer browser journeys with real accounts and group grants.
5. Complete Chrome mobile, Safari desktop/mobile and Firefox desktop checks, including screenshots and keyboard/focus-order testing.
6. Measure p50/p95 response times under a representative 20-site and 300-site read load.
7. Verify email delivery in a sandbox mailbox; WhatsApp remains intentionally disabled for this release.

## Release and rollback

- Keep `claude/seo-dashboard-dataforseo-112fbm` unchanged until the release gates pass.
- Release through a reviewed pull request from `codex/full-ux-revamp`.
- Apply database migrations as the pre-deploy gate before switching web or worker traffic.
- Confirm `/api/healthz`, the Action Centre, MortgageCompare overview, per-site settings, and worker startup after deployment.
- Roll back the web/worker services to the prior Render deploy if the health check, migration, authentication, or read-model smoke test fails.
- Database rollback should use the rehearsed migration-specific recovery procedure; do not rely on an application rollback to reverse schema changes.
