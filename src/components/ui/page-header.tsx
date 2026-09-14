"use client";
import { SyncBadge } from "./sync-badge";
export function PageHeader({ title, description, lastSync, loading = false, actions }: { title: string; description?: string; lastSync?: string | null; loading?: boolean; actions?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 className="break-words text-[23px] font-bold leading-8 tracking-[-0.025em] text-ink">{title}</h1>{lastSync !== undefined && <SyncBadge lastSync={lastSync} loading={loading} />}</div>{description && <p className="mt-1 max-w-4xl text-[13px] leading-5 text-muted">{description}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>;
}
