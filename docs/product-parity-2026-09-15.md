# Product completion: Semrush reference

User instruction: complete all features identified in the navigation audit; match the relevant Semrush report layouts, information hierarchy, controls and workflows. Preserve SEO Command branding (orange, original palette, Manrope) and all existing data. DataForSEO collection is authorised within existing spending limits. New subscriptions still need approval.

## Acceptance gates

- Each named tool has a distinct, substantive report, not a renamed unrelated screen.
- Filters change the actual result set and preserve site, market, language and date context.
- Every displayed metric has source/coverage/date context; unknowns remain unknown, never manufactured equivalents of Semrush proprietary metrics.
- Every primary action completes a persisted workflow or clearly identifies its actual external prerequisite.
- Existing records are preserved; changes are additive and access checked.
- Test algorithms, storage transitions and permission boundaries; exercise desktop/mobile report controls and workflows.
- Compare with observed Semrush screens and official tool documentation. Do not claim exact parity where reference access or data entitlement is missing.

## Implemented in this change

The following work is implemented locally. This checklist describes supported workflows, not a claim that every Semrush screen or proprietary dataset is identical. Release and provider activation remain separate gates below.

- [x] Keyword Overview and dedicated Keyword Magic: groups, match types, filters, columns, saved lists, exports, keyword drill-down, tracking/content handoff. The Related filter prepares a collection; Analyze initiates the priced request.
- [x] Multi-domain comparison and Keyword Gap: 2–5 root domains, shared/missing/weak/strong/unique/untapped intersections, market controls, saved comparisons and trends. Organic scope only; no paid/PLA or subfolder comparison.
- [x] Organic Rankings/Top Pages: overview, positions, changes, competitors, pages and comparable dated snapshots.
- [x] Topic Research: cards/explorer/overview/mind map, questions/headlines/trends, saved favourites and content handoff. Topics group recurring phrases; this is not a proprietary semantic model.
- [x] On Page SEO Checker: overview, seven idea categories, top-results benchmarking, work handoff, saved evidence and verification. Completed SERP collection is retained for cost-free page-read retries.
- [x] Organic Traffic Insights: comparable landing-page GSC/GA4 joins, metrics, queries and exports. No invented query-level conversions.
- [x] Content Template: keyword-based competitor benchmarks, saved reusable briefs and direct content creation.
- [x] Writing Assistant: persistent editor, SEO/readability guidance, six controlled DataForSEO rewrite actions, saved suggestions and supplied-text originality comparison. Whole-web plagiarism checking remains unavailable.
- [x] Content Calendar: month/week/list, direct brief creation, owner/deadline/stage, rescheduling, independently saved article URLs and unsaved-change protection.
- [x] Backlink Audit: review/remove/disavow/whitelist/lost-found, individual and bulk decisions, notes and exports. No disavow submissions or outreach are sent automatically.
- [x] AI research: prompt grouping, platform filters, response inspection, verified competitor-only citation gaps, demand discovery and content handoff. Monthly audience remains unavailable.
- [x] Local: durable listing inventory/status/notes, possible duplicate detection and review/reply consolidation. Automatic directory distribution needs a separately approved provider.
- [x] Traffic: Similarweb adapter, usage reservations/checkpoints, stored history, channels/countries/pages, market/device/month filters and dashboard bindings. The integration is disabled until the contract, credentials, entitlements and credit limit are approved.
- [x] SEO Dashboard and Domain Overview: compact reference card arrangement, metric drill-downs, organic keywords/intent/pages/competitors, positioning chart and separate paid-research reports. SEO Command branding retained.
- [x] Site Audit: overview, issue lists, crawled-page explorer, statistics, comparison and progress. Fixed provider checks incorrectly counted as issues; versioned the methodology and retained original stored records.
- [x] Navigation destinations: all 83 captured menu/toolkit URLs loaded in isolated browser QA with no detected broken report or selected-site failure. This includes report tabs and toolkit aliases, not 83 separate products.

## Verification and release gates

- [x] Full automated suite: 385 tests across 82 files passed.
- [x] Full lint passed again after the final browser fixes.
- [x] Final production Webpack build compiled, typechecked and generated all 73 static pages after the browser fixes. Turbopack could not bind its build socket in this local sandbox; no application build error was reported by Webpack.
- [x] Browser QA: dashboard/domain layouts, Site Audit error filtering and crawl-history empty state, keyword filtering/selection/columns/tracking handoff, content creation/save/stages/calendar/URLs/unsaved transitions, backlink decision and note persistence, listing edits and duplicate filtering.
- [x] No schema migration, seed, data reset, production deletion or provider collection performed during local implementation/QA.
- [ ] Exact visual comparison for every Semrush screen. Signed-in Dashboard/Domain Overview/Keyword Magic and official documentation informed the work; the reference tab later timed out. Do not claim screenshot-level equality across the product.
- [x] Mobile spot checks at a verified 390-pixel viewport in the in-app browser: dashboard, navigation drawer, keyword research and calendar. No page-level horizontal overflow; the calendar keeps its wide grid inside its own horizontal scroll region. The viewport was reset. Chrome’s ineffective viewport override was not counted.
- [ ] Production pre-deploy record baseline, release, post-deploy preservation check and authenticated smoke tests. Render connector workspace selection is pending the user's answer.
- [ ] Live validation of the new paid DataForSEO collectors and approved Similarweb entitlements. Unit/API tests passed; synthetic QA cannot establish real-provider entitlement or response coverage.

## Remaining parity boundaries

- Semrush proprietary Authority Score, personal keyword difficulty, AI monthly audience, total-traffic panel and whole-web plagiarism coverage are not manufactured from unrelated data.
- Total-traffic audience/unique visitors, visits-per-user and full journey/overlap datasets require further provider entitlement/implementation beyond the visits/channels/countries/pages adapter in this change.
- Listing inventory and duplicates are saved reviews. They do not automatically distribute business details to directories.
- Multi-domain comparisons currently use organic root-domain datasets. Subfolder/subdomain scopes, paid/PLA comparisons and Semrush's complete overlap visualisation are not implemented.
- Site Audit thematic links reuse the relevant existing technical/speed reports; they are not all separate copies of Semrush's thematic screens. Historical comparisons report issue-count changes only for compatible methodology and crawl counts; they do not assert that specific URLs are fixed without verification.
- Semrush screen-level validation and the remaining data/entitlement boundaries must stay visible in acceptance criteria. Passing a navigation sweep is not full functional or visual parity.

## Data safety

All new research, decisions and content changes use existing storage tables. Content edits use compare-and-swap updates. Bulk backlink decisions merge entries without dropping existing notes. Listing edits check the saved version. Provider calls use existing spending limits; Similarweb reserves monthly credits before calls and checkpoints completed requests without automatic retries after an uncertain outcome. Existing crawler records are not rewritten by the issue-normalisation correction.

## Connection setup

DataForSEO uses the existing server-side connection and site budgets. New organic/paid collections explicitly request their correct result types so advertising does not contaminate organic reports.

For Similarweb, leave the new variables in `.env.example` disabled until the account owner approves the contract price and credit budget. Overview reserves 15 credits (visits, desktop channels, mobile channels). Popular Pages reserves 30 credits for up to ten rows and requires its add-on. Geography reserves 70 credits for up to ten countries and requires its entitlement. These are provider credits, not a quoted dollar subscription price. Review current entitlements before activation; new subscriptions were not approved or purchased in this change.

## Reference observations

Signed-in Semrush SEO Dashboard inspected on 15 September: two AI/SEO cards; Position Tracking/Site Audit/Listing Management row; On Page/Backlink Audit/Organic Insights/Link Building row; traffic overview with data source, scope, date, five metrics and channel trends; Organic Rankings changes; backlink referring-domain trend and authority distribution; Google connection and hidden widgets.

Keyword Magic entry inspected: compact keyword/domain/country search, recent searches and a separate results workspace. Official documentation establishes match tabs, term-group sidebar, advanced filter strip, dense keyword metrics table, column management, select/export and strategy handoff.

Source audit: `outputs/navigation-feature-audit/audit.md` in the parent task workspace. Full navigation inventory contains 77 menu entries, 73 distinct destinations, zero absent route files.
