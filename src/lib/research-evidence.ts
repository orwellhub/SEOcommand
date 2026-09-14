import { marketLabel } from "./markets";
/** Shared, serialisable research contracts. Provider credentials never enter this module. */
export const RESEARCH_FEATURES = [
  { id: "autocomplete", title: "Autocomplete suggestions", home: "/keyword-research?view=autocomplete", description: "Google's suggested searches, with their seed, language, market and collection date.", input: "keywords" },
  { id: "countries", title: "Domain country comparison", home: "/domain-research?view=countries", description: "Organic and paid search estimates by country and language from the provider index.", input: "domains" },
  { id: "footprint", title: "Deeper keyword and page research", home: "/competitors", description: "Up to 1,000 ranking keywords and 100 leading pages per selected domain.", input: "domains" },
  { id: "history", title: "Competitor performance history", home: "/competitors", description: "Monthly ranking distribution and estimated search traffic over the last year.", input: "domains" },
  { id: "links", title: "Deeper backlink evidence", home: "/backlinks", description: "Up to 1,000 linking-page records per domain, with anchors and collection dates.", input: "domains" },
  { id: "clusters", title: "Search-result keyword clusters", home: "/keyword-strategy", description: "Group keywords that share at least three of their top ten ranking URLs.", input: "keywords" },
  { id: "mentions", title: "AI mention research", home: "/ai-visibility", description: "Prompts and citations from the provider's AI response index, by domain and platform.", input: "domains" },
  { id: "demand", title: "Estimated AI search demand", home: "/ai-visibility", description: "Modelled demand and monthly trends. These are estimates derived from search questions.", input: "keywords" },
  { id: "trends", title: "Trends and seasonality", home: "/performance", description: "Compare relative search interest across two years; review changes alongside Search Console.", input: "keywords" },
  { id: "recovery", title: "Recover links to broken pages", home: "/backlinks", description: "Find your pages with incoming links and provider-reported errors. Verify before redirecting.", input: "none" },
  { id: "questions", title: "Customer questions", home: "/questions", description: "Questions and answer sources appearing in Google's People Also Ask results.", input: "keywords" },
  { id: "reviews", title: "Customer review analysis", home: "/local-seo", description: "Review text, ratings, owner replies and evidence-backed themes for a selected business.", input: "business" },
] as const;
export type ResearchFeature = typeof RESEARCH_FEATURES[number]["id"];
export type ResearchInput = { market?: { locationCode: number; languageCode: string; label: string }; feature: ResearchFeature; keywords: string[]; domains: string[]; businessId?: string; platform: "google" | "chat_gpt"; device: "desktop" | "mobile"; path?: string; pathMode?: "page" | "folder" };
export type EvidenceRow = { id: string; label: string; url?: string; keywords?: string[]; values: Record<string, string | number | null>; detail?: string; evidence?: Record<string, unknown> };
export type EvidenceTable = { title: string; columns: string[]; rows: EvidenceRow[]; total: number | null; note?: string };
export type EvidenceSeries = { label: string; unit: string; points: { date: string; value: number | null }[] };
export type EvidenceReport = { tables: EvidenceTable[]; series: EvidenceSeries[]; notes: string[] };
export type ResearchUnit = { id: string; endpoint: string; path: string; body: Record<string, unknown>; estimateUsd: number; label: string; mode?: "reviews"; chargeId?: string; startedAt?: string; status?: "running" | "waiting" | "completed"; taskId?: string; costUsd?: number; collectedAt?: string; raw?: Record<string, unknown>[]; report?: EvidenceReport };
export type ResearchPayload = { input: ResearchInput; market: { locationCode: number; languageCode: string; label: string }; units: ResearchUnit[]; estimateUsd: number; notes: string[]; error?: string; lease?: string; report?: EvidenceReport };
export type ResearchRun = { id: string; siteSlug: string; feature: ResearchFeature; status: string; createdAt: string; updatedAt: string; nextRunAt: string | null; payload: ResearchPayload };
export const researchFeature = (id: string) => RESEARCH_FEATURES.find((feature) => feature.id === id);
export const researchKind = (feature: ResearchFeature) => `research_${feature}`;
export const money = (value: number) => `$${value.toFixed(value < .1 ? 4 : 2)}`;

/** Resolve labels on read so earlier saved evidence needs no rewrite or paid recollection. */
export function researchReportLabels(feature: ResearchFeature, report: EvidenceReport | undefined): EvidenceReport | undefined {
  if (!report || !["countries", "autocomplete"].includes(feature)) return report;
  return { ...report, tables: report.tables.map(table => ({ ...table, rows: table.rows.map(row => {
    const code = row.values[feature === "countries" ? "Location code" : "Location"];
    if (typeof code !== "number") return row;
    if (feature === "countries") return { ...row, label: !row.label || row.label === String(code) ? marketLabel(code) : row.label };
    return { ...row, values: { ...row.values, Location: marketLabel(code), "Location code": code } };
  }) })) };
}
export function safeEvidenceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try { const url = new URL(value); if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.toString(); } catch { /* Missing links stay unavailable. */ }
}

/** Complete-link grouping prevents weak A↔B↔C chains from pretending A and C share intent. */
export function clusterSearchResults(samples: { keyword: string; urls: string[] }[]): EvidenceRow[] {
  const normalize = (url: string) => { try { const parsed = new URL(url); parsed.hash = ""; return parsed.toString().replace(/\/$/, ""); } catch { return ""; } };
  const input = samples.map((row) => ({ ...row, urls: [...new Set(row.urls.map(normalize).filter(Boolean))].slice(0, 10) })).filter((row) => row.urls.length >= 3).sort((a, b) => a.keyword.localeCompare(b.keyword));
  const groups: typeof input[] = [];
  const overlap = (a: typeof input[number], b: typeof input[number]) => a.urls.filter((url) => b.urls.includes(url)).length;
  for (const item of input) {
    const group = groups.find((group) => group.every((member) => overlap(member, item) >= 3));
    if (group) group.push(item); else groups.push([item]);
  }
  return groups.map((group) => ({ id: group[0]!.keyword, label: group[0]!.keyword, keywords: group.map((row) => row.keyword), values: { Keywords: group.length, "Minimum shared URLs": group.length > 1 ? Math.min(...group.flatMap((a, i) => group.slice(i + 1).map((b) => overlap(a, b)))) : null }, detail: group.map((row) => row.keyword).join(" · "), evidence: { samples: group } })).sort((a, b) => b.keywords!.length - a.keywords!.length);
}

/** Compare equal, complete windows within one normalised trend series. No causal claim. */
export function trendSummary(series: EvidenceSeries): EvidenceRow {
  const ordered = [...series.points].sort((a, b) => a.date.localeCompare(b.date));
  const valid = ordered.filter((point) => point.value != null);
  const latest = ordered.slice(-4), prior = ordered.slice(-8, -4);
  const average = (points: typeof valid) => points.reduce((sum, point) => sum + point.value!, 0) / points.length;
  const recent = latest.length === 4 && latest.every((point) => point.value != null) ? average(latest) : null;
  const before = prior.length === 4 && prior.every((point) => point.value != null) ? average(prior) : null;
  const change = recent != null && before != null && before > 0 ? Math.round((recent / before - 1) * 1000) / 10 : null;
  const months = new Map<string, number[]>();
  for (const point of valid) { const month = point.date.slice(0, 7); months.set(month, [...(months.get(month) ?? []), point.value!]); }
  const peak = [...months].map(([month, values]) => ({ month, mean: values.reduce((sum, value) => sum + value, 0) / values.length })).sort((a, b) => b.mean - a.mean)[0];
  return { id: series.label, label: series.label, keywords: [series.label], values: { "Latest 4 periods": recent == null ? null : Math.round(recent * 10) / 10, "Change %": change, "Highest interest month": peak?.month ?? null }, detail: "Relative interest, 0–100. Compare within this collected series. A coinciding traffic change does not establish its cause.", evidence: { latest, prior } };
}

export function compareEvidenceDates(series: EvidenceSeries, from: string, to: string) {
  const before = series.points.find((point) => point.date === from)?.value ?? null;
  const after = series.points.find((point) => point.date === to)?.value ?? null;
  return { before, after, change: before == null || after == null ? null : after - before, percent: before == null || after == null || before === 0 ? null : (after / before - 1) * 100 };
}
