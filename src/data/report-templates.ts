import type { ReportTemplate } from "@/lib/types";

/**
 * Report template definitions — product configuration, not data. Generated
 * reports are populated from live stored snapshots.
 */
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "tpl-exec",
    name: "Portfolio Executive Report",
    type: "Executive",
    description: "Cross-domain KPIs, wins/losses and priority actions for leadership.",
    sections: ["Portfolio KPIs", "Visibility trend", "Winners & losers", "Priority actions"],
  },
  {
    id: "tpl-domain",
    name: "Domain SEO Report",
    type: "Domain",
    description: "Full single-domain performance overview.",
    sections: ["Overview", "Rankings", "Traffic", "Technical", "Recommendations"],
  },
  {
    id: "tpl-rank",
    name: "Ranking Report",
    type: "Rankings",
    description: "Position tracking, visibility and share of voice.",
    sections: ["Position distribution", "Visibility", "Winners & losers", "SERP features"],
  },
  {
    id: "tpl-tech",
    name: "Technical Audit Report",
    type: "Site Audit",
    description: "Health score, issues by severity and remediation plan.",
    sections: ["Health score", "Issues by category", "Affected pages", "Fix plan"],
  },
  {
    id: "tpl-backlink",
    name: "Backlink Report",
    type: "Backlinks",
    description: "Link growth, referring domains, anchors and risk.",
    sections: ["Overview", "New & lost", "Referring domains", "Risk review"],
  },
  {
    id: "tpl-ai",
    name: "AI Visibility Report",
    type: "AI Visibility",
    description: "Brand mention and citation performance across AI platforms.",
    sections: ["Mention rate", "Citation rate", "Competitor SoV", "Missed prompts"],
  },
];
