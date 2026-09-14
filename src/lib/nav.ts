import {
  Activity, Bell, Building2, FileText, FolderKanban, Gauge, Globe2, LayoutDashboard,
  Link2, ListChecks, ListTodo, MapPinned, Radar, Search, Settings, ScanLine,
  ShieldCheck, Sparkles, Swords, TrendingUp, Trophy, Waypoints, type LucideIcon,
} from "lucide-react";
import { TOOLKIT_FEATURES } from "./toolkits";
import { hrefWithScope } from "./site-context";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: "global" | "research" | "site";
  aliases?: string[];
  section?: string;
}
export interface WorkspaceSection { id: string; label: string; icon: LucideIcon; href: string; items: NavItem[] }
const item = (href: string, label: string, icon: LucideIcon, aliases: string[] = []): NavItem => ({ href, label, icon, aliases, group: "site" });

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  { id: "overview", label: "Overview", icon: Gauge, href: "/portfolio", items: [] },
  { id: "performance", label: "Performance", icon: TrendingUp, href: "/research", items: [
    item("/research", "Search performance", Search, ["clicks", "impressions", "search console", "traffic", "queries"]),
    item("/rankings", "Rankings", TrendingUp, ["positions", "tracked keywords"]),
    item("/performance?view=business", "Business results", Activity, ["leads", "enquiries", "bookings", "conversions", "analytics"]),
    item("/performance?view=brand", "Brand & non-brand", Search, ["brand searches", "aliases"]),
    item("/performance?view=trends", "Trends & seasonality", TrendingUp, ["search demand", "seasonal"]),
    item("/performance?view=timeline", "Change timeline", Activity, ["annotations", "edits", "changes"]),
  ] },
  { id: "research", label: "Research", icon: Search, href: "/keyword-research", items: [
    item("/keyword-research", "Keywords", Search, ["discovery", "keyword research", "search volume"]),
    item("/keyword-strategy", "Planning", Waypoints, ["keyword strategy", "topic groups", "clusters", "page assignments", "difficulty"]),
    item("/questions", "Customer questions", Search, ["people also ask", "paa", "faq", "questions"]),
    item("/competitors", "Competitors", Swords, ["competitor history", "competition", "keyword gaps"]),
    item("/domain-research", "Domain research", Globe2, ["domain explorer", "organic footprint"]),
    item("/keyword-research?view=projects", "Projects", FolderKanban, ["saved projects"]),
    item("/serp-intelligence", "Search results", Activity, ["serp intelligence", "search features"]),
    item("/market-intelligence", "Market insights", Radar, ["market intelligence", "opportunities"]),
  ] },
  { id: "content", label: "Pages & Content", icon: FileText, href: "/pages", items: [
    item("/pages", "All pages", FileText, ["page detail", "internal links", "page inventory"]),
    item("/content", "Content planning & editor", FileText, ["content briefs", "drafts", "readability", "optimisation", "optimization"]),
  ] },
  { id: "health", label: "Health & Speed", icon: ShieldCheck, href: "/health", items: [
    item("/health?view=issues", "Issues & data health", ShieldCheck, ["root cause", "grouped issues", "freshness", "connections"]),
    item("/health?view=speed", "Speed tests", Gauge, ["pagespeed", "core web vitals", "lcp", "slow"]),
    item("/health?view=indexing", "Google indexing", Search, ["url inspection", "indexed"]),
    item("/health?view=watchlist", "Page watchlist", Radar, ["important pages", "page monitoring"]),
    item("/health?view=launch", "Launch & migration", ShieldCheck, ["baseline", "redirects", "redesign"]),
    item("/site-audit", "Detailed audit", ListChecks, ["technical issues", "schema", "hreflang"]),
    item("/technical-crawler", "Browser crawl", Globe2, ["rendered crawler", "javascript"]),
    item("/monitoring", "Availability", Radar, ["uptime", "ssl", "monitoring", "robots"]),
  ] },
  { id: "backlinks", label: "Backlinks", icon: Link2, href: "/backlinks", items: [
    item("/backlinks", "Link overview", Link2, ["anchors", "referring domains"]),
    item("/backlinks?feature=links#research", "Deeper link research", Search, ["backlink records"]),
    item("/backlinks?feature=recovery#research", "Broken-page recovery", ShieldCheck, ["broken backlinks", "broken pages", "link recovery", "404"]),
    item("/link-building", "Outreach & monitoring", Activity, ["link building", "inbox", "replies", "follow-ups", "acquired links"]),
  ] },
  { id: "ai", label: "AI Visibility", icon: Sparkles, href: "/ai-visibility", items: [
    item("/ai-visibility", "Overview", Sparkles, ["ai visibility", "chatgpt"]),
    item("/ai-visibility?feature=mentions#research", "Mention research", Search, ["ai mentions", "citations"]),
    item("/ai-visibility?feature=demand#research", "Estimated AI demand", TrendingUp, ["ai search volume"]),
    item("/ai-visibility#platform-comparison", "Platform comparisons", Activity, ["sentiment", "ai comparison"]),
  ] },
  { id: "local", label: "Local SEO", icon: MapPinned, href: "/local-seo", items: [
    item("/local-seo", "Locations & rankings", MapPinned, ["maps", "local grids"]),
    item("/local-seo?feature=reviews#research", "Review analysis", Search, ["customer reviews", "complaints", "review themes"]),
    item("/local-seo#business-management", "Profiles & replies", Building2, ["google business profile", "directory consistency", "review replies"]),
  ] },
  { id: "tasks", label: "Tasks", icon: ListChecks, href: "/action-centre", items: [
    item("/action-centre", "Needs attention", ListChecks, ["urgent", "critical", "tasks", "action centre"]),
    item("/work", "In progress", ListTodo, ["work", "assigned", "drafts"]),
    item("/outcomes", "Results", Trophy, ["outcomes", "completed work"]),
    item("/recommendations", "Recommendations", Sparkles, ["insights", "next actions"]),
    item("/notifications", "Notifications", Bell, ["alerts"]),
  ] },
];

export const SITE_NAV: NavItem[] = WORKSPACE_SECTIONS.slice(0, 8).map((section) => ({ ...section, group: "site", section: section.id }));
export const UTILITY_NAV: NavItem[] = [
  { ...item("/action-centre", "Tasks", ListChecks), section: "tasks", group: "global" },
  { href: "/reports", label: "Reports", icon: FileText, group: "global" },
  item("/scan-centre", "Scan Centre", ScanLine),
];
export const GLOBAL_NAV: NavItem[] = [
  { href: "/portfolio?scope=portfolio", label: "Portfolio", icon: LayoutDashboard, group: "global" },
  { href: "/sites", label: "Websites", icon: Building2, group: "global" },
  { href: "/research", label: "Research", icon: Search, group: "global" },
  ...UTILITY_NAV.filter((entry) => entry.href !== "/scan-centre"),
  { href: "/settings", label: "Settings", icon: Settings, group: "global" },
];
export const RESEARCH_NAV: NavItem[] = [
  { href: "/research", label: "Research home", icon: Search, group: "research" },
  ...WORKSPACE_SECTIONS.find((section) => section.id === "research")!.items.filter((entry) => ["/domain-research", "/keyword-research", "/keyword-research?view=projects"].includes(entry.href)).map((entry) => ({ ...entry, group: "research" as const })),
];
export const FEATURE_NAV: NavItem[] = [
  ...WORKSPACE_SECTIONS.flatMap((section) => section.items.map((entry) => ({ ...entry, section: section.label }))),
  item("/performance?view=overlap", "Cross-website keyword overlap", Waypoints, ["cannibalisation", "overlap", "brands"]),
  item("/keyword-research?view=saved", "Saved keyword collections", FolderKanban, ["saved scans", "research history"]),
  item("/keyword-research?view=tracking", "Keyword tracking setup", TrendingUp, ["rank tracking campaigns"]),
  { href: "/reports#report-archive", label: "Report archive & sharing", icon: FileText, group: "global", aliases: ["pdf", "client links", "email reports"] },
  ...GLOBAL_NAV, UTILITY_NAV[2]!,
];

/** One owner per route; the old search-performance URL remains compatible. */
export function workspaceSection(pathname: string, params = new URLSearchParams()): WorkspaceSection | undefined {
  if (pathname === "/research" && params.get("workspace") === "global") return WORKSPACE_SECTIONS.find((section) => section.id === "research");
  if (pathname === "/performance" && params.get("view") === "overlap") return WORKSPACE_SECTIONS.find((section) => section.id === "research");
  return WORKSPACE_SECTIONS.find((section) => section.href === pathname || section.items.some((entry) => entry.href.split(/[?#]/)[0] === pathname))
    ?? (pathname === "/domain" || /^\/sites\/[^/]+$/.test(pathname) && pathname !== "/sites/new" ? WORKSPACE_SECTIONS[0] : undefined);
}

export function activeNavigationItem(items: NavItem[], pathname: string, params: URLSearchParams, hash = ""): NavItem | undefined {
  const current = new URLSearchParams(params);
  if (pathname === "/health" && !current.has("view")) current.set("view", "issues");
  if (pathname === "/performance" && !current.has("view")) current.set("view", "trends");
  return items.filter((entry) => {
    const url = new URL(entry.href, "https://seo-command.local");
    return url.pathname === pathname && (!url.hash || url.hash === hash) && [...url.searchParams].every(([key, value]) => current.get(key) === value);
  }).sort((a, b) => {
    const score = (entry: NavItem) => { const url = new URL(entry.href, "https://seo-command.local"); return url.searchParams.size * 2 + (url.hash ? 1 : 0); };
    return score(b) - score(a);
  })[0];
}

export function navigationHref(entry: Pick<NavItem, "href" | "group">, scope: string, range?: string): string {
  let href = entry.href === "/research" && entry.group !== "site" ? "/research?workspace=global" : hrefWithScope(entry.href, scope);
  if (range && ["7d", "28d", "90d"].includes(range)) {
    const url = new URL(href, "https://seo-command.local"); url.searchParams.set("range", range); href = `${url.pathname}${url.search}${url.hash}`;
  }
  return href;
}
export function searchFeatures(query: string): NavItem[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const entries = [...TOOLKIT_FEATURES, ...FEATURE_NAV].filter((entry, index, all) => all.findIndex((other) => other.href === entry.href && other.label === entry.label) === index);
  return entries.filter((entry) => terms.every((term) => `${entry.label} ${entry.section ?? ""} ${(entry.aliases ?? []).join(" ")}`.toLowerCase().includes(term)))
    .sort((a, b) => Number(b.label.toLowerCase().includes(query.toLowerCase())) - Number(a.label.toLowerCase().includes(query.toLowerCase()))).slice(0, 14);
}
