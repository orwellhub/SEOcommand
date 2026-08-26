import type { GscRow, Keyword } from "@/lib/types";

export interface DiscoveredAiOpportunity {
  prompt: string;
  topic: string;
  source: string;
  intent: string | null;
  aiSearchVolume: number | null;
  priorityScore: number;
  evidence: Record<string, unknown>;
}

function questionFor(query: string): string {
  const trimmed = query.trim().replace(/[?.!]+$/, "");
  if (/^(who|what|when|where|why|how|which|can|does|is|are|should)\b/i.test(trimmed)) return `${trimmed}?`;
  return `What should I know about ${trimmed}?`;
}

export function discoverAiPromptOpportunities(input: {
  gscQueries?: GscRow[];
  keywords?: Keyword[];
  fanOutQueries?: string[];
}): DiscoveredAiOpportunity[] {
  const found = new Map<string, DiscoveredAiOpportunity>();
  for (const row of (input.gscQueries ?? []).filter((item) => item.impressions >= 10).slice(0, 100)) {
    const prompt = questionFor(row.key);
    found.set(prompt.toLowerCase(), {
      prompt,
      topic: "Search demand",
      source: "gsc",
      intent: null,
      aiSearchVolume: null,
      priorityScore: Math.min(95, Math.round(35 + Math.log10(row.impressions + 1) * 18 + (row.position <= 20 ? 12 : 0))),
      evidence: { query: row.key, impressions: row.impressions, clicks: row.clicks, position: row.position },
    });
  }
  for (const keyword of (input.keywords ?? []).slice(0, 100)) {
    const prompt = questionFor(keyword.keyword);
    if (found.has(prompt.toLowerCase())) continue;
    found.set(prompt.toLowerCase(), {
      prompt,
      topic: "Keyword demand",
      source: "keyword",
      intent: keyword.intent,
      aiSearchVolume: keyword.volume,
      priorityScore: Math.min(90, Math.round(30 + Math.log10(keyword.volume + 1) * 15 + keyword.trafficPotential / 100)),
      evidence: { keyword: keyword.keyword, volume: keyword.volume, difficulty: keyword.difficulty },
    });
  }
  for (const query of input.fanOutQueries ?? []) {
    const prompt = questionFor(query);
    found.set(prompt.toLowerCase(), {
      prompt,
      topic: "AI fan-out",
      source: "fan_out",
      intent: "informational",
      aiSearchVolume: null,
      priorityScore: 72,
      evidence: { query },
    });
  }
  return [...found.values()].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 100);
}
