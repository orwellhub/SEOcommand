/**
 * Classify GA4 session source/medium rows into the traffic classes Orwell One reports
 * (2 Nov 2026). Search Console sees only Google; this is how AI assistants and the other
 * search engines become visible. Pure and deterministic: tested in traffic-classes.test.ts.
 */
import type { Ga4SourceRow } from "./types";

export const TRAFFIC_CLASSES = ["google_organic", "other_search", "ai_assistants", "paid", "social", "email", "referral", "direct", "other"] as const;
export type TrafficClass = (typeof TRAFFIC_CLASSES)[number];

export const TRAFFIC_CLASS_LABELS: Record<TrafficClass, string> = {
  google_organic: "Google organic",
  other_search: "Other search engines",
  ai_assistants: "AI assistants",
  paid: "Paid",
  social: "Social",
  email: "Email",
  referral: "Referral",
  direct: "Direct",
  other: "Other",
};

/** Hosts (or host suffixes) of AI assistants that send clicks. Matched on the source's host. */
const AI_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$|(^|\.)openai\.com$|^chatgpt$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$|^perplexity$/, "Perplexity"],
  [/(^|\.)claude\.ai$|^claude$/, "Claude"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$|^gemini$/, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$|(^|\.)copilot\.cloud\.microsoft$|^copilot$/, "Microsoft Copilot"],
  [/(^|\.)you\.com$/, "You.com"],
  [/(^|\.)phind\.com$/, "Phind"],
  [/(^|\.)poe\.com$/, "Poe"],
  [/(^|\.)deepseek\.com$|(^|\.)chat\.deepseek\.com$/, "DeepSeek"],
  [/(^|\.)meta\.ai$/, "Meta AI"],
  [/(^|\.)grok\.com$|(^|\.)x\.ai$/, "Grok"],
  [/(^|\.)chat\.mistral\.ai$|(^|\.)mistral\.ai$/, "Mistral"],
];

/** Search engines other than Google, matched on the source name GA4 records for organic traffic. */
const OTHER_SEARCH: Array<[RegExp, string]> = [
  [/^bing$|(^|\.)bing\.com$/, "Bing"],
  [/^duckduckgo$|(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/^yahoo$|(^|\.)search\.yahoo\.com$/, "Yahoo"],
  [/^yandex$|(^|\.)yandex\.(com|ru)$/, "Yandex"],
  [/^ecosia(\.org)?$|(^|\.)ecosia\.org$/, "Ecosia"],
  [/^baidu$|(^|\.)baidu\.com$/, "Baidu"],
  [/^brave$|(^|\.)search\.brave\.com$/, "Brave"],
  [/^naver$|(^|\.)naver\.com$/, "Naver"],
  [/^seznam$|(^|\.)seznam\.cz$/, "Seznam"],
  [/^qwant$|(^|\.)qwant\.com$/, "Qwant"],
  [/^startpage$|(^|\.)startpage\.com$/, "Startpage"],
];

function host(source: string): string {
  return source.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

export function aiAssistantName(source: string): string | null {
  const h = host(source);
  for (const [re, name] of AI_SOURCES) if (re.test(h)) return name;
  return null;
}

export function otherSearchName(source: string): string | null {
  const h = host(source);
  for (const [re, name] of OTHER_SEARCH) if (re.test(h)) return name;
  return null;
}

/**
 * Order matters: an AI assistant is recognised whatever medium GA4 gave it (referral,
 * utm_source=chatgpt.com with medium "(not set)" or "referral"); paid wins over organic.
 */
export function classifyTraffic(row: Pick<Ga4SourceRow, "source" | "medium" | "channel">): TrafficClass {
  const source = (row.source ?? "").toLowerCase();
  const medium = (row.medium ?? "").toLowerCase();
  const channel = (row.channel ?? "").toLowerCase();
  if (aiAssistantName(source)) return "ai_assistants";
  if (/^(cpc|ppc|paid|paidsearch|cpm|display)$/.test(medium) || channel.startsWith("paid") || channel === "display" || channel === "cross-network") return "paid";
  if (medium === "organic" || channel === "organic search") {
    if (/^google$|(^|\.)google\.[a-z.]+$/.test(host(source))) return "google_organic";
    return "other_search";
  }
  if (channel === "organic social" || channel === "paid social" || /^(social|social-network|social-media|sm)$/.test(medium)) return "social";
  if (medium === "email" || channel === "email") return "email";
  if (source === "(direct)" && (medium === "(none)" || medium === "(not set)")) return "direct";
  if (channel === "direct") return "direct";
  if (medium === "referral" || channel === "referral") return "referral";
  return "other";
}

export interface ClassTotals { sessions: number; engagedSessions: number; keyEvents: number; leads: number }

export function summariseByClass(rows: Ga4SourceRow[]): Record<TrafficClass, ClassTotals> {
  const out = Object.fromEntries(TRAFFIC_CLASSES.map((k) => [k, { sessions: 0, engagedSessions: 0, keyEvents: 0, leads: 0 }])) as Record<TrafficClass, ClassTotals>;
  for (const r of rows) {
    const t = out[classifyTraffic(r)];
    t.sessions += r.sessions; t.engagedSessions += r.engagedSessions; t.keyEvents += r.keyEvents; t.leads += r.leads ?? 0;
  }
  return out;
}

/** Totals per named source inside one class (AI assistants by product, other engines by name). */
export function bySourceName(rows: Ga4SourceRow[], cls: "ai_assistants" | "other_search"): Array<{ name: string } & ClassTotals> {
  const m = new Map<string, ClassTotals>();
  for (const r of rows) {
    if (classifyTraffic(r) !== cls) continue;
    const name = (cls === "ai_assistants" ? aiAssistantName(r.source) : otherSearchName(r.source)) ?? r.source;
    const t = m.get(name) ?? { sessions: 0, engagedSessions: 0, keyEvents: 0, leads: 0 };
    t.sessions += r.sessions; t.engagedSessions += r.engagedSessions; t.keyEvents += r.keyEvents; t.leads += r.leads ?? 0;
    m.set(name, t);
  }
  return [...m.entries()].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.sessions - a.sessions);
}
