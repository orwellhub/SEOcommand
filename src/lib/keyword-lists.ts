import type { KeywordResearchResult, KeywordResearchRow } from "@/lib/types";
export function unmeasuredKeyword(keyword: string): KeywordResearchRow {
  return { keyword, volume: null, difficulty: null, cpc: null, competition: null, competitionLevel: null, intent: null, lowTopBid: null, highTopBid: null, trend: [], monthlySearches: [] };
}
/** Merge within a database only; keep the latest evidence and all original saved lists. */
export function mergeKeywordLists(results: KeywordResearchResult[], name: string): KeywordResearchResult {
  if (!results.length) throw new Error("Select at least one list.");
  const first = results[0]!;
  if (results.some(row => row.locationCode !== first.locationCode || row.languageCode !== first.languageCode)) throw new Error("Merge lists from the same country and language. Different databases must remain separate.");
  const rows = new Map<string, KeywordResearchRow>();
  for (const result of [...results].sort((a,b) => a.fetchedAt.localeCompare(b.fetchedAt))) {
    for (const row of result.rows) rows.set(row.keyword.trim().toLowerCase(), { ...row, updatedAt: row.updatedAt ?? result.fetchedAt });
  }
  if (rows.size > 20000) throw new Error("A list can hold up to 20,000 keywords. Choose fewer lists.");
  return { ...first, seed: name, pagination: undefined, fetchedAt: [...results].map(row => row.fetchedAt).sort().at(-1)!, rows: [...rows.values()] };
}
