"use client";

import { SyncBadge } from "./sync-badge";

export function PageHeader({
  title,
  description,
  lastSync,
  loading = false,
  actions,
}: {
  title: string;
  description?: string;
  /** Latest sync timestamp for the data this page renders (null = never). */
  lastSync?: string | null;
  loading?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          <SyncBadge lastSync={lastSync} loading={loading} />
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
