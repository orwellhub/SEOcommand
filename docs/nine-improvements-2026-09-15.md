# Nine report improvements

Scope authorised: the nine items in the current conversation, using existing providers and spending limits. Keep SEO Command branding and all stored records. Shopping coverage is keyword-based; do not claim a complete competitor PLA index. Historical reports only describe observed dates.

- [x] Position Tracking: campaign editing, keyword management, devices/locations, tags, pages, competitor landscape, snippet opportunities, dated evidence.
- [x] Comparisons: root/subdomain/folder/URL scope, organic/paid per target, overlap visualisation and keyword-based Shopping observations.
- [x] Site Audit: dedicated thematic reports with affected pages and controls.
- [x] Crawl comparisons: URL-level new/fixed/recurring and unchecked evidence.
- [x] Keyword research: progressive collection, full SERP inspection, persistent filter presets.
- [x] Strategy: SERP-overlap clusters, intent, pillar/supporting-page planning and persisted handoff.
- [x] Cannibalisation: distinguish candidates from URL-switching/ranking-decline evidence.
- [x] Advertising: comparable dated keyword/ad/landing-page changes and historical SERP collection.
- [x] Layout/control consistency: compact report headers, tabs, filters, actionable tables and browser checks.

These checks describe local implementation, not production deployment or complete visual equivalence with Semrush.

## Verification

- 419 automated tests in 86 files passed, including access controls, stale-edit protection, partial collection recovery, scope boundaries, clustering and evidence accuracy.
- Final lint, production Webpack build and whitespace checks passed.
- Isolated browser tests used synthetic records with no database or provider credentials. Campaign edits, paused targets, progressive keyword collection, filter presets, SERP inspection, saved comparisons, page plans and advertising history were exercised.
- Campaign names/cadence, comparison verification, keyword filters and page plans persisted after reload.
- Mobile checks at 390px covered Position Tracking, Keyword Gap, populated Keyword Magic, crawl comparisons, Strategy Builder and Advertising History. No document-level horizontal overflow was found; wide tables scroll within their containers.
- Existing branding retained. No database migrations, production writes, paid provider calls or new subscriptions were made.

## Evidence and coverage limits

- Missing ranking observations remain unknown. Failed provider responses are not saved as ranking losses. Successfully collected targets are checkpointed before a partial batch failure.
- A crawl issue is fixed only when the same URL has an explicit passing check from a compatible crawl. Missing or incompatible evidence is unverified.
- SERP clusters use compatible, recent country/language/device observations and require shared organic results. Unknown search volume remains unknown.
- Multiple pages receiving impressions are low-priority review candidates. Higher priority requires dated URL switching and a coincident ranking decline; this does not establish causation.
- Shopping comparisons use collected keyword SERPs, not a complete reverse competitor Shopping index. Advertising history shows provider-indexed dates, not continuous campaign activity or actual advertiser spend.
- Progressive keyword/comparison collection is capped at 20,000 rows per collection/target; larger coverage requires narrower scopes or future background collection.
- Exact screen-by-screen visual comparison with the signed-in Semrush product and live provider validation remain outstanding.

## Release

- [ ] Confirm which of the two Render workspaces hosts the existing service.
- [ ] Read a fresh production record baseline and confirm the deployment branch.
- [ ] Deploy the tested changes and verify authenticated production workflows.
- [ ] Confirm pre-existing production records remain present and unchanged.

The previous local product-completion commit is also awaiting deployment. Preserve its changes when releasing this update.
