import type { ReportTemplate } from "@/lib/types";

/**
 * Report template definitions — product configuration, not data. Generated
 * reports are populated from live stored snapshots.
 */
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "tpl-exec",
    name: "Executive Performance Report",
    type: "Executive",
    description: "Leadership summary with performance narrative, material changes and the next decisions required.",
    sections: ["Executive summary", "Performance KPIs", "Search trend", "Priority actions"],
  },
  {
    id: "tpl-domain",
    name: "Complete SEO Performance Report",
    type: "Domain",
    description: "The complete client report: search, traffic, rankings, technical quality, authority, AI visibility and actions.",
    sections: ["Executive summary", "Organic performance", "Rankings", "Technical quality", "Backlinks", "AI visibility", "Next actions"],
  },
  {
    id: "tpl-rank",
    name: "Ranking Report",
    type: "Rankings",
    description: "Position distribution, visibility trend, query movement and search opportunities.",
    sections: ["Executive summary", "Position distribution", "Visibility trend", "Winners & losers", "Next actions"],
  },
  {
    id: "tpl-tech",
    name: "Technical Audit Report",
    type: "Site Audit",
    description: "Client-readable crawl health, risk by severity, affected pages and the remediation plan.",
    sections: ["Technical summary", "Health score", "Risk by severity", "Priority issues", "Fix plan"],
  },
  {
    id: "tpl-backlink",
    name: "Backlink Report",
    type: "Backlinks",
    description: "Authority growth, referring-domain quality, new and lost links, and risk review.",
    sections: ["Authority summary", "Link growth", "Referring domains", "Risk review", "Next actions"],
  },
  {
    id: "tpl-ai",
    name: "AI Visibility Report",
    type: "AI Visibility",
    description: "Brand mentions, citations, answer-engine coverage and the content gaps limiting AI discovery.",
    sections: ["AI summary", "Mention rate", "Citation rate", "Platform coverage", "Missed prompts", "Next actions"],
  },
];
