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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-balance text-2xl font-extrabold tracking-[-0.035em] text-ink sm:text-[28px]">{title}</h1>
          <SyncBadge lastSync={lastSync} loading={loading} />
        </div>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
