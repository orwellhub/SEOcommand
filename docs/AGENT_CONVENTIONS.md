# Module build conventions

The platform is live-data only. New pages must read canonical snapshots through
`useLiveDomain()` or `useLivePortfolio()` and must never fabricate analytical values.

## Page structure

- Pages live at `src/app/(app)/<module>/page.tsx` and use the existing `AppShell`.
- Interactive pages start with `"use client"` and use `PageHeader`, `Card`, `KpiCard`,
  `DataTable`, `Drawer`, `EmptyState` and the existing chart wrappers.
- Domain-specific pages use `useResolvedDomain()` and explain which domain is shown when
  portfolio scope is active.
- Every asynchronous surface needs loading, error and awaiting-first-sync states.
- Display provenance from the dataset wrapper; do not label inferred data as provider data.

## Data and mutations

- Provider calls run only in the sync process. Browser pages read `/api/live/*`.
- Mutation routes validate input with Zod and use `canWrite()` for role enforcement.
- Workflow decisions and report schedules use the FK-free runtime tables keyed by domain slug.
- Do not expose provider credentials through `NEXT_PUBLIC_*`, API payloads or logs.
- DataForSEO calls must go through `DataForSeoClient` and its spend guard.

## Quality gate

Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`. Schema changes
must include a generated Drizzle migration and snapshot metadata.
