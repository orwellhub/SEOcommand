# Browser prompt — configure the DataForSEO side

This file has two parts:

1. **Data-point map** — every data point the dashboard consumes and exactly which
   DataForSEO API / endpoint supplies it. This is the shopping list.
2. **PROMPT** — instructions for a browser-automation agent (or you) to configure the
   DataForSEO account at https://app.dataforseo.com so those endpoints are available and
   the API credentials can be handed to Render.

---

## Part 1 — Data points required by each module → DataForSEO source

| Dashboard module | Data points shown | DataForSEO API | Endpoint(s) |
| --- | --- | --- | --- |
| **Research – Keyword explorer** | keyword, search volume, keyword difficulty, CPC, competition, intent, SERP features, 12-month trend | DataForSEO Labs + Keywords Data | Labs `keyword_ideas`, `keyword_suggestions`, `bulk_keyword_difficulty`; Keywords Data `search_volume`, `keywords_for_keywords` |
| **Research – Organic competitors** | competitor domains, common keywords, authority, est. traffic, overlap | DataForSEO Labs | `competitors_domain`, `domain_rank_overview` |
| **Research – Keyword gap** | keywords a competitor ranks for that we don't | DataForSEO Labs | `domain_intersection`, `ranked_keywords` |
| **Rankings – position tracking** | current position, previous position, device, location, URL, SERP features | SERP API + Labs | SERP `google/organic/live/advanced`; Labs `ranked_keywords` (historical) |
| **Rankings – visibility / share of voice** | visibility index over time | DataForSEO Labs | `domain_rank_overview`, `historical_rank_overview` |
| **Rankings – position distribution** | count of keywords in 1–3, 4–10, 11–20, 21–50, 51–100 | DataForSEO Labs | `ranked_keywords` (bucketed client-side) |
| **Rankings – SERP-feature ownership** | which SERP features the domain owns | SERP API | `google/organic/live/advanced` (item_types) |
| **Site Audit – health, issues, crawl** | crawlability, indexability, metadata, headings, canonicals, redirects, broken links, duplicate content, CWV/Lighthouse, hreflang, structured data, images | OnPage API | `task_post` → `summary` → `pages` → `resources` → `links` → `duplicate_tags` → `lighthouse` |
| **Backlinks – overview, referring domains, new/lost, anchors** | backlinks, referring domains, anchors, follow/nofollow, first/last seen, authority | Backlinks API | `backlinks`, `summary`, `referring_domains`, `anchors`, `domain_pages`, `history` |
| **Backlinks – toxicity / risk** | spam/risk signals per link | Backlinks API | `backlinks` (with spam_score / rank fields) |
| **Backlinks – backlink gap** | competitor link intersection | Backlinks API | `domain_intersection`, `competitors` |
| **AI Visibility – prompts, mentions, citations, sentiment** | brand mention rate, citation rate, recommendation position, competitor SoV, source domains, sentiment, per-platform | LLM / SERP AI APIs | LLM Responses / Mentions API; SERP `google/ai_mode` and AI Overview item types |
| **Content Intelligence** | content inventory, decay, cannibalisation, gaps | Labs + OnPage | Labs `relevant_pages`, `ranked_keywords`; OnPage content parsing |
| **Domain overview / Portfolio** | estimated traffic, visibility, top pages, competitor movement | DataForSEO Labs | `domain_rank_overview`, `relevant_pages`, `competitors_domain` |

> First-party owned-site metrics — organic **clicks, impressions, CTR, average position**
> (Search Console) and **sessions, conversions, revenue, landing pages** (GA4) — do **not**
> come from DataForSEO. They come from Google (see `live-connection-plan.md`). DataForSEO
> supplies the external keyword/SERP/competitor/backlink/crawl/AI intelligence above.

Locations & languages to configure for the pilots:
- MortgageCompare → location "United Arab Emirates", language "English"
- BusRentalGlobal → location "United Kingdom" (+ additional EU cities later), language "English"
- PetTransportGlobal → location "United Kingdom" (+ target-country routes later), language "English"

---

## Part 2 — PROMPT

Give the block below to a browser-automation agent (or follow it yourself). It configures
the DataForSEO account and retrieves the API credentials to enter into Render. Never
fabricate account details or credentials — if something requires the operator (payment,
2FA), pause and ask.

```
You are configuring a DataForSEO account for the "Orwell SEO Command Centre" so its API
can power the dashboard. The dashboard needs these APIs enabled and reachable: DataForSEO
Labs, SERP API, OnPage API, Backlinks API, Keywords Data API, and the LLM/AI Mentions API.
Never invent credentials or payment details — if the operator must act (sign-in, 2FA,
payment), pause and ask them.

STEP 1 — Sign in
- Go to https://app.dataforseo.com and ensure the operator is signed in (create an account
  first if they don't have one).

STEP 2 — Retrieve API credentials (this is what Render needs)
- Open the "API Access" / "API Dashboard" area (https://app.dataforseo.com/api-dashboard).
- Locate the API login (usually the account email) and the API password (an API-specific
  key, NOT the website login password). If no API password exists, generate/reset one.
- Record securely and hand to the operator for entry into Render as:
    DATAFORSEO_LOGIN = <API login>
    DATAFORSEO_PASSWORD = <API password>
    DATAFORSEO_BASE_URL = https://api.dataforseo.com
- Do NOT paste these into any file or commit them anywhere.

STEP 3 — Confirm the required APIs are available
- In the API dashboard / documentation explorer, confirm access to each of:
  Labs, SERP (Google), OnPage, Backlinks, Keywords Data, and the LLM / AI Overview
  endpoints. Note any that are not enabled for this plan and report them.

STEP 4 — Fund the account and set a spending guardrail
- Open Billing / Balance. Confirm there is a positive balance (DataForSEO is prepaid,
  pay-as-you-go). Ask the operator to top up if the balance is zero.
- If the dashboard exposes a spending limit / usage alert setting, set a monthly ceiling
  aligned to the app's $200/month guardrail and enable low-balance email alerts. If no
  hard cap exists on their side, note that the app enforces the $200 guardrail itself.

STEP 5 — Verify endpoint access with the API playground (optional but recommended)
- Use the built-in API playground / "try it" console to run one cheap live call per API to
  confirm the credentials work and the plan permits it, for example:
    * SERP:      google/organic/live/advanced for keyword "mortgage rates uae", location
                 "United Arab Emirates", language "English".
    * Labs:      domain_rank_overview for target "mortgagecompare.ae".
    * Backlinks: summary for target "mortgagecompare.ae".
    * OnPage:    a task_post for "https://mortgagecompare.ae" then check summary.
    * Keywords Data: search_volume for a small keyword list.
  Confirm each returns HTTP 200 with data (not an auth or permission error).

STEP 6 — Note locations & languages
- Confirm the location/language codes the app will use are valid for the SERP and Labs
  APIs: "United Arab Emirates"/English and "United Kingdom"/English (plus EU cities and
  route countries later). Record the numeric location_code and language_code for each.

STEP 7 — Report back
Report: which of the six APIs are enabled (and any that are not), the account balance and
whether a spending cap was set, the results of each verification call (pass/fail), the
confirmed location_code/language_code values, and confirm the API login/password were
handed to the operator for Render (without exposing them in the report).
```

---

## After this prompt

You have working DataForSEO credentials and know every endpoint the dashboard needs.
Next: implement the adapter methods in `src/providers/dataforseo/index.ts` against the map
in Part 1, add the secrets to Render (`browser-prompt-render.md`), run the DB migrations,
then set `SEO_PROVIDER=dataforseo`. The app flips a dataset from "Demo data" to live only
once a real request for it succeeds.
