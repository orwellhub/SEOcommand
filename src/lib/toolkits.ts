import { Activity, FileText, Globe2, LayoutDashboard, ListChecks, MapPinned, Search, Sparkles, TrendingUp } from "lucide-react";
import type { NavItem } from "./nav";

export interface ToolkitGroup { label: string; items: NavItem[] }
export interface Toolkit { id: string; label: string; icon: NavItem["icon"]; href: string; groups: ToolkitGroup[] }
const tool = (href: string, label: string, aliases: string[] = []): NavItem => ({ href, label, aliases, icon: Search, group: "site" });

/** Full tool names stay visible in the second navigation column. */
export const TOOLKITS: Toolkit[] = [
  { id: "home", label: "Home", icon: LayoutDashboard, href: "/portfolio?scope=portfolio", groups: [
    { label: "Workspace", items: [tool("/portfolio?scope=portfolio", "Portfolio overview"), tool("/sites", "Websites"), tool("/research?workspace=global", "Research library"), tool("/settings", "Settings & connections")] },
  ] },
  { id: "seo", label: "SEO", icon: TrendingUp, href: "/portfolio", groups: [
    { label: "", items: [tool("/portfolio", "SEO Dashboard")] },
    { label: "Site Performance", items: [tool("/site-audit", "Site Audit"), tool("/rankings", "Position Tracking", ["rankings"])] },
    { label: "Competitive Analysis", items: [tool("/domain-research", "Domain Overview"), tool("/competitors", "Organic Rankings", ["competitors", "keyword gap"]), tool("/competitors?view=pages", "Top Pages"), tool("/pages", "Your Website Pages"), tool("/compare-domains", "Compare Domains"), tool("/competitors?view=competitors", "Organic Competitors"), tool("/keyword-gap", "Keyword Gap"), tool("/link-building?view=gap#link-gap", "Backlink Gap"), tool("/advertising", "Advertising Research",["paid keywords","ads history","ad copies"]), tool("/market-intelligence", "Market Insights")] },
    { label: "Keyword Research", items: [tool("/keyword-research", "Keyword Overview", ["bulk keyword analysis"]), tool("/keyword-research?view=discover", "Keyword Magic Tool"), tool("/keyword-strategy", "Keyword Strategy Builder"), tool("/questions", "Customer Questions", ["people also ask", "paa"]), tool("/keyword-research?view=autocomplete", "Autocomplete Suggestions"), tool("/keyword-research?view=lists", "Saved Keywords"), tool("/keyword-research?view=projects", "Research Projects"), tool("/keyword-research?view=tracking", "Tracking Setup")] },
    { label: "Content Ideas", items: [tool("/content?view=editor", "SEO Writing Assistant"), tool("/topic-research", "Topic Research"), tool("/content-template", "SEO Content Template")] },
    { label: "Link Building", items: [tool("/backlinks", "Backlinks"), tool("/backlinks?view=referring", "Referring Domains"), tool("/backlink-audit", "Backlink Audit"), tool("/backlinks?view=network", "Network Graph"), tool("/backlinks?view=pages", "Indexed Pages"), tool("/backlinks?view=recovery", "Broken Backlink Recovery"), tool("/backlinks?view=outbound", "Outbound Domains"), tool("/backlinks?view=bulk", "Bulk Analysis"), tool("/backlinks?view=research&feature=links", "Deeper Backlink Research"), tool("/link-building", "Link Building & Outreach")] },
    { label: "Technical & Monitoring", items: [tool("/health?view=issues", "Issues & Root Causes"), tool("/health?view=speed", "Website Speed Test"), tool("/health?view=indexing", "Google Indexing"), tool("/technical-crawler", "Browser Crawl"), tool("/health?view=watchlist", "Page Watchlist"), tool("/health?view=launch", "Launch & Migration"), tool("/monitoring", "Availability Monitor"), tool("/serp-intelligence", "Search Results")] },
    { label: "Other", items: [tool("/on-page", "On Page SEO Checker"), tool("/organic-traffic", "Organic Traffic Insights", ["clicks", "impressions", "search console"])] },
    { label: "Data Collection", items: [tool("/scan-centre", "Scan Centre")] },
  ] },
  { id: "ai", label: "AI", icon: Sparkles, href: "/ai-visibility", groups: [
    { label: "AI Analysis", items: [tool("/ai-visibility", "Visibility Overview"), tool("/ai-visibility?view=competitors", "Competitor Research"), tool("/ai-research", "Prompt Research"), tool("/ai-visibility?view=sources", "Cited Sources"), tool("/ai-visibility?view=cited-pages", "Cited Pages"), tool("/ai-visibility?view=source-opportunities", "Source Opportunities")] },
    { label: "Brand Performance", items: [tool("/ai-visibility?view=brand", "Brand Performance", ["Brand Mentions"]), tool("/ai-visibility?view=perception", "Perception"), tool("/ai-visibility?view=narrative", "Narrative Drivers"), tool("/ai-visibility?view=questions", "Questions"), tool("/ai-visibility?view=comparison", "Platform Comparisons")] },
    { label: "Boost & Monitor", items: [tool("/ai-visibility?view=crawlers", "Crawler Access"), tool("/ai-visibility?view=prompts", "Prompt Tracking")] },
  ] },
  { id: "traffic", label: "Traffic & Market", icon: Globe2, href: "/traffic-analytics", groups: [
    { label: "Competitive Research", items: [tool("/traffic-analytics", "Traffic Overview", ["competitor traffic", "total visits"]), tool("/traffic-analytics?view=channels", "Traffic Channels"), tool("/traffic-analytics?view=countries", "Geographical Distribution"), tool("/traffic-analytics?view=pages", "Top Pages by Traffic"), tool("/traffic-analytics?view=journey", "Traffic Journey"), tool("/traffic-analytics?view=subfolders", "Subfolders"), tool("/traffic-analytics?view=page-groups", "Page Groups"), tool("/traffic-analytics?view=funnels", "Funnels")] },
    { label: "Audience & Market", items: [tool("/traffic-analytics?view=audience", "Audience Overview"), tool("/traffic-analytics?view=overlap", "Audience Overlap"), tool("/traffic-analytics?view=demographics", "Demographics"), tool("/traffic-analytics?view=behavior", "Audience Behaviour"), tool("/traffic-analytics?view=socioeconomics", "Socioeconomics"), tool("/traffic-analytics?view=market", "Market Overview"), tool("/traffic-analytics?view=monitoring", "Competitor Monitoring"), tool("/traffic-analytics?view=daily", "Daily Trends"), tool("/traffic-analytics?view=regions", "Regional Trends"), tool("/traffic-analytics?view=industry", "Industry Trends")] },
    { label: "Your Website", items: [tool("/performance?view=business", "Business Results"), tool("/performance?view=brand", "Branded & Non-Branded"), tool("/performance?view=trends", "Trends & Seasonality"), tool("/performance?view=timeline", "Change Timeline")] },
  ] },
  { id: "local", label: "Local", icon: MapPinned, href: "/local-seo", groups: [
    { label: "", items: [tool("/local-seo", "Dashboard")] },
    { label: "Business Management", items: [tool("/local-seo?view=locations", "Listing Management"), tool("/local-seo?feature=reviews#research", "Review Management"), tool("/local-seo?view=profiles", "GBP Optimization")] },
    { label: "Competitive Analysis", items: [tool("/local-seo?view=grid", "Map Rank Tracker")] },
  ] },
  { id: "content", label: "Content", icon: FileText, href: "/content", groups: [
    { label: "Content Marketing", items: [tool("/content", "Content Dashboard"), tool("/content?view=editor", "SEO Writing Assistant"), tool("/content?view=briefs", "Content Templates & Briefs"), tool("/content?view=calendar", "Content Calendar"), tool("/content?view=generate", "AI Article Generator"), tool("/content?view=optimise", "Content Optimizer"), tool("/content?view=repurpose", "Content Repurposing"), tool("/topic-research?toolkit=content", "Topic Finder"), tool("/content?view=generate-brief", "SEO Brief Generator"), tool("/content?view=library", "My Content")] },
  ] },
  { id: "reports", label: "Reports", icon: Activity, href: "/reports", groups: [
    { label: "Reporting", items: [tool("/reports", "My Reports"), tool("/reports?view=builder", "Report Builder"), tool("/reports?view=archive", "Report Archive & Sharing"), tool("/reports/client", "Client Report")] },
  ] },
  { id: "tasks", label: "Tasks", icon: ListChecks, href: "/action-centre", groups: [
    { label: "Execution", items: [tool("/action-centre", "Needs Attention"), tool("/work", "In Progress"), tool("/outcomes", "Results"), tool("/recommendations", "Recommendations"), tool("/notifications", "Notifications")] },
  ] },
];

export function currentToolkit(pathname: string, params: URLSearchParams): Toolkit {
  if(params.get("toolkit")==="content"&&pathname==="/topic-research")return TOOLKITS.find(kit=>kit.id==="content")!;
  if(pathname==="/topic-research")return TOOLKITS[1];
  if ((pathname === "/portfolio" && params.get("scope") === "portfolio") || pathname.startsWith("/sites") || pathname.startsWith("/settings") || params.get("workspace") === "global") return TOOLKITS[0];
  if (pathname === "/portfolio" && !params.has("site") && !params.has("scope")) return TOOLKITS[1];
  if (pathname === "/performance" && params.get("view") === "overlap") return TOOLKITS[1];
  return TOOLKITS.slice(2).find((kit) => kit.groups.some((group) => group.items.some((entry) => entry.href.split(/[?#]/)[0] === pathname))) ?? TOOLKITS[1];
}

export const TOOLKIT_FEATURES = TOOLKITS.flatMap((kit) => kit.groups.flatMap((group) => group.items.map((entry) => ({ ...entry, section: `${kit.label} · ${group.label}` }))));
