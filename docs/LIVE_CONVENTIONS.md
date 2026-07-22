# Live-data page conventions (for contributors)

You are REWRITING one or more module pages of the Orwell SEO Command Centre to run on
LIVE data. The demo seed layer has been DELETED — pages must never import
`@/data/seed`, `@/data/metrics`, `@/data/keyword-seeds`, or `@/lib/prng` (they no longer
exist). Rewrite each page completely (overwrite the file) using the live hooks below.
Do NOT modify shared files, configs, other pages, or package.json.

## Data access (client hooks)

```ts
import { useLiveDomain, useLivePortfolio } from "@/lib/use-live";
import type { DomainLiveBundle, PortfolioLive, DomainHeadline, OnPageResult, GscTimeseriesPoint, DerivedRecommendation, DS } from "@/lib/live";

const domain = useResolvedDomain();                       // from "@/components/shell/domain-context"
const { data: bundle, loading, error } = useLiveDomain(domain.id);
const { data: pm, loading } = useLivePortfolio();         // portfolio aggregates
```

`bundle.datasets` is `Partial<{...}>` — EVERY dataset may be absent (never synced).
Available keys (each is `DS<T> = { data: T; capturedOn: string; provenance: Provenance }`):

| key | T | notes |
| --- | --- | --- |
| `keywords` | `Keyword[]` | DataForSEO ranked keywords. `competitorPositions` is `{}` (not collected) — do NOT build features on it; `serpFeatures` may be empty; `trend` may be short/empty. |
| `rank_snapshots` | `RankSnapshot[]` | positions today + prevPosition |
| `position_buckets` | `PositionBucket[]` | 1–3 / 4–10 / … buckets |
| `visibility_series` | `{date,value}[]` | accumulates ONE point per sync day — often length 1 at first. If < 2 points, show the single value as a stat, not a line chart. |
| `competitors` | `Competitor[]` | |
| `backlinks` | `Backlink[]` | `toxicity` = spam score 0–100 |
| `referring_domains` | `ReferringDomain[]` | |
| `onpage` | `OnPageResult` | `{ breakdown: HealthBreakdown[], crawlRun: CrawlRun|null, issues: TechnicalIssue[], healthScore: number }`. Issues have `samplePages: []` and aggregate counts — no per-URL lists. |
| `ai_prompts` | `AiPrompt[]` | only pilot domains tracked; others absent |
| `gsc_totals` | `GscTotals` | 28d clicks/impressions/ctr/position |
| `gsc_timeseries` | `GscTimeseriesPoint[]` | 90 REAL daily points — best trend data, use for charts |
| `gsc_queries` | `GscRow[]` | top queries, 28d (`key` = query) |
| `gsc_pages` | `GscRow[]` | top pages, 28d (`key` = URL) |
| `gsc_movers` | `{gains: GscMover[], losses: GscMover[]}` | query movers vs prev 28d |
| `gsc_page_movers` | same | page movers |
| `striking_distance` | `StrikingDistanceRow[]` | queries pos 4–20 with impressions |
| `share_of_market` | `ShareOfMarket \| null` | only domains with a benchmark (mortgagecompare) |
| `ga4_overview` | `Ga4Overview` | organic sessions/users/engagement/conversions — ONLY GA4-mapped domains |
| `ga4_landing_pages` | `Ga4LandingPage[]` | |
| `ga4_channels` | `Ga4ChannelRow[]` | all channels incl. non-organic |
| `recommendations` | `DerivedRecommendation[]` | derived from live signals at sync time |

`bundle.lastSync` (string | null) → pass to `<PageHeader lastSync={bundle?.lastSync ?? null} loading={loading} />`.

Types come from `@/lib/types` (Keyword, RankSnapshot, Backlink, GscRow, etc.) and `@/lib/live`.
Scoring helpers: `computeHealthScore`, `computeAuthorityScore` from `@/lib/scoring` (pure).
Domain registry: `DOMAINS`, `getDomain` from `@/data/domains` (each Domain has `gscSite`,
`ga4PropertyId: string | null`). Report templates: `REPORT_TEMPLATES` from `@/data/report-templates`.
Tracked AI prompts config: `TRACKED_AI_PROMPTS` from `@/data/ai-prompts`.

## Required page states (in this order)

1. `loading && !bundle` → skeletons (`<Skeleton className="h-24" />` grid).
2. `error` → `<EmptyState title="Could not load live data" description={error} />`.
3. Dataset absent → per-section `<EmptyState>` explaining: "Not yet synced — this dataset
   populates on the next scheduled sync" (or for GA4-less domains: "No GA4 property is
   connected for this domain"). NEVER invent numbers. A KPI with no data shows "—".
4. Data present → render it. Numbers real, provenance available per dataset.

## Shared components (reuse — do not re-create)

```ts
import { PageHeader } from "@/components/ui/page-header";        // now takes lastSync/loading
import { SyncBadge } from "@/components/ui/sync-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, SeverityBadge, StatusBadge, DeltaPill, EmptyState, Skeleton, Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { UsageMeter } from "@/components/ui/usage-meter";
import { AreaTrend, MultiLine, BarSeries } from "@/components/charts/charts";
import { Sparkline } from "@/components/charts/sparkline";
import { compactNumber, fullNumber, percent, signedPercent, currency, position } from "@/lib/format";
import { formatDate, relativeFromNow } from "@/lib/dates";
import { cn } from "@/lib/cn";
```

`SourceBadge` still exists in primitives (source/mode props) — you may badge individual
sections with their dataset's `provenance.source`.

## Style (unchanged)

`"use client"` at top; wrap in `<div className="animate-in space-y-5">`; KPI grids
`grid grid-cols-2 gap-3 lg:grid-cols-4`; dense enterprise look; accent via
`var(--accent)`; numbers get `tnum`. Strict TypeScript — `Column<T>` generics must match.
Wrap derived arrays in `useMemo`. When `scope === "portfolio"` on a domain-scoped page,
note it's showing `{domain.name}`.

## Honesty rules

- No fabricated metrics, no placeholder numbers, no fake deltas. If a comparison isn't
  computable from live data, omit the delta.
- Charts need ≥2 points; otherwise show the value as text/stat.
- Label derived insights (recommendations) as "derived from live signals".
