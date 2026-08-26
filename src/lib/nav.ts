import {
  LayoutDashboard,
  Search,
  ScanSearch,
  TrendingUp,
  ShieldCheck,
  Link2,
  Sparkles,
  FileText,
  Settings,
  ListChecks,
  Gauge,
  Building2,
  Bell,
  GitCompareArrows,
  MapPinned,
  Radar,
  Swords,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "primary" | "operate" | "system";
}

/** Primary application navigation (top bar) + operational + system modules. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/portfolio", label: "Portfolio", icon: LayoutDashboard, group: "primary" },
  { href: "/domain", label: "Domain", icon: Gauge, group: "primary" },
  { href: "/research", label: "Research", icon: Search, group: "primary" },
  { href: "/keyword-research", label: "Keyword Research", icon: ScanSearch, group: "primary" },
  { href: "/rankings", label: "Rankings", icon: TrendingUp, group: "primary" },
  { href: "/competitors", label: "Competitor Explorer", icon: Swords, group: "primary" },
  { href: "/keyword-strategy", label: "Keyword Strategy", icon: Waypoints, group: "primary" },
  { href: "/site-audit", label: "Site Audit", icon: ShieldCheck, group: "primary" },
  { href: "/technical-crawler", label: "Rendered Crawler", icon: GitCompareArrows, group: "primary" },
  { href: "/monitoring", label: "Reliability", icon: Radar, group: "primary" },
  { href: "/backlinks", label: "Backlinks", icon: Link2, group: "primary" },
  { href: "/link-building", label: "Link Building", icon: Waypoints, group: "primary" },
  { href: "/local-seo", label: "Local SEO", icon: MapPinned, group: "primary" },
  { href: "/ai-visibility", label: "AI Visibility", icon: Sparkles, group: "primary" },
  { href: "/content", label: "Content", icon: FileText, group: "operate" },
  { href: "/recommendations", label: "Recommendations", icon: ListChecks, group: "operate" },
  { href: "/reports", label: "Reports", icon: FileText, group: "operate" },
  { href: "/sites", label: "Websites", icon: Building2, group: "system" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "system" },
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((n) => n.group === "primary");

/** Task-oriented desktop navigation. Related routes stay one decision away
 * without forcing eleven equal-weight tabs into the available width. */
export const NAV_SECTIONS: { label: string; icon: LucideIcon; items: NavItem[] }[] = [
  { label: "Portfolio", icon: LayoutDashboard, items: NAV_ITEMS.filter((item) => item.href === "/portfolio") },
  { label: "Search", icon: Search, items: NAV_ITEMS.filter((item) => ["/domain", "/research", "/keyword-research", "/keyword-strategy", "/rankings", "/competitors"].includes(item.href)) },
  { label: "Technical", icon: ShieldCheck, items: NAV_ITEMS.filter((item) => ["/site-audit", "/technical-crawler", "/monitoring"].includes(item.href)) },
  { label: "Authority", icon: Link2, items: NAV_ITEMS.filter((item) => ["/backlinks", "/link-building"].includes(item.href)) },
  { label: "Local", icon: MapPinned, items: NAV_ITEMS.filter((item) => item.href === "/local-seo") },
  { label: "AI visibility", icon: Sparkles, items: NAV_ITEMS.filter((item) => item.href === "/ai-visibility") },
  { label: "Actions", icon: ListChecks, items: NAV_ITEMS.filter((item) => ["/content", "/recommendations"].includes(item.href)) },
  { label: "Reports", icon: FileText, items: NAV_ITEMS.filter((item) => item.href === "/reports") },
];
