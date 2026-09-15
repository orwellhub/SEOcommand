"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileWarning, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import {ReportTabs,ReportMetric,useReportView} from "@/components/reports/report-layout";
import {AuditPageWorkspace} from "@/components/reports/audit-page-workspace";
import {AUDIT_THEMES} from "@/lib/audit-pages";
import {AuditHistory} from "@/components/reports/audit-history";
import {ON_PAGE_ISSUE_CHECKS} from "@/providers/dataforseo/normalizers";
import {
  Card,
  SeverityBadge,
  EmptyState,
  Skeleton,
  Button,
} from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ScopeNote } from "@/components/ui/scope-note";
import { Drawer, DrawerField } from "@/components/ui/drawer";
import { useDomain, useResolvedDomain } from "@/components/shell/domain-context";
import { useScopedLive } from "@/lib/use-live";
import { formatDate } from "@/lib/dates";
import { fullNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Severity, TechnicalIssue } from "@/lib/types";
import { SiteFindingWorkDrawer, type SiteFinding } from "@/components/workflow/site-finding-work-drawer";

interface CrawlPageRow {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  canonical: string | null;
  wordCount: number | null;
  depth: number | null;
  loadTimeMs: number | null;
  checks: Record<string, boolean | number | string>;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_FILTERS: Array<"all" | "errors" | Severity> = ["all", "errors", "critical", "high", "medium", "low"];

export default function SiteAuditPage() {
  const domain = useResolvedDomain();
  const { scope } = useDomain();
  const [view,setView]=useReportView(["overview","issues","pages","statistics","compare","progress","thematic"] as const,"overview");
  const [category,setCategory]=useState("");
  const [theme,setTheme]=useState("crawlability");
  const [pageStatus,setPageStatus]=useState("");
  const [selectedPage,setSelectedPage]=useState<CrawlPageRow|null>(null);
  const [pagesError,setPagesError]=useState("");
  const [loadingPages,setLoadingPages]=useState(false);
  const { data: bundle, loading, error, isPortfolio, scopeLabel, scopeHost, scopeId } = useScopedLive();

  const [severityFilter, setSeverityFilter] = useState<"all" | "errors" | Severity>("all");
  const [selected, setSelected] = useState<TechnicalIssue | null>(null);
  const [workFinding, setWorkFinding] = useState<SiteFinding | null>(null);
  const [crawlPages, setCrawlPages] = useState<CrawlPageRow[]>([]);
  const [crawlPageTotal, setCrawlPageTotal] = useState(0);
  const pagesController = useRef<AbortController | null>(null);

  useEffect(() => {
    pagesController.current?.abort();
    setLoadingPages(false);
    if (isPortfolio || !scopeId) {
      setCrawlPages([]);
      setCrawlPageTotal(0);
      return;
    }
    const controller=new AbortController();pagesController.current=controller;setCrawlPages([]);setCrawlPageTotal(0);setPagesError("");setSelected(null);setSelectedPage(null);setCategory("");
    fetch(`/api/crawls/${scopeId}/pages?limit=250`,{signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error??"Crawled pages could not load.");return body;})
      .then(body=>{setCrawlPages(body.pages??[]);setCrawlPageTotal(body.total??0);})
      .catch(e=>{if(e.name!=="AbortError")setPagesError(e.message);});
    return()=>controller.abort();
  }, [isPortfolio, scopeId]);

  const onpage = bundle?.datasets.onpage?.data ?? null;
  const crawlRun = onpage?.crawlRun ?? null;

  const issues = useMemo<TechnicalIssue[]>(() => onpage?.issues ?? [], [onpage]);

  const criticalHigh = useMemo(
    () => issues.filter((i) => i.severity === "critical" || i.severity === "high").length,
    [issues],
  );

  const filteredIssues = useMemo(
    () => issues.filter(i=>(severityFilter === "all" || severityFilter === "errors" && (i.severity === "critical" || i.severity === "high") || i.severity === severityFilter)&&(!category||category.split("|").includes(i.category))),
    [issues, severityFilter, category],
  );

  const issueColumns = useMemo<Column<TechnicalIssue>[]>(
    () => [
      {
        key: "severity",
        header: "Severity",
        width: "108px",
        sortValue: (r) => SEVERITY_RANK[r.severity],
        render: (r) => <SeverityBadge severity={r.severity} />,
      },
      {
        key: "title",
        header: "Issue",
        sortValue: (r) => r.title,
        render: (r) => <span className="font-medium text-ink">{r.title}</span>,
      },
      {
        key: "category",
        header: "Category",
        sortValue: (r) => r.category,
        render: (r) => <span className="text-muted">{r.category}</span>,
      },
      {
        key: "affectedPages",
        header: "Affected pages",
        align: "right",
        sortValue: (r) => r.affectedPages,
        render: (r) => fullNumber(r.affectedPages),
      },
      {
        key: "lastSeen",
        header: "Last seen",
        align: "right",
        width: "128px",
        sortValue: (r) => r.lastSeen,
        render: (r) => <span className="text-muted">{formatDate(r.lastSeen)}</span>,
      },
    ],
    [],
  );

  const pageColumns = useMemo<Column<CrawlPageRow>[]>(() => [
    { key: "url", header: "URL", sortValue: (row) => row.url, render: (row) => <span className="block max-w-[420px] truncate font-medium text-ink" title={row.url}>{row.url}</span> },
    { key: "status", header: "Status", align: "right", sortValue: (row) => row.statusCode ?? 0, render: (row) => <span className={row.statusCode && row.statusCode >= 400 ? "font-medium text-critical" : "text-ink"}>{row.statusCode ?? "—"}</span> },
    { key: "title", header: "Title", sortValue: (row) => row.title ?? "", render: (row) => <span className="block max-w-[260px] truncate text-muted" title={row.title ?? ""}>{row.title || "—"}</span> },
    { key: "words", header: "Words", align: "right", sortValue: (row) => row.wordCount ?? 0, render: (row) => row.wordCount == null ? "—" : fullNumber(row.wordCount) },
    { key: "depth", header: "Depth", align: "right", sortValue: (row) => row.depth ?? 0, render: (row) => row.depth ?? "—" },
    { key: "load", header: "Load", align: "right", sortValue: (row) => row.loadTimeMs ?? 0, render: (row) => row.loadTimeMs == null ? "—" : `${row.loadTimeMs} ms` },
    { key: "checks", header: "Failed checks", align: "right", sortValue: (row) => ON_PAGE_ISSUE_CHECKS.filter(key=>row.checks[key]===true || typeof row.checks[key]==="number"&&Number(row.checks[key])>0).length, render: (row) => ON_PAGE_ISSUE_CHECKS.filter(key=>row.checks[key]===true || typeof row.checks[key]==="number"&&Number(row.checks[key])>0).length },
  ], []);

  const visiblePages=crawlPages.filter(row=>!pageStatus||pageStatus==="unknown"? !pageStatus||row.statusCode==null : row.statusCode!=null&&Math.floor(row.statusCode/100)===Number(pageStatus));
  async function loadMorePages(){const controller=pagesController.current;if(!controller||controller.signal.aborted||loadingPages)return;setLoadingPages(true);setPagesError("");try{const response=await fetch(`/api/crawls/${scopeId}/pages?limit=250&offset=${crawlPages.length}`,{signal:controller.signal});const body=await response.json();if(!response.ok)throw new Error(body.error);if(controller.signal.aborted)return;setCrawlPages(current=>[...new Map([...current,...(body.pages??[])].map(row=>[row.id,row])).values()]);setCrawlPageTotal(body.total??0);}catch(e){if(!controller.signal.aborted)setPagesError(e instanceof Error?e.message:"Could not load more pages.");}finally{if(!controller.signal.aborted)setLoadingPages(false);}}
  function technicalFinding(issue: TechnicalIssue): SiteFinding {
    const priorityScore = issue.severity === "critical" ? 95 : issue.severity === "high" ? 82 : issue.severity === "medium" ? 65 : 45;
    return {
      key: `technical:${issue.id}`,
      title: issue.title,
      module: "Technical",
      executionType: "technical_task",
      priorityScore,
      pageMode: issue.samplePages.length ? "existing_page" : "site_wide",
      targetUrl: issue.samplePages[0],
      evidenceLabel: `${fullNumber(issue.affectedPages)} affected page${issue.affectedPages === 1 ? "" : "s"} · ${issue.severity} severity`,
      sourceUrl: `/site-audit?site=${encodeURIComponent(domain.id)}`,
      sourceEvidence: { kind: "technical_issue", issueId: issue.id, category: issue.category, severity: issue.severity, explanation: issue.explanation, evidence: issue.evidence, recommendedFix: issue.recommendedFix, potentialImpact: issue.potentialImpact, affectedPages: issue.affectedPages, samplePages: issue.samplePages, firstSeen: issue.firstSeen, lastSeen: issue.lastSeen },
    };
  }

  if (loading && !bundle) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Site Audit"
          description="Provider audit score, crawl coverage and prioritised technical issues."
          lastSync={null}
          loading
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Skeleton className="h-72 xl:col-span-3" />
          <Skeleton className="h-72 xl:col-span-2" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-in space-y-5">
        <PageHeader
          title="Site Audit"
          description="Provider audit score, crawl coverage and prioritised technical issues."
          lastSync={null}
        />
        <EmptyState title="Could not load live data" description={error} />
      </div>
    );
  }

  return (
    <div className="animate-in space-y-5">
      <PageHeader
        title={`Site Audit: ${scopeHost}`}
        actions={<><Link className="rounded border border-border px-3 py-2 text-xs text-purple" href={`/scan-centre?site=${scopeId}`}>Rerun campaign</Link><Link className="rounded border border-border px-3 py-2 text-xs" href={`/sites/${scopeId}/settings`}>Settings</Link><Button size="sm" onClick={()=>window.print()}>Export PDF</Button></>}
        lastSync={bundle?.datasets.onpage?.provenance.collectedAt ?? null}
        loading={loading}
      />

      <ScopeNote isPortfolio={isPortfolio} noun="audit data" />

      {view!=="thematic"&&view!=="compare"&&<div className="flex flex-wrap items-center gap-3 text-xs text-muted"><span>Last crawl: {crawlRun?.completedAt?formatDate(crawlRun.completedAt):"Not completed"}</span><span>Status: {crawlRun?.status??"Not configured"}</span><span>{crawlRun?.pagesCrawled??"—"} pages crawled</span></div>}
      <ReportTabs items={[{id:"overview",label:"Overview"},{id:"issues",label:"Issues"},{id:"pages",label:"Crawled Pages"},{id:"statistics",label:"Statistics"},{id:"compare",label:"Compare Crawls"},{id:"progress",label:"Progress"},{id:"thematic",label:"Thematic Reports"}]} value={view} onChange={setView} label="Site Audit reports"/>
      {view==="overview"&&<>
        <div className="grid gap-4 xl:grid-cols-3"><Card className="p-4"><h2 className="text-base font-semibold">Site Health</h2><div className="relative mx-auto my-5 flex h-36 w-36 items-center justify-center rounded-full p-3" style={{background:`conic-gradient(var(--chart-orange) ${Math.max(0,Math.min(100,onpage?.healthScore??0))}%, rgb(var(--border)) 0)`}}><strong className="flex h-full w-full items-center justify-center rounded-full bg-card text-4xl font-semibold">{onpage?`${onpage.healthScore}%`:"—"}</strong></div><p className="text-xs leading-5 text-muted">DataForSEO overall score. Its calculation differs from Semrush’s Site Health score.</p></Card>
          <Card className="p-4"><h2 className="text-base font-semibold">Crawled Pages</h2><ReportMetric label="Pages crawled" value={crawlRun?.pagesCrawled}/><div className="space-y-2">{[["2","Successful responses"],["3","Redirects"],["4","Client errors"],["5","Server errors"]].map(([code,label])=><button key={code} className="flex w-full justify-between text-xs hover:text-purple" onClick={()=>{setPageStatus(code);setView("pages");}}><span>{label}</span><strong>{crawlPages.length?crawlPages.filter(row=>row.statusCode!=null&&Math.floor(row.statusCode/100)===Number(code)).length:"—"}</strong></button>)}</div><p className="mt-4 text-[11px] text-muted">Response breakdown covers {crawlPages.length} loaded page records.</p></Card>
          <Card className="p-4"><h2 className="text-base font-semibold">Top Issues</h2>{[...issues].sort((a,b)=>SEVERITY_RANK[b.severity]-SEVERITY_RANK[a.severity]||b.affectedPages-a.affectedPages).slice(0,4).map(issue=><button key={issue.id} className="flex w-full items-center justify-between gap-3 border-b border-border py-4 text-left text-xs text-purple" onClick={()=>setSelected(issue)}><span>{issue.title}</span><strong>{issue.affectedPages}</strong></button>)}{!issues.length&&<p className="my-6 text-xs text-muted">{onpage?"No issue types reported by the saved audit.":"Run a crawl to collect issue evidence."}</p>}<Button size="sm" className="mt-4" onClick={()=>{setCategory("");setView("issues");}}>View all issues</Button></Card></div>
        <Card className="grid divide-x divide-border md:grid-cols-3"><button className="text-left" onClick={()=>{setSeverityFilter("errors");setView("issues");}}><ReportMetric label="Errors" value={onpage?criticalHigh:null} note="Critical and high severity issue types"/></button><button className="text-left" onClick={()=>{setSeverityFilter("medium");setView("issues");}}><ReportMetric label="Warnings" value={onpage?issues.filter(row=>row.severity==="medium").length:null} note="Medium severity issue types"/></button><button className="text-left" onClick={()=>{setSeverityFilter("low");setView("issues");}}><ReportMetric label="Notices" value={onpage?issues.filter(row=>row.severity==="low").length:null} note="Low severity issue types"/></button></Card>
        <h2 className="text-lg font-semibold">Thematic Reports</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{AUDIT_THEMES.map(report=><Card key={report.id} className="p-4"><h3 className="text-sm font-semibold">{report.label}</h3><p className="my-4 text-xs text-muted">Completed crawl evidence, check coverage and affected URLs.</p><Button size="sm" onClick={()=>{setTheme(report.id);setView("thematic");}}>View details →</Button></Card>)}</div>
      </>}
      {view==="progress"&&<AuditHistory key={scopeId} site={scopeId} view="progress"/>}
      {view==="compare"&&<><AuditPageWorkspace key={scopeId} site={scopeId} compare/><details><summary className="cursor-pointer text-xs text-purple">Compare summary issue counts</summary><AuditHistory site={scopeId} view="compare"/></details></>}
      {view==="thematic"&&<AuditPageWorkspace key={`${scopeId}:${theme}`} site={scopeId} initialTheme={theme}/>}
      {view==="statistics"&&<div className="grid gap-4 xl:grid-cols-2">{[{title:"HTTP Status Codes",buckets:["2xx","3xx","4xx","5xx","Unknown"],key:(row:CrawlPageRow)=>row.statusCode==null?"Unknown":`${Math.floor(row.statusCode/100)}xx`},{title:"Crawl Depth",buckets:["0","1","2","3","4+","Unknown"],key:(row:CrawlPageRow)=>row.depth==null?"Unknown":row.depth>=4?"4+":String(row.depth)},{title:"Word Count",buckets:["0–299","300–999","1,000+","Unknown"],key:(row:CrawlPageRow)=>row.wordCount==null?"Unknown":row.wordCount<300?"0–299":row.wordCount<1000?"300–999":"1,000+"},{title:"Page Load Time",buckets:["Under 1s","1–3s","Over 3s","Unknown"],key:(row:CrawlPageRow)=>row.loadTimeMs==null?"Unknown":row.loadTimeMs<1000?"Under 1s":row.loadTimeMs<=3000?"1–3s":"Over 3s"}].map(stat=><Card key={stat.title} className="p-4"><h2 className="mb-4 text-base font-semibold">{stat.title}</h2>{stat.buckets.map(bucket=>{const count=crawlPages.filter(row=>stat.key(row)===bucket).length;return <div key={bucket} className="my-3"><div className="mb-1 flex justify-between text-xs"><span>{bucket}</span><span>{count}</span></div><div className="h-2 rounded bg-workspace"><div className="h-2 rounded bg-purple" style={{width:`${crawlPages.length?count/crawlPages.length*100:0}%`}}/></div></div>;})}<p className="mt-4 text-[11px] text-muted">{crawlPages.length} loaded page records of {crawlPageTotal}. Missing values are kept separate.</p></Card>)}</div>}
      {/* Issues table */}
      {view === "issues" && <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-ink">Technical issues</h3>
          </div>
          <div className="flex rounded-md border border-border bg-workspace p-0.5">
            {SEVERITY_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  severityFilter === s ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <select aria-label="Issue category" className="mb-3 h-9 rounded border border-border bg-card px-2 text-xs" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{category&&!issues.some(row=>row.category===category)&&<option value={category}>{category.replace(/\|/g," / ")}</option>}{[...new Set(issues.map(row=>row.category))].map(value=><option key={value}>{value}</option>)}</select>
        {!onpage ? (
          <EmptyState
            title="No crawl completed yet"
            description="Issues appear here when the first OnPage crawl finishes."
          />
        ) : filteredIssues.length === 0 ? (
          <EmptyState
            title={
              severityFilter === "all" ? "No issues detected" : "No issues match this severity"
            }
            description={
              severityFilter === "all"
                ? "The latest crawl did not report any technical issues."
                : "Try a different severity — or select all to see every detected issue."
            }
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        ) : (
          <DataTable
            rows={filteredIssues}
            columns={issueColumns}
            searchKeys={(r) => `${r.title} ${r.category}`}
            searchPlaceholder="Search issues…"
            exportName={`site-audit-issues-${scopeId}`}
            onRowClick={setSelected}
            pageSize={12}
          />
        )}
      </Card>}

      {!isPortfolio && view === "pages" && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">Crawled Pages</h3>
              <p className="mt-0.5 text-2xs text-muted">URL-level metadata, response codes, crawl depth, loading time and every OnPage check.</p>
            </div>
            <span className="text-2xs text-muted">Showing {crawlPages.length} of {crawlPageTotal.toLocaleString()} pages</span>
          </div>
          {pagesError&&<p role="alert" className="mb-3 text-sm text-critical">{pagesError}</p>}<select aria-label="HTTP status filter" className="mb-3 h-9 rounded border border-border bg-card px-2 text-xs" value={pageStatus} onChange={e=>setPageStatus(e.target.value)}><option value="">All status codes</option>{["2","3","4","5"].map(code=><option key={code} value={code}>{code}xx</option>)}<option value="unknown">Unknown</option></select>
          {crawlPages.length ? <DataTable rows={visiblePages} columns={pageColumns} onRowClick={setSelectedPage} searchKeys={(row) => `${row.url} ${row.title ?? ""} ${row.canonical ?? ""}`} searchPlaceholder="Search crawled URLs…" exportName={`crawl-pages-${scopeId}`} pageSize={25} /> : <EmptyState title="No page-level crawl data yet" description="Detailed pages appear after the next full technical crawl completes." />}
        </Card>
      )}

      {!isPortfolio && (view==="pages"||view==="statistics")&&crawlPages.length<crawlPageTotal&&<Button disabled={loadingPages} onClick={()=>void loadMorePages()}>{loadingPages?"Loading…":`Load next ${Math.min(250,crawlPageTotal-crawlPages.length)} page records`}</Button>}
      <Drawer open={!!selectedPage} onClose={()=>setSelectedPage(null)} title="Crawled page" subtitle={selectedPage?.url}>{selectedPage&&<div className="space-y-4"><DrawerField label="URL"><a href={selectedPage.url} target="_blank" rel="noreferrer" className="break-all text-purple">{selectedPage.url}</a></DrawerField><DrawerField label="Canonical">{selectedPage.canonical??"Not recorded"}</DrawerField><DrawerField label="Title">{selectedPage.title??"Not recorded"}</DrawerField><h3 className="text-sm font-semibold">Provider check values</h3><p className="text-xs text-muted">True does not always mean a problem. Positive checks such as HTTPS and canonical are reported as recorded.</p>{Object.entries(selectedPage.checks).map(([key,value])=><div key={key} className="flex justify-between gap-4 border-b border-border py-2 text-xs"><span>{key.replace(/_/g," ")}</span><strong>{String(value)}</strong></div>)}</div>}</Drawer>
      {/* Issue detail drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={
          selected
            ? `${selected.category} · ${fullNumber(selected.affectedPages)} page${
                selected.affectedPages === 1 ? "" : "s"
              } affected`
            : undefined
        }
        footer={!isPortfolio && selected ? <div className="flex items-center justify-between gap-3"><span className="text-[12px] text-muted">Carry this issue and its affected URL into the website workflow.</span><Button variant="primary" onClick={() => { setWorkFinding(technicalFinding(selected)); setSelected(null); }}><ListTodo className="h-4 w-4" />Create work</Button></div> : undefined}
      >
        {selected && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <SeverityBadge severity={selected.severity} />
            </div>
            <DrawerField label="Explanation">{selected.explanation}</DrawerField>
            <DrawerField label="Evidence">{selected.evidence}</DrawerField>
            <DrawerField label="Recommended fix">{selected.recommendedFix}</DrawerField>
            <DrawerField label="Potential impact">{selected.potentialImpact}</DrawerField>
            <div className="grid grid-cols-2 gap-2">
              <DrawerField label="First seen">{formatDate(selected.firstSeen)}</DrawerField>
              <DrawerField label="Last seen">{formatDate(selected.lastSeen)}</DrawerField>
            </div>
            <DrawerField label="Affected pages">
              <span className="tnum">{fullNumber(selected.affectedPages)}</span>
            </DrawerField>
          </div>
        )}
      </Drawer>
      <SiteFindingWorkDrawer finding={workFinding} siteSlug={domain.id} siteName={domain.name} onClose={() => setWorkFinding(null)} />
    </div>
  );
}
