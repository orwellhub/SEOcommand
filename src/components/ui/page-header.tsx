"use client";

import { SyncBadge } from "./sync-badge";
import { usePathname } from "next/navigation";

const MODULES = [
  { match: ["/keyword", "/rankings", "/research"], label: "Search intelligence", color: "#335CFF" },
  { match: ["/competitor"], label: "Competitive intelligence", color: "#FF6B5E" },
  { match: ["/site-audit", "/technical-crawler", "/monitoring"], label: "Technical operations", color: "#5965D8" },
  { match: ["/backlink", "/link-building"], label: "Authority & links", color: "#16A879" },
  { match: ["/ai-visibility"], label: "AI visibility", color: "#7137F5" },
  { match: ["/local-seo"], label: "Local search", color: "#E46A45" },
  { match: ["/reports"], label: "Reporting studio", color: "#12B8C4" },
  { match: ["/scan-centre"], label: "Evidence collection", color: "#F2B544" },
];

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
  const pathname = usePathname();
  const moduleStyle = MODULES.find((item) => item.match.some((prefix) => pathname.startsWith(prefix)));
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {moduleStyle && <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: moduleStyle.color }} />{moduleStyle.label}</div>}
        <div className="flex items-center gap-2.5">
          <h1 className="text-balance text-2xl font-extrabold tracking-[-0.035em] text-ink sm:text-[28px]">{title}</h1>
          {lastSync !== undefined && <SyncBadge lastSync={lastSync} loading={loading} />}
        </div>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
