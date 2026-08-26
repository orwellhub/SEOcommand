import {
  Activity, Bell, Bot, Building2, FileText, Gauge, GitCompareArrows,
  LayoutDashboard, Link2, ListChecks, MapPinned, Radar, Search, Settings,
  ShieldCheck, Sparkles, Swords, TrendingUp, Waypoints, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: "global" | "site";
}

export const GLOBAL_NAV: NavItem[] = [
  { href: "/action-centre", label: "Action centre", icon: ListChecks, group: "global" },
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard, group: "global" },
  { href: "/reports", label: "Reports", icon: FileText, group: "global" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "global" },
  { href: "/settings", label: "Admin", icon: Settings, group: "global" },
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

export const TECHNICAL_SECONDARY: NavItem[] = [
  { href: "/technical-crawler", label: "Rendered crawler", icon: GitCompareArrows },
  { href: "/monitoring", label: "Reliability", icon: Radar },
];
export const KEYWORD_SECONDARY: NavItem[] = [{ href: "/keyword-research", label: "Keyword discovery", icon: Search }];
export const BACKLINK_SECONDARY: NavItem[] = [{ href: "/link-building", label: "Link building", icon: Activity }];
export const AI_SECONDARY: NavItem[] = [{ href: "/ai-visibility", label: "AI visibility", icon: Bot }];

/** Compatibility exports used by small-screen and legacy surfaces. */
export const NAV_ITEMS: NavItem[] = [...GLOBAL_NAV, ...SITE_NAV, ...TECHNICAL_SECONDARY, ...KEYWORD_SECONDARY, ...BACKLINK_SECONDARY];
export const PRIMARY_NAV = SITE_NAV;
export const NAV_SECTIONS = [
  { label: "Portfolio", icon: Building2, items: GLOBAL_NAV.slice(0, 2) },
  { label: "Search", icon: Search, items: SITE_NAV.slice(1, 5) },
  { label: "Technical", icon: ShieldCheck, items: [SITE_NAV[5]!, ...TECHNICAL_SECONDARY] },
  { label: "Authority", icon: Link2, items: [SITE_NAV[7]!, ...BACKLINK_SECONDARY] },
  { label: "Local", icon: MapPinned, items: [SITE_NAV[9]!] },
  { label: "AI visibility", icon: Sparkles, items: [SITE_NAV[8]!] },
  { label: "Actions", icon: ListChecks, items: [SITE_NAV[6]!, { href: "/recommendations", label: "Recommendations", icon: ListChecks }] },
  { label: "Reports", icon: FileText, items: [GLOBAL_NAV[2]!] },
];
