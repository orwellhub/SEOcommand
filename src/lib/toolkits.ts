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
    { label: "Site Performance", items: [tool("/site-audit", "Site Audit"), tool("/rankings", "Position Tracking", ["rankings"]), tool("/research", "Organic Traffic Insights", ["clicks", "impressions", "search console"])] },
    { label: "Competitive Analysis", items: [tool("/domain-research", "Domain Overview"), tool("/competitors", "Organic Rankings", ["competitors", "keyword gap"]), tool("/competitors?view=pages", "Top Pages"), tool("/pages", "Your Website Pages"), tool("/performance?view=overlap", "Compare Websites"), tool("/research?view=competitors", "Organic Competitors"), tool("/research?view=gaps", "Keyword Gap"), tool("/market-intelligence", "Market Insights")] },
    { label: "Keyword Research", items: [tool("/keyword-research", "Keyword Overview"), tool("/keyword-strategy", "Keyword Strategy Builder"), tool("/questions", "Customer Questions", ["people also ask", "paa"]), tool("/keyword-research?view=autocomplete", "Autocomplete Suggestions"), tool("/keyword-research?view=saved", "Saved Keywords"), tool("/keyword-research?view=projects", "Research Projects")] },
    { label: "Link Building", items: [tool("/backlinks", "Backlinks"), tool("/backlinks?view=referring", "Referring Domains"), tool("/backlinks?view=risk", "Backlink Audit"), tool("/backlinks?feature=recovery#research", "Broken Backlink Recovery"), tool("/link-building", "Link Building & Outreach")] },
    { label: "Technical & Monitoring", items: [tool("/health?view=issues", "Issues & Root Causes"), tool("/health?view=speed", "Website Speed Test"), tool("/health?view=indexing", "Google Indexing"), tool("/technical-crawler", "Browser Crawl"), tool("/health?view=watchlist", "Page Watchlist"), tool("/health?view=launch", "Launch & Migration"), tool("/monitoring", "Availability Monitor"), tool("/serp-intelligence", "Search Results")] },
    { label: "Data Collection", items: [tool("/scan-centre", "Scan Centre")] },
  ] },
  { id: "ai", label: "AI", icon: Sparkles, href: "/ai-visibility", groups: [
    { label: "AI Analysis", items: [tool("/ai-visibility", "Visibility Overview"), tool("/ai-visibility?view=competitors", "Competitor Research"), tool("/ai-visibility?feature=demand#research", "Prompt Research")] },
    { label: "Brand Performance", items: [tool("/ai-visibility?feature=mentions#research", "Brand Mentions"), tool("/ai-visibility?view=comparison", "Platform Comparisons"), tool("/ai-visibility?view=sources", "Cited Sources")] },
    { label: "Boost & Monitor", items: [tool("/ai-visibility?view=crawlers", "AI Crawler Audit"), tool("/ai-visibility?view=prompts", "Prompt Tracking")] },
  ] },
  { id: "traffic", label: "Traffic & Market", icon: Globe2, href: "/traffic-analytics", groups: [
    { label: "Competitive Research", items: [tool("/traffic-analytics", "Traffic Overview", ["competitor traffic", "total visits"]), tool("/traffic-analytics?view=channels", "Traffic Channels"), tool("/traffic-analytics?view=countries", "Geographical Distribution"), tool("/traffic-analytics?view=pages", "Top Pages by Traffic")] },
    { label: "Your Website", items: [tool("/performance?view=business", "Business Results"), tool("/performance?view=brand", "Branded & Non-Branded"), tool("/performance?view=trends", "Trends & Seasonality"), tool("/performance?view=timeline", "Change Timeline")] },
  ] },
  { id: "local", label: "Local", icon: MapPinned, href: "/local-seo", groups: [
    { label: "", items: [tool("/local-seo", "Dashboard")] },
    { label: "Business Management", items: [tool("/local-seo?view=locations", "Listing Management"), tool("/local-seo?feature=reviews#research", "Review Management"), tool("/local-seo?view=profiles", "GBP Optimization")] },
    { label: "Competitive Analysis", items: [tool("/local-seo?view=grid", "Map Rank Tracker")] },
  ] },
  { id: "content", label: "Content", icon: FileText, href: "/content", groups: [
    { label: "Content Marketing", items: [tool("/content", "Content Dashboard"), tool("/content?view=editor", "SEO Writing Assistant"), tool("/content?view=briefs", "Content Templates & Briefs"), tool("/content?view=calendar", "Content Calendar")] },
  ] },
  { id: "reports", label: "Reports", icon: Activity, href: "/reports", groups: [
    { label: "Reporting", items: [tool("/reports", "My Reports"), tool("/reports#report-archive", "Report Archive & Sharing"), tool("/reports/client", "Client Report")] },
  ] },
  { id: "tasks", label: "Tasks", icon: ListChecks, href: "/action-centre", groups: [
    { label: "Execution", items: [tool("/action-centre", "Needs Attention"), tool("/work", "In Progress"), tool("/outcomes", "Results"), tool("/recommendations", "Recommendations"), tool("/notifications", "Notifications")] },
  ] },
];

export function currentToolkit(pathname: string, params: URLSearchParams): Toolkit {
  if ((pathname === "/portfolio" && params.get("scope") === "portfolio") || pathname.startsWith("/sites") || pathname.startsWith("/settings") || params.get("workspace") === "global") return TOOLKITS[0];
  if (pathname === "/portfolio" && !params.has("site") && !params.has("scope")) return TOOLKITS[1];
  if (pathname === "/performance" && params.get("view") === "overlap") return TOOLKITS[1];
  return TOOLKITS.slice(2).find((kit) => kit.groups.some((group) => group.items.some((entry) => entry.href.split(/[?#]/)[0] === pathname))) ?? TOOLKITS[1];
}

export const TOOLKIT_FEATURES = TOOLKITS.flatMap((kit) => kit.groups.flatMap((group) => group.items.map((entry) => ({ ...entry, section: `${kit.label} · ${group.label}` }))));
