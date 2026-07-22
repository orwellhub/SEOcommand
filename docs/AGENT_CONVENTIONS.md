# Module build conventions (for contributors)

You are building ONE page module for the Orwell SEO Command Centre. The app shell,
design system, data and shared components already exist and MUST be reused. Do NOT
modify any shared file, package.json, config, or another module's page. Only create
the file(s) you are told to create.

## Page file shape

- Path: `src/app/(app)/<module>/page.tsx`
- MUST start with `"use client";`
- Default-export a React component.
- Wrap content in `<div className="animate-in space-y-5"> … </div>`.
- Start with `<PageHeader title=… description=… />` (source defaults to demo).
- Read the selected domain via the domain context.

## Domain scope

```ts
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
const domain = useResolvedDomain();      // always a Domain (falls back to first pilot in portfolio scope)
const { scope, activeDomain } = useDomain();
```

Most modules operate on a single domain — use `useResolvedDomain()` and read
`domain.id`. When `scope === "portfolio"` and the module is domain-specific, show a
small note that it is showing `{domain.name}` and data follows the rail selection.

## Data accessors (all synchronous, deterministic)

```ts
import { SEED } from "@/data/seed";
SEED.keywords[domainId]           // Keyword[]
SEED.keywordLists[domainId]       // KeywordList[]
SEED.rankSnapshots[domainId]      // RankSnapshot[]
SEED.positionBuckets[domainId]    // PositionBucket[]
SEED.visibility[domainId]         // { date, value }[]
SEED.competitors[domainId]        // Competitor[]
SEED.technicalIssues[domainId]    // TechnicalIssue[]
SEED.healthBreakdown[domainId]    // HealthBreakdown[]
SEED.crawlRuns[domainId]          // CrawlRun[]
SEED.backlinks[domainId]          // Backlink[]
SEED.referringDomains[domainId]   // ReferringDomain[]
SEED.aiPrompts[domainId]          // AiPrompt[]
SEED.recommendations[domainId]    // Recommendation[]
SEED.tasks[domainId]              // Task[]
SEED.content[domainId]            // ContentItem[]
SEED.reportTemplates              // ReportTemplate[]
SEED.schedules                    // ReportSchedule[]
SEED.usageLedger                  // UsageLedgerEntry[]
SEED.providerConnections          // ProviderConnection[]
SEED.alerts                       // AlertItem[]

import { domainMetrics, portfolioMetrics, orwellAuthorityScore, winnersLosers, clicksSeries } from "@/data/metrics";
import { healthScore } from "@/data/seed";
import { DOMAINS, getDomain } from "@/data/domains";
```

Types are in `@/lib/types`. Wrap any derived arrays in `useMemo`.

## Shared components (import and reuse — do not re-create)

```ts
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, SectionTitle, SeverityBadge, StatusBadge, SourceBadge, DeltaPill, EmptyState, Skeleton, Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { UsageMeter } from "@/components/ui/usage-meter";
import { AreaTrend, MultiLine, BarSeries } from "@/components/charts/charts";
import { Sparkline } from "@/components/charts/sparkline";
import { compactNumber, fullNumber, percent, signedPercent, currency, position } from "@/lib/format";
import { formatDate, relativeFromNow } from "@/lib/dates";
import { cn } from "@/lib/cn";
```

Icons: `lucide-react`.

### DataTable usage

```tsx
const cols: Column<Row>[] = [
  { key: "name", header: "Name", sortValue: (r) => r.name, render: (r) => r.name },
  { key: "vol", header: "Volume", align: "right", sortValue: (r) => r.volume, render: (r) => fullNumber(r.volume) },
];
<DataTable rows={rows} columns={cols} searchKeys={(r) => r.name} exportName="file" onRowClick={setSelected} pageSize={12} />
```

- `align: "right"` for numbers (they get tabular-nums automatically).
- Provide `sortValue` for every sortable column and `searchKeys` for search.
- Use `onRowClick` to open a `<Drawer>` for row detail (do not navigate away).

## Design tokens / classes

- Card surface: `<Card className="p-4">`. Section titles: `text-sm font-semibold text-ink`.
- Colours (Tailwind): `text-ink`, `text-muted`, `bg-workspace`, `bg-card`, `border-border`,
  `text-purple`, `text-success`, `text-warning`, `text-critical`. Active domain accent is the
  CSS var `var(--accent)` (also `text-[color:var(--accent)]`, `bg-[color:var(--accent)]`).
- Numbers: add `tnum` class for tabular figures.
- Grid rows of KPIs: `grid grid-cols-2 gap-3 lg:grid-cols-4`.
- Keep it dense, professional, 1px borders, restrained. No gradients/hero sections.

## States

Include at least an empty-state where a table/list can be empty (`<EmptyState />`).
Everything is demo data — the PageHeader badge communicates this globally; no need to
fabricate loading spinners for synchronous seed reads.

## Must compile

Strict TypeScript. Run nothing (no build) — just write correct, typed code. Ensure all
imports resolve to the paths above and all `Column<T>` generics match your row type.
