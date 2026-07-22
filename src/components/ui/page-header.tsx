"use client";

import { SourceBadge } from "./primitives";
import type { DataMode, ProviderSource } from "@/lib/types";

export function PageHeader({
  title,
  description,
  source = "demo",
  mode = "demo",
  actions,
}: {
  title: string;
  description?: string;
  source?: ProviderSource;
  mode?: DataMode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          <SourceBadge source={source} mode={mode} />
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
