export type ContentBenchmark = { url: string; title: string; headings: string[]; wordCount: number; readability?:number|null; capturedAt: string; description?: string; h1?: string[]; canonical?: string | null; noindex?: boolean; internalLinks?: number; externalLinks?: number; imageCount?: number; missingAlt?: number; topTerms?: {term:string;count:number}[]; phraseHashes?: number[] };
const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) ?? [];
function syllables(word: string) { if (word.length <= 3) return 1; return Math.max(1, (word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g) ?? []).length); }
export function analyseContent(text: string, keywords: string[], benchmarks: ContentBenchmark[] = []) {
  const allWords = words(text), count = allWords.length, sentences = text.split(/[.!?]+(?:\s|$)/).filter((item) => words(item).length).length;
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((match) => match[1]!);
  const normal = ` ${allWords.join(" ")} `;
  const coverage = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))].map((keyword) => { const phrase = words(keyword).join(" "), needle = ` ${phrase} `; let occurrences = 0, offset = 0; if (phrase) while ((offset = normal.indexOf(needle, offset)) !== -1) { occurrences++; offset++; } return { keyword, occurrences, inHeading: headings.some((heading) => ` ${words(heading).join(" ")} `.includes(needle)) }; });
  const topics = [...new Set(benchmarks.flatMap((item) => item.headings))].slice(0, 80).map((heading) => { const meaningful = words(heading).filter((word) => word.length > 3); const matches = meaningful.filter((word) => allWords.includes(word)).length; return { heading, missing: meaningful.length >= 2 && matches / meaningful.length < .5 }; });
  return { words: count, sentences, headings, readingMinutes: count ? Math.ceil(count / 220) : 0, readability: count >= 100 && sentences > 0 && allWords.filter(word=>/^[a-z\']+$/i.test(word)).length / count >= .9 ? Math.round((206.835 - 1.015 * count / sentences - 84.6 * allWords.reduce((sum, word) => sum + syllables(word), 0) / count) * 10) / 10 : null, coverage, topics, benchmarkWordRange: benchmarks.length ? { min: Math.min(...benchmarks.map((item) => item.wordCount)), max: Math.max(...benchmarks.map((item) => item.wordCount)) } : null };
}
export function benchmarkHtml(html: string, url: string, capturedAt = new Date().toISOString()): ContentBenchmark {
  const clean = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const body = html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const tagAttribute = (tag:string,name:string)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,"i"))?.[1]??"";
  const meta=[...html.matchAll(/<meta\b[^>]*>/gi)].map(match=>match[0]);
  const description=meta.find(tag=>tagAttribute(tag,"name").toLowerCase()==="description")??"";
  const robots=meta.find(tag=>tagAttribute(tag,"name").toLowerCase()==="robots")??"";
  const canonicalTag=[...html.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0]).find(tag=>tagAttribute(tag,"rel").toLowerCase()==="canonical");
  const links=[...body.matchAll(/<a\b[^>]*>/gi)].flatMap(match=>{try{return [new URL(tagAttribute(match[0],"href"),url)];}catch{return [];}}).filter(link=>["http:","https:"].includes(link.protocol));
  const images=[...body.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]);
  const allWords=words(clean(body)),termCounts=new Map<string,number>();
  for(const term of allWords.filter(term=>term.length>3&&!['this','that','with','from','your','have','will','they','their','about','there','which','these','were','been','more','when','what'].includes(term)))termCounts.set(term,(termCounts.get(term)??0)+1);
  return { url, capturedAt, readability:analyseContent(clean(body),[]).readability, description:clean(tagAttribute(description,"content")), h1:[...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match=>clean(match[1]!)), canonical:canonicalTag?tagAttribute(canonicalTag,"href"):null, noindex:tagAttribute(robots,"content").toLowerCase().includes("noindex"), internalLinks:links.filter(link=>link.hostname===new URL(url).hostname).length,externalLinks:links.filter(link=>link.hostname!==new URL(url).hostname).length,imageCount:images.length,missingAlt:images.filter(tag=>!tagAttribute(tag,"alt").trim()).length,topTerms:[...termCounts].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([term,count])=>({term,count})),phraseHashes:phraseHashes(clean(body)), title: clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), headings: [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => clean(match[1]!)).filter(Boolean).slice(0, 40), wordCount: words(clean(body)).length };
}

/** Fingerprints support comparisons without retaining competitor article text. */
export function phraseHashes(text:string){const terms=words(text),hashes=new Set<number>();for(let i=0;i<=terms.length-8;i++){const phrase=terms.slice(i,i+8).join(" ");let hash=2166136261;for(let j=0;j<phrase.length;j++){hash^=phrase.charCodeAt(j);hash=Math.imul(hash,16777619);}hashes.add(hash>>>0);}return [...hashes].slice(0,50000);}
export function originalityAgainstBenchmarks(text:string,benchmarks:ContentBenchmark[]){const hashes=phraseHashes(text);return benchmarks.filter(page=>page.phraseHashes?.length).map(page=>{const known=new Set(page.phraseHashes);const matched=hashes.filter(hash=>known.has(hash)).length;return {url:page.url,matched,total:hashes.length,overlapPercent:hashes.length?Math.round(matched/hashes.length*1000)/10:null};});}
