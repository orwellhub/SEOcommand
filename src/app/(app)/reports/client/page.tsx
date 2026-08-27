"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Palette, RefreshCw } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ClientReport, type ReportOutcome } from "@/components/reports/client-report";
import { useDomain } from "@/components/shell/domain-context";
import { useLiveDomain } from "@/lib/use-live";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { resolveReportBranding, type ReportBranding } from "@/reports/branding";

export default function ClientReportPage() {
  const searchParams = useSearchParams();
  const { sites, setScope } = useDomain();
  const siteId = searchParams.get("site")?.trim() ?? "";
  const site = sites.find((item) => item.id === siteId);
  const template = REPORT_TEMPLATES.find((item) => item.id === searchParams.get("template")) ?? REPORT_TEMPLATES.find((item) => item.id === "tpl-domain")!;
  const live = useLiveDomain(siteId);
  const [branding, setBranding] = useState<ReportBranding | null>(site ? resolveReportBranding(site) : null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ReportOutcome[]>([]);

  useEffect(() => { if (siteId) setScope(siteId); }, [setScope, siteId]);
  useEffect(() => {
    if (!site) return;
    let active = true;
    setBranding(resolveReportBranding(site));
    fetch(`/api/sites/${encodeURIComponent(site.id)}/settings`)
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("Report branding could not be loaded.")))
      .then((body: { site?: { name?: string; host?: string; accent?: string; siteSettings?: Record<string, unknown> } }) => {
        if (!active || !body.site) return;
        setBranding(resolveReportBranding({ name: body.site.name ?? site.name, host: body.site.host ?? site.host, accent: body.site.accent ?? site.accent, siteSettings: body.site.siteSettings ?? {} }));
        setBrandError(null);
      })
      .catch((error: Error) => { if (active) setBrandError(error.message); });
    return () => { active = false; };
  }, [site]);
  useEffect(() => { if (!siteId) return; const controller = new AbortController(); fetch(`/api/outcomes?site=${encodeURIComponent(siteId)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((body) => setOutcomes(body?.rows ?? [])).catch(() => undefined); return () => controller.abort(); }, [siteId]);

  const title = useMemo(() => `${site?.name ?? "Website"} · ${template.name}`, [site, template.name]);
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);

  if (!siteId || !site) return <div className="py-12"><EmptyState title="Choose a website" description="Client reports are generated for one website so its branding, data and recommendations remain coherent." /></div>;
  if (live.loading && !live.data) return <div className="space-y-5"><Skeleton className="h-14" /><Skeleton className="mx-auto h-[760px] max-w-[940px]" /></div>;
  if (live.error && !live.data) return <div className="py-12"><EmptyState title="Report data could not be loaded" description={live.error} /></div>;
  if (!live.data || !branding) return <div className="py-12"><EmptyState title="Report unavailable" description="The website has no reportable snapshot yet." /></div>;

  return <div className="report-studio space-y-5 pb-12">
    <div className="report-toolbar sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-card backdrop-blur">
      <div className="flex min-w-0 items-center gap-3"><Link href={`/reports?site=${site.id}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-ink" aria-label="Back to reports"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0"><div className="truncate text-sm font-extrabold text-ink">{template.name}</div><div className="truncate text-2xs text-muted">{site.name} · client-ready preview</div></div></div>
      <div className="flex items-center gap-2"><Button size="sm" onClick={live.refresh}><RefreshCw className="h-3.5 w-3.5" />Refresh data</Button><Link href={`/sites/${site.id}/settings?tab=reporting`} className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-ink transition-colors hover:bg-workspace"><Palette className="h-3.5 w-3.5" />Branding</Link><Button variant="primary" size="sm" onClick={() => window.print()}><Download className="h-3.5 w-3.5" />Save PDF</Button></div>
    </div>
    {brandError && <div className="report-toolbar rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-xs text-[#9A6B08]">{brandError} The website’s default identity is being used.</div>}
    <ClientReport site={site} template={template} branding={branding} bundle={live.data} outcomes={outcomes} />
  </div>;
}
