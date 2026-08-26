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
  { href: "/site-audit", label: "Site Audit", icon: ShieldCheck, group: "primary" },
  { href: "/backlinks", label: "Backlinks", icon: Link2, group: "primary" },
  { href: "/ai-visibility", label: "AI Visibility", icon: Sparkles, group: "primary" },
  { href: "/content", label: "Content", icon: FileText, group: "operate" },
  { href: "/recommendations", label: "Recommendations", icon: ListChecks, group: "operate" },
  { href: "/reports", label: "Reports", icon: FileText, group: "operate" },
  { href: "/sites", label: "Websites", icon: Building2, group: "system" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "system" },
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((n) => n.group === "primary");
