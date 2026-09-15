import type { Keyword } from "./types";
export type TopicPlan = { id: string; projectId?:string; sourceEvidence?:Record<string,unknown>; label: string; keywords: string[]; targetUrl: string; updatedAt: string };
export function keywordEffort(keywords: Keyword[]) {
  const wins = keywords.filter((k) => k.position != null && k.position <= 10 && Number.isFinite(k.difficulty)).map((k) => k.difficulty).sort((a, b) => a - b);
  const median = wins.length >= 5 ? wins.length % 2 ? wins[Math.floor(wins.length / 2)]! : (wins[wins.length / 2 - 1]! + wins[wins.length / 2]!) / 2 : null;
  return { baseline: median, sample: wins.length, rows: keywords.map((row) => ({ ...row, relativeEffort: median == null || !Number.isFinite(row.difficulty) ? "Insufficient evidence" : row.difficulty <= median ? "Within current benchmark" : row.difficulty <= median + 15 ? "Moderate stretch" : "Higher stretch" })) };
}
