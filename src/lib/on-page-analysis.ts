import type { ContentBenchmark } from "./content-analysis";
import type { DomainLiveBundle } from "./live";
import { urlKey } from "./command-model";
export type IdeaCategory="strategy"|"content"|"semantics"|"backlinks"|"technical"|"experience"|"serp";
export type OnPageIdea={id:string;category:IdeaCategory;title:string;detail:string;priority:"high"|"medium"|"low";evidence:string[]};
export type SerpPage={url:string;title:string;position:number;description:string};
export type OnPageReport={id:string;kind?:"page"|"template";keyword:string;url:string;locationCode:number;languageCode:string;collectedAt:string;serp:SerpPage[];features:string[];own:ContentBenchmark|null;benchmarks:ContentBenchmark[];failures:{url:string;reason:string}[];ideas:OnPageIdea[];costUsd:number;decisions:Record<string,"open"|"done"|"dismissed">;supplemental?:{links:string|null;analytics:string|null};verification?:{checkedAt:string;resolved:string[];remaining:string[]}};
export const IDEA_CATEGORIES:Record<IdeaCategory,string>={strategy:"Strategy",content:"Content",semantics:"Semantic",backlinks:"Backlinks",technical:"Technical SEO",experience:"User experience",serp:"SERP features"};
export function onPageIdeas(own:ContentBenchmark|null,competitors:ContentBenchmark[],keyword:string,serp:SerpPage[],features:string[]):OnPageIdea[]{
 if(!own)return [];
 const ideas:OnPageIdea[]=[];const add=(id:string,category:IdeaCategory,title:string,detail:string,priority:OnPageIdea["priority"],evidence:string[])=>ideas.push({id,category,title,detail,priority,evidence});
 const has=(text:string)=>text.toLowerCase().includes(keyword.toLowerCase());
 if(!has(own.title))add("title-keyword","content","Align the page title with the target query","The target phrase is absent from the title. Add it naturally if it accurately describes this page.","high",[own.title||"No title found"]);
 if(!own.description)add("meta-description","content","Write a useful search description","No meta description was found in the returned HTML. Summarise the page and its value to the searcher.","medium",[own.url]);
 if(!own.h1?.length)add("missing-h1","technical","Add a clear main heading","No H1 was present in the HTML. Check the rendered page and add a descriptive heading if missing.","high",[own.url]);
 if((own.h1?.length??0)>1)add("multiple-h1","content","Review the heading hierarchy","Multiple H1 headings were found. Check whether one main heading would make the structure clearer.","low",own.h1??[]);
 if(own.noindex)add("noindex","technical","Review the noindex directive","This page asks search engines not to index it. Remove the directive if it should compete for this keyword.","high",["robots: noindex"]);
 if(!own.canonical)add("canonical","technical","Review canonical URL signals","No canonical link was found in the HTML. Confirm the preferred URL and account for duplicates before adding one.","medium",[own.url]);
 if((own.missingAlt??0)>0)add("image-alt","experience","Review images without descriptive alternative text",`${own.missingAlt} of ${own.imageCount} images have missing or empty alt attributes. Decorative images can correctly use empty alt text.`,"medium",[own.url]);
 const lengths=competitors.map(page=>page.wordCount).sort((a,b)=>a-b),median=lengths.length?lengths[Math.floor(lengths.length/2)]!:null;
 if(median&&own.wordCount<median*.5)add("coverage-depth","content","Check whether the page answers the topic fully",`The page has ${own.wordCount} extracted words; the median among ${competitors.length} readable competing pages is ${median}. Investigate missing answers rather than padding the word count.`,"medium",competitors.map(page=>page.url));
 const ownTerms=new Set(own.topTerms?.map(item=>item.term)??[]),terms=new Map<string,Set<string>>();
 for(const page of competitors)for(const item of page.topTerms?.slice(0,40)??[]){const sources=terms.get(item.term)??new Set<string>();sources.add(page.url);terms.set(item.term,sources);}
 const shared=[...terms].filter(([term,sources])=>!ownTerms.has(term)&&!keyword.toLowerCase().includes(term)&&sources.size>=Math.max(2,Math.ceil(competitors.length*.4))).sort((a,b)=>b[1].size-a[1].size).slice(0,12);
 if(shared.length)add("semantic-coverage","semantics","Review topics recurring across competing pages",`Terms prominent in competing HTML but not among this page’s top terms: ${shared.map(([term])=>term).join(", ")}. Include only those relevant to the page and intent.`,"medium",[...new Set(shared.flatMap(([,sources])=>[...sources]))]);
 const rank=serp.find(page=>new URL(page.url).pathname===new URL(own.url).pathname&&new URL(page.url).hostname===new URL(own.url).hostname);
 const siblings=serp.filter(page=>new URL(page.url).hostname===new URL(own.url).hostname&&page.url!==own.url);
 if(!rank&&siblings.length)add("target-page","strategy","Review the page competing for this keyword","Another page on your domain appears in the observed top results. Decide which page best satisfies this query before optimising both.","high",siblings.map(page=>page.url));
 if(features.includes("people_also_ask")&&!own.headings.some(heading=>/^(how|what|why|when|can|does|is)\b/i.test(heading)))add("answer-questions","serp","Consider a concise answer section","People Also Ask appears for this query. Review the observed questions and answer relevant ones clearly on the page.","medium",["Observed SERP feature: people_also_ask"]);
 return ideas;
}

/** Supplemental recommendations retain their own saved dates and sample limits. */
export function savedPageIdeas(url:string,bundle:DomainLiveBundle):OnPageIdea[]{
 const host=new URL(url).hostname,key=urlKey(url,host),ideas:OnPageIdea[]=[];
 const links=bundle.datasets.backlinks;
 const risky=links?.data.filter(row=>urlKey(row.targetUrl,host)===key&&row.status!=="lost"&&row.toxicity>=60)??[];
 if(risky.length)ideas.push({id:"review-link-sources",category:"backlinks",title:"Review flagged links to this page",detail:`${risky.length} links in the saved sample have a provider spam score of at least 60. Review their source and relevance in Backlink Audit; a score alone is not grounds for disavowal. Link evidence saved ${links!.capturedOn}.`,priority:"medium",evidence:risky.map(row=>row.sourceUrl)});
 const analytics=bundle.datasets.ga4_landing_pages,rows=analytics?.data??[];
 const own=rows.find(row=>urlKey(row.landingPage,host)===key),sessions=rows.reduce((sum,row)=>sum+row.sessions,0);
 const average=sessions?rows.reduce((sum,row)=>sum+row.engagementRate*row.sessions,0)/sessions:null;
 if(own&&own.sessions>=30&&average!=null&&average>0&&own.engagementRate<average*.5)ideas.push({id:"review-engagement",category:"experience",title:"Investigate low organic landing-page engagement",detail:`This page's saved engagement rate is ${own.engagementRate.toFixed(1)}% across ${own.sessions} organic sessions, below half of the ${average.toFixed(1)}% session-weighted rate across saved landing pages. Check search intent, usability and tracking. This comparison is not a causal diagnosis. Analytics saved ${analytics!.capturedOn}.`,priority:"medium",evidence:[url]});
 return ideas;
}
