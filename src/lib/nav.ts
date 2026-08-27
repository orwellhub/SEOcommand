import {
  Activity, Bell, Bot, Building2, FileText, FolderKanban, Gauge, GitCompareArrows,
  Globe2, Home, LayoutDashboard, Link2, ListChecks, ListTodo, MapPinned, Radar, Search, Settings,
  ScanLine, ShieldCheck, Sparkles, Swords, TrendingUp, Trophy, Waypoints, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: "global" | "research" | "site";
}

export const GLOBAL_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: Home, group: "global" },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard, group: "global" },
  { href: "/research", label: "Research", icon: Search, group: "global" },
  { href: "/sites", label: "Sites", icon: Building2, group: "global" },
  { href: "/action-centre", label: "Action centre", icon: ListChecks, group: "global" },
  { href: "/work", label: "Continue work", icon: ListTodo, group: "global" },
  { href: "/outcomes", label: "Outcomes", icon: Trophy, group: "global" },
  { href: "/reports", label: "Reports", icon: FileText, group: "global" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "global" },
  { href: "/settings", label: "Admin", icon: Settings, group: "global" },
];

export const RESEARCH_NAV: NavItem[] = [
  { href: "/research", label: "Research home", icon: Search, group: "research" },
  { href: "/domain-research", label: "Domain research", icon: Globe2, group: "research" },
  { href: "/keyword-research", label: "Keyword research", icon: Waypoints, group: "research" },
  { href: "/keyword-research?view=projects", label: "Research projects", icon: FolderKanban, group: "research" },
];

export const SITE_NAV: NavItem[] = [
  { href: "/domain", label: "Overview", icon: Gauge, group: "site" },
  { href: "/research", label: "Search performance", icon: Search, group: "site" },
  { href: "/rankings", label: "Rankings", icon: TrendingUp, group: "site" },
  { href: "/keyword-strategy", label: "Keywords", icon: Waypoints, group: "site" },
  { href: "/competitors", label: "Competitors", icon: Swords, group: "site" },
  { href: "/site-audit", label: "Technical", icon: ShieldCheck, group: "site" },
  { href: "/content", label: "Content", icon: FileText, group: "site" },
  { href: "/backlinks", label: "Backlinks", icon: Link2, group: "site" },
  { href: "/ai-visibility", label: "AI visibility", icon: Sparkles, group: "site" },
  { href: "/local-seo", label: "Local SEO", icon: MapPinned, group: "site" },
  { href: "/reports", label: "Reports", icon: FileText, group: "site" },
];

export const SCAN_CENTRE: NavItem = { href: "/scan-centre", label: "Scan centre", icon: ScanLine, group: "site" };

export const TECHNICAL_SECONDARY: NavItem[] = [
  { href: "/technical-crawler", label: "Rendered crawler", icon: GitCompareArrows },
  { href: "/monitoring", label: "Reliability", icon: Radar },
];
export const KEYWORD_SECONDARY: NavItem[] = [{ href: "/keyword-research", label: "Keyword discovery", icon: Search }];
export const BACKLINK_SECONDARY: NavItem[] = [{ href: "/link-building", label: "Link building", icon: Activity }];
export const AI_SECONDARY: NavItem[] = [{ href: "/ai-visibility", label: "AI visibility", icon: Bot }];

/** Compatibility exports used by small-screen and legacy surfaces. */
export const NAV_ITEMS: NavItem[] = [...GLOBAL_NAV, ...RESEARCH_NAV.slice(1), SCAN_CENTRE, ...SITE_NAV, ...TECHNICAL_SECONDARY, ...KEYWORD_SECONDARY, ...BACKLINK_SECONDARY];
export const PRIMARY_NAV = SITE_NAV;
export const NAV_SECTIONS = [
  { label: "Portfolio", icon: Building2, items: GLOBAL_NAV.slice(0, 6) },
  { label: "Search", icon: Search, items: SITE_NAV.slice(1, 5) },
  { label: "Technical", icon: ShieldCheck, items: [SITE_NAV[5]!, ...TECHNICAL_SECONDARY] },
  { label: "Authority", icon: Link2, items: [SITE_NAV[7]!, ...BACKLINK_SECONDARY] },
  { label: "Local", icon: MapPinned, items: [SITE_NAV[9]!] },
  { label: "AI visibility", icon: Sparkles, items: [SITE_NAV[8]!] },
  { label: "Actions", icon: ListChecks, items: [SITE_NAV[6]!, { href: "/recommendations", label: "Recommendations", icon: ListChecks }] },
  { label: "Reports", icon: FileText, items: [GLOBAL_NAV[7]!] },
];
