# AI readiness checks — 21 September 2026

The AI Crawler Audit reported one verdict per bot from a single `Disallow: /`
test against the site root. `docs/semrush-audit-implementation.json`
(destinations[53]) recorded the gap: root access checks "are not a full
AI-readiness/site-audit report", and broader checks were to be added "only with
defined, testable criteria". This release adds those criteria.

The work was prompted by Semrush's article on Google's Open Knowledge Format.
OKF itself is deliberately **not** checked, and cannot be — see the limits below.

## Implemented

- Robots.txt is now parsed to RFC 9309 rather than scanned for a root disallow.
  `src/platform/robots-rules.ts` selects the governing group by exact,
  case-insensitive product token with a `*` fallback, then applies longest-match
  with Allow winning equal-length ties, `*` wildcards, `$` end anchors and
  percent-encoding normalisation. Prefix matching is deliberately not used: a
  `Claude` group is not read as governing `Claude-User`, because inventing a
  block the site never wrote would raise a false high-severity alert.
- The audited token list grows from 8 to 21, covering the retrieval and
  assistant bots Semrush checks plus the major training crawlers. `Googlebot`
  carries the note that it, not `Google-Extended`, governs AI Overviews and AI
  Mode. `Google-Extended` stays categorised as training and carries the note
  that it controls Gemini training and grounding, not Google Search.
- Each token is evaluated against the root and up to 200 sampled paths, taken
  from the Search Console page dataset first and the saved crawl inventory
  second. A new `partial` verdict means the root is reachable but sampled pages
  are not; rows record how many paths were checked and blocked, up to five
  blocked samples, the deciding rule and whether the verdict came from the
  wildcard group.
- Severity is a pure, tested function. A blocked or partly blocked search or
  assistant bot is `high`. A blocked training crawler is `low`, because refusing
  training is a legitimate editorial choice — it becomes `medium` only when the
  website has opted in through `siteSettings.aiAccessPolicy.allowTraining`. An
  unreachable robots.txt is `medium` and never reported as a block.
- Losing or regaining retrieval-bot access raises `ai_access_blocked` and
  `ai_access_restored` notifications, fingerprinted per website, bot and day.
  Training crawlers never alert. Both events are registered in the default rule
  set for new websites.
- The hourly reliability check now records discovery-file evidence in its
  existing `details` column: `llms.txt` presence and structure, the homepage
  `X-Robots-Tag` header parsed into directives, and whether robots.txt declares
  a `Sitemap:`. A 200 response carrying an HTML body is recorded as absent,
  which is the common soft-404 case.
- Per-page AI answer eligibility is captured by the browser crawler and the
  watched-page check: `ai_snippet_blocked` (`nosnippet` or `max-snippet:0` from
  the meta robots tag, the googlebot-specific tag or the header),
  `ai_snippet_limited` (a positive cap below 160 characters) and
  `ai_partial_nosnippet` (`data-nosnippet` regions). A new "AI answer
  eligibility" audit theme groups these with the existing JavaScript-dependent
  and not-indexable checks.
- A new "AI readiness" tab in the Health workspace shows bot access by category
  with evidence and samples, discovery files, and answer-eligibility counts,
  each with its own collection time and an explicit "not yet checked" state. A
  "Run readiness check" action re-runs both checks on demand under the existing
  `run_scans` permission.

## Reference and limits

- **Open Knowledge Format is not checkable from a website, so it is not
  checked.** The specification
  (`github.com/GoogleCloudPlatform/open-knowledge-format`) defines a directory
  of markdown files with YAML frontmatter, distributed by `git clone`, tarball
  or filesystem mount. It defines no well-known URL, manifest, HTML link, DNS
  record or registry, and Semrush's own article describes it as facing inward
  toward an organisation's own agents while "llms.txt and sitemaps face
  outward". An OKF check would have nothing to request.
- Google states there are "no additional technical requirements" for AI
  Overviews and AI Mode, and that "You don't need to create new machine readable
  files, AI text files, or markup to appear in these features". The controls
  that do apply are Googlebot's robots.txt access, indexability and the snippet
  directives — which is what these checks measure.
- `llms.txt` is recorded as information only and never alerts or scores. Google
  said in April 2026 there is no SEO benefit to the file, and Semrush's own
  crawl test observed no fetches from GPTBot, ClaudeBot or PerplexityBot over
  three months. The interface labels it "optional; no measured ranking effect".
- Blocking is only checked as the site declares it. A firewall, CDN or bot
  manager can refuse a crawler that robots.txt allows, and that cannot be
  verified from outside; the interface says so rather than implying full
  coverage. Requests are never sent with a spoofed AI user-agent.
- The page-level pass is a 200-path sample, not a full-site guarantee. Rows
  report how many paths were checked so a `partial` verdict cannot be mistaken
  for a complete audit.
- WebMCP, `agents.json` and `.well-known` agent manifests are not checked. None
  is a settled standard and none is recommended by the sources above.
- Every check is a plain HTTPS request to the website itself through the
  existing SSRF guards. No DataForSEO call is made and the SpendGuard budget is
  untouched.

## Validation

- Full suite: 590 passing tests across 109 files. The single failure,
  `src/providers/google/google.test.ts`, is pre-existing and environmental —
  it asserts that no Google credentials are configured, and this machine has
  them set. It fails identically on the commit before this work.
- 67 new tests: 17 for the robots matcher (wildcards, `$` anchors, longest
  match, Allow ties, named-versus-wildcard groups, multi-agent groups, CRLF and
  comments, empty files, percent-encoding), 20 for the audit (partial versus
  blocked, severity policy, alert transitions, 404 as allowed, 5xx as unknown,
  private hosts never requested), 21 for the discovery-file parsers (soft-404
  HTML, BOM, missing H1, malformed links, header and meta directive parsing)
  and 9 for watched-page snippet detection.
- `npm run typecheck`, `npm run lint` and `npm run build` are clean.
- Migration `drizzle/0016_sad_kang.sql` is additive only: three nullable or
  defaulted columns on `ai_crawler_audits`. No table is reset, reseeded or
  dropped, and no existing row is rewritten.
