import { createHash } from "node:crypto";
import type {
  AiCitationEvidence,
  AiEntityEvidence,
  AiObservationInput,
  AiVisibilityPlatform,
} from "./types";

type UnknownRecord = Record<string, unknown>;

export interface AiAnalysisOptions {
  promptId?: string | null;
  siteSlug: string;
  siteName: string;
  siteHost: string;
  prompt: string;
  topic: string;
  platform: AiVisibilityPlatform;
  modelName: string;
  sampleIndex?: number;
  capturedOn: string;
  raw: unknown;
  competitors?: { name?: string; host: string }[];
  costUsd?: number;
}

const POSITIVE = [
  "best", "excellent", "leading", "recommended", "reliable", "strong", "trusted", "useful",
  "good", "great", "top", "popular", "transparent", "competitive", "specialist",
];
const NEGATIVE = [
  "avoid", "bad", "complaint", "expensive", "limited", "poor", "risk", "weak", "worst",
  "unreliable", "concern", "drawback", "problem", "negative",
];
const TEXT_KEYS = new Set(["text", "content", "answer", "response", "message", "snippet", "description"]);
const URL_KEYS = new Set(["url", "link", "source_url", "cited_url"]);

function record(value: unknown): UnknownRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanHost(value: string): string {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? value;
  }
}

function walk(value: unknown, visit: (item: unknown, key: string | null) => void, key: string | null = null) {
  visit(value, key);
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, key);
    return;
  }
  const obj = record(value);
  if (!obj) return;
  for (const [childKey, child] of Object.entries(obj)) walk(child, visit, childKey);
}

export function extractAiResponseText(raw: unknown): string {
  const candidates: string[] = [];
  walk(raw, (value, key) => {
    if (typeof value !== "string" || !key || !TEXT_KEYS.has(key.toLowerCase())) return;
    const trimmed = value.trim();
    if (trimmed.length >= 16 && !/^https?:\/\//i.test(trimmed)) candidates.push(trimmed);
  });
  const joined = [...new Set(candidates)].join("\n\n");
  return joined || (typeof raw === "string" ? raw : "");
}

export function extractAiCitations(raw: unknown, ownedHost: string): AiCitationEvidence[] {
  const byUrl = new Map<string, Omit<AiCitationEvidence, "position">>();
  const canonicalOwned = cleanHost(ownedHost);
  walk(raw, (value) => {
    const obj = record(value);
    if (!obj) return;
    let url: string | null = null;
    for (const [key, child] of Object.entries(obj)) {
      if (URL_KEYS.has(key.toLowerCase()) && typeof child === "string" && /^https?:\/\//i.test(child)) {
        url = child;
        break;
      }
    }
    if (!url || byUrl.has(url)) return;
    const domain = cleanHost(url);
    byUrl.set(url, {
      url,
      domain,
      title: typeof obj.title === "string" ? obj.title : null,
      owned: domain === canonicalOwned || domain.endsWith(`.${canonicalOwned}`),
    });
  });
  return [...byUrl.values()].map((item, index) => ({ ...item, position: index + 1 }));
}

export function extractFanOutQueries(raw: unknown): string[] {
  const found: string[] = [];
  walk(raw, (value, key) => {
    if (!key || !["fan_out_queries", "fanout_queries", "related_queries"].includes(key.toLowerCase())) return;
    if (Array.isArray(value)) {
      for (const query of value) {
        if (typeof query === "string" && query.trim()) found.push(query.trim());
        else {
          const item = record(query);
          if (typeof item?.query === "string" && item.query.trim()) found.push(item.query.trim());
        }
      }
    }
  });
  return [...new Set(found)];
}

function aliases(name: string, host: string): string[] {
  const hostname = cleanHost(host);
  const stem = hostname.split(".")[0] ?? hostname;
  return [...new Set([name, hostname, stem, name.replace(/\s+/g, "")])]
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 2);
}

function firstAliasIndex(text: string, values: string[]): number {
  const lower = text.toLowerCase();
  return values.reduce((best, alias) => {
    const index = lower.indexOf(alias);
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
}

function sentimentAt(text: string, index: number): "positive" | "neutral" | "negative" {
  if (index < 0) return "neutral";
  const window = text.slice(Math.max(0, index - 180), index + 260).toLowerCase();
  const score = POSITIVE.filter((word) => window.includes(word)).length
    - NEGATIVE.filter((word) => window.includes(word)).length;
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
}

function recommendationPosition(text: string, aliasIndex: number): number | null {
  if (aliasIndex < 0) return null;
  const before = text.slice(0, aliasIndex);
  const line = before.split(/\r?\n/).at(-1) ?? "";
  const inline = line.match(/(?:^|\s)(\d{1,2})[.)]\s/);
  if (inline) return Number(inline[1]);
  const numbered = [...before.matchAll(/(?:^|\n)\s*(\d{1,2})[.)]\s/g)].at(-1);
  return numbered ? Number(numbered[1]) : null;
}

export function analyseAiResponse(options: AiAnalysisOptions): AiObservationInput {
  const responseText = extractAiResponseText(options.raw);
  const brandAliases = aliases(options.siteName, options.siteHost);
  const brandIndex = firstAliasIndex(responseText, brandAliases);
  const citations = extractAiCitations(options.raw, options.siteHost);
  const mentioned = brandIndex >= 0;
  const cited = citations.some((citation) => citation.owned);
  const sentiment = sentimentAt(responseText, brandIndex);
  const entities: AiEntityEvidence[] = [];

  if (mentioned || cited) {
    entities.push({
      name: options.siteName,
      host: cleanHost(options.siteHost),
      entityType: "brand",
      position: recommendationPosition(responseText, brandIndex),
      sentiment,
      owned: true,
    });
  }
  for (const competitor of options.competitors ?? []) {
    const values = aliases(competitor.name ?? competitor.host, competitor.host);
    const index = firstAliasIndex(responseText, values);
    if (index < 0) continue;
    entities.push({
      name: competitor.name ?? cleanHost(competitor.host),
      host: cleanHost(competitor.host),
      entityType: "competitor",
      position: recommendationPosition(responseText, index),
      sentiment: sentimentAt(responseText, index),
      owned: false,
    });
  }

  const recommendation = recommendationPosition(responseText, brandIndex);
  const confidence = Math.min(1, 0.35 + (mentioned ? 0.3 : 0) + (cited ? 0.25 : 0) + (recommendation ? 0.1 : 0));
  return {
    promptId: options.promptId ?? null,
    siteSlug: options.siteSlug,
    prompt: options.prompt,
    topic: options.topic,
    platform: options.platform,
    modelName: options.modelName,
    sampleIndex: options.sampleIndex ?? 0,
    capturedOn: options.capturedOn,
    mentioned,
    cited,
    recommendationPosition: recommendation,
    sentiment,
    confidence,
    responseText,
    responseHash: createHash("sha256").update(responseText).digest("hex"),
    fanOutQueries: extractFanOutQueries(options.raw),
    raw: record(options.raw) ?? { value: options.raw },
    costUsd: options.costUsd ?? 0,
    citations,
    entities,
  };
}
