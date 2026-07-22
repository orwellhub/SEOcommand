# Scoring methodology

All Orwell scores are **original and transparent**. We do not reproduce any vendor's
proprietary scoring formula. Every score is a documented, inspectable composite.

## Orwell Site Health Score (0–100)

A weighted average of category sub-scores. **There is no hidden formula** — the weights
are shown in the UI (Site Audit → Health breakdown) and defined in `src/data/seed.ts`
(`HEALTH_WEIGHTS`) and computed by `healthScore()`.

| Category | Weight |
| --- | --- |
| Crawlability | 15% |
| Indexability | 15% |
| Core Web Vitals | 15% |
| Metadata | 10% |
| Internal linking | 10% |
| Canonicalisation | 10% |
| Structured data | 8% |
| HTTPS & security | 7% |
| International (hreflang) | 5% |
| Content quality | 5% |

```
health = Σ (category.weight × category.score)   // each score ∈ [0,100]
```

Each category score is derived from the issues found in that category (severity-weighted
in the live product). Because weights are explicit, a drop in the overall score can always
be traced to a specific category and its issues.

## Orwell Authority Score (0–100)

An original alternative to third-party authority metrics. Computed by
`orwellAuthorityScore()` in `src/data/metrics.ts`.

| Component | Weight | Signal |
| --- | --- | --- |
| Referring-domain authority | 35% | Mean authority of referring domains |
| Topical relevance | 20% | Mean topical relevance of referring domains to the site's niche |
| Link diversity | 15% | Distinct referring hosts / target (capped) |
| Organic visibility | 20% | Current search visibility index |
| Toxic-link risk penalty | −10% | Mean backlink toxicity (subtractive) |

```
authority = clamp(1, 100,
    avgReferringAuthority   × 0.35
  + avgTopicalRelevance     × 0.20
  + linkDiversity           × 0.15
  + organicVisibility       × 0.20
  − avgToxicity             × 0.10 )
```

Rationale: authority should reward links from strong, *relevant* sites across a *diverse*
set of hosts, corroborated by the site's own organic visibility, and should be *penalised*
for a toxic link profile. Each input is a stored, inspectable metric — no black box.

## Recommendation priority score (0–100)

Recommendations carry a `priorityScore` combining estimated impact, confidence and effort
(higher impact + higher confidence + lower effort ⇒ higher priority). In the live product
this is recomputed from the underlying metric deltas the recommendation is derived from.

## Provenance, not just scores

Every score is displayed alongside its provenance (source, freshness, cached/live mode) so
users always know whether a number is cached or freshly collected.
