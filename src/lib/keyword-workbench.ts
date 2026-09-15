import type { KeywordResearchRow } from "./types";

export type WorkbenchKeyword = KeywordResearchRow & { marketCode: number; marketLabel: string; languageCode: string };
export type KeywordMatch = "all" | "broad" | "phrase" | "exact" | "related";
export type KeywordFilters = { match: KeywordMatch; questions: boolean; include: string; exclude: string; intent: string; minVolume: string; maxVolume: string; minDifficulty: string; maxDifficulty: string; minCpc: string; maxCpc: string; minWords: string; maxWords: string; market: string; group: string[] };
export const EMPTY_KEYWORD_FILTERS: KeywordFilters = { match: "all", questions: false, include: "", exclude: "", intent: "", minVolume: "", maxVolume: "", minDifficulty: "", maxDifficulty: "", minCpc: "", maxCpc: "", minWords: "", maxWords: "", market: "", group: [] };
export const keywordKey = (row: WorkbenchKeyword) => `${row.marketCode}:${row.languageCode}:${row.keyword.toLocaleLowerCase()}`;
export function keywordWords(text: string): string[] { return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
const stop = new Set("a an and are as at be by for from how in is it of on or that the this to what when where which who why with you your".split(" "));
function stem(word: string) { return word.length > 4 ? word.replace(/ies$/, "y").replace(/s$/, "") : word; }
function inRange(value: number | null, min: string, max: string) { return !min && !max || value != null && (!min || value >= Number(min)) && (!max || value <= Number(max)); }
export function filterKeywords(rows: WorkbenchKeyword[], seed: string, filters: KeywordFilters) {
  const source = keywordWords(seed);
  const includes = filters.include.split(",").map(s => s.trim().toLocaleLowerCase()).filter(Boolean);
  const excludes = filters.exclude.split(",").map(s => s.trim().toLocaleLowerCase()).filter(Boolean);
  return rows.filter(row => {
    const words = keywordWords(row.keyword), text = words.join(" ");
    const phrase = source.every(w => words.includes(w));
    const broad = source.every(w => words.some(term => (row.languageCode === "en" ? stem(term) === stem(w) : term === w)));
    if (source.length && (filters.match === "broad" && !broad || filters.match === "phrase" && !phrase || filters.match === "exact" && !(` ${text} `.includes(` ${source.join(" ")} `)) || filters.match === "related" && row.relatedToSeed!==true)) return false;
    if (filters.questions && !/^(how|what|when|where|which|who|why|can|could|does|do|is|are|should|will|would)\b/i.test(row.keyword) && !row.keyword.includes("?")) return false;
    if (includes.some(term => !row.keyword.toLocaleLowerCase().includes(term)) || excludes.some(term => row.keyword.toLocaleLowerCase().includes(term))) return false;
    return (!filters.market || `${row.marketCode}:${row.languageCode}` === filters.market) && (!filters.intent || row.intent === filters.intent) && filters.group.every(term => words.includes(term)) && inRange(row.volume, filters.minVolume, filters.maxVolume) && inRange(row.difficulty, filters.minDifficulty, filters.maxDifficulty) && inRange(row.cpc, filters.minCpc, filters.maxCpc) && inRange(words.length, filters.minWords, filters.maxWords);
  });
}
export function keywordGroups(rows: WorkbenchKeyword[], seed: string, parents: string[] = []) {
  const omitted = new Set([...keywordWords(seed), ...parents, ...stop]);
  const groups = new Map<string, { term: string; count: number; volume: number | null }>();
  for (const row of rows) {
    const words = keywordWords(row.keyword);
    if (!parents.every(term => words.includes(term))) continue;
    for (const term of new Set(words.filter(word => !omitted.has(word)))) {
      const previous = groups.get(term) ?? { term, count: 0, volume: null };
      groups.set(term, { term, count: previous.count + 1, volume: row.volume == null ? previous.volume : (previous.volume ?? 0) + row.volume });
    }
  }
  return [...groups.values()].sort((a,b) => b.count - a.count || a.term.localeCompare(b.term));
}
export function keywordSummary(rows: WorkbenchKeyword[]) {
  const volumes = rows.flatMap(r => r.volume == null ? [] : [r.volume]), difficulties = rows.flatMap(r => r.difficulty == null ? [] : [r.difficulty]);
  return { count: rows.length, volume: volumes.length ? volumes.reduce((a,b) => a+b,0) : null, difficulty: difficulties.length ? difficulties.reduce((a,b) => a+b,0)/difficulties.length : null, measuredVolumes: volumes.length };
}

/** Recurring phrases form topic groups, separately from single-term grouping. */
export function keywordTopics(rows:WorkbenchKeyword[],seed:string,parents:string[]=[]){
 const seedWords=new Set(keywordWords(seed)),groups=new Map<string,{term:string;count:number;volume:number|null}>();
 for(const row of rows){const words=keywordWords(row.keyword);if(!parents.every(word=>words.includes(word)))continue;const phrases=new Set<string>();
  for(let i=0;i<words.length-1;i++){const pair=words.slice(i,i+2);if(pair.some(word=>seedWords.has(word)||parents.includes(word))||pair.every(word=>stop.has(word)))continue;phrases.add(pair.join(" "));}
  for(const term of phrases){const old=groups.get(term)??{term,count:0,volume:null};groups.set(term,{term,count:old.count+1,volume:row.volume==null?old.volume:(old.volume??0)+row.volume});}
 }
 return [...groups.values()].sort((a,b)=>b.count-a.count||a.term.localeCompare(b.term));
}
