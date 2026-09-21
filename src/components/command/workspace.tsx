"use client";
import { ResearchEvidencePanel } from "@/components/research/evidence-panel";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDomain } from "@/components/shell/domain-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useJson } from "@/lib/use-live";
import type { SiteCommand } from "@/lib/command-model";
import { PagesView } from "./pages-view";
import { HealthView } from "./health-view";
import { PerformanceView, OverlapView } from "./performance-view";
import { Empty } from "./shared";
import styles from "./command.module.css";

export function CommandWorkspace({ area }: { area: "pages" | "health" | "performance" }) {
  const { activeDomain, scope } = useDomain();
  if (!activeDomain) return area === "performance" ? <OverlapView scope={scope} /> : <Empty>Choose a website to view its saved evidence.</Empty>;
  return <SiteWorkspace key={`${area}:${activeDomain.id}`} site={activeDomain.id} area={area} />;
}
function SiteWorkspace({ site, area }: { site: string; area: "pages" | "health" | "performance" }) {
  const params = useSearchParams();
  const state = useJson<SiteCommand>(`/api/command?site=${encodeURIComponent(site)}`, 0);
  const tabs = area === "health" ? [["issues", "Grouped issues"], ["indexing", "Google indexing"], ["speed", "Speed"], ["watchlist", "Watchlist"], ["ai", "AI readiness"], ["launch", "Launch checks"]] : area === "performance" ? [["trends", "Trends & seasonality"], ["brand", "Brand & non-brand"], ["business", "Business results"], ["timeline", "Change timeline"], ["overlap", "Website overlap"]] : [];
  const view = tabs.some(([id]) => id === params.get("view")) ? params.get("view")! : tabs[0]?.[0] ?? "pages";
  const pending = state.data?.records.some((row) => ["queued", "running"].includes(row.status));
  const refresh = state.refresh;
  useEffect(() => { if (!pending) return; const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 6000); return () => window.clearInterval(timer); }, [pending, refresh]);
  return <div className={styles.stack}><PageHeader title={area === "pages" ? "Pages" : tabs.find(([id]) => id === view)?.[1] ?? "Performance"} description={area === "pages" ? "Performance, issues and work connected to each page." : area === "health" ? "Investigate shared causes, inspect important pages and verify improvements." : "Understand search demand, recorded business results and changes over time."} actions={<Button onClick={refresh} disabled={state.loading}>Reload saved data</Button>} />{state.error && <p role="alert" className="text-sm text-critical">Saved evidence could not load. <button onClick={refresh} className="underline">Try again</button></p>}{!state.data ? state.loading ? <Skeleton className="h-72" /> : null : <>{state.data.synthetic && <p className="text-xs text-muted">Sample data · local QA workspace</p>}{!state.data.storageAvailable && <p className="text-sm text-warning">The database is unavailable. Saving and new checks require a database connection.</p>}{area === "pages" ? <PagesView data={state.data} refresh={refresh} /> : area === "health" ? <HealthView data={state.data} view={view} refresh={refresh} /> : view === "trends" ? <ResearchEvidencePanel features={["trends"]} /> : <PerformanceView data={state.data} view={view} refresh={refresh} />}</>}</div>;
}
