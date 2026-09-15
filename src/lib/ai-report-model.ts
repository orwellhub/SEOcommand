import type { AiVisibilityDashboard } from "@/platform/ai-read-model";
export type AiObservation = AiVisibilityDashboard["observations"][number];
export type GapKind = "all" | "missing" | "weak" | "shared" | "strong" | "unique" | "unobserved";
const key = (value:string) => value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").trim();
export function aiCompetitorMatrix(observations: AiObservation[], domains: string[], group: "prompt" | "topic") {
  const groups=new Map<string,AiObservation[]>();
  for(const row of observations){const label=group==="topic"?row.topic||"Unassigned":row.prompt;groups.set(label,[...(groups.get(label)??[]),row]);}
  return [...groups].map(([label,items])=>{
    const unique=[...new Map(items.map(row=>[row.id,row])).values()];
    const own=unique.filter(row=>row.mentioned).length;
    const rivals=domains.map(domain=>unique.filter(row=>row.entities.some(entity=>!entity.owned && [entity.host??"",entity.name].some(name=>key(name)===key(domain)))).length);
    const max=Math.max(0,...rivals),min=rivals.length?Math.min(...rivals):0;
    const kind:GapKind=own===0&&max===0?"unobserved":own===0&&max>0?"missing":own>0&&max===0?"unique":own<max?"weak":own>max?"strong":"shared";
    return {label,checks:unique.length,own,rivals,kind,shared:own>0&&min>0,prompts:[...new Set(unique.map(row=>row.prompt))],observations:unique};
  }).sort((a,b)=>b.checks-a.checks||a.label.localeCompare(b.label));
}
export function aiSourceRows(observations:AiObservation[],pages=false) {
  const grouped=new Map<string,{key:string;domain:string;url:string;owned:boolean;ids:Set<string>;prompts:Set<string>;platforms:Set<string>;urls:Set<string>;latest:string}>();
  for(const observation of observations)for(const citation of observation.citations){
    const id=pages?citation.url:citation.domain;
    const row=grouped.get(id)??{key:id,domain:citation.domain,url:citation.url,owned:citation.owned,ids:new Set(),prompts:new Set(),platforms:new Set(),urls:new Set(),latest:""};
    row.ids.add(observation.id);row.prompts.add(observation.prompt);row.platforms.add(observation.platform);row.urls.add(citation.url);
    const date=new Date(observation.capturedAt).toISOString();if(date>row.latest)row.latest=date;grouped.set(id,row);
  }
  return [...grouped.values()].map(row=>({...row,checks:row.ids.size,prompts:[...row.prompts],platforms:[...row.platforms],urls:[...row.urls],observationIds:[...row.ids]})).sort((a,b)=>b.checks-a.checks);
}
export function aiBrandRows(observations:AiObservation[]) {
  const map=new Map<string,{name:string;host:string|null;owned:boolean;ids:Set<string>;sources:Set<string>;prompts:Set<string>;positive:number;negative:number}>();
  for(const observation of observations){const seen=new Set<string>();for(const entity of observation.entities.filter(row=>["brand","competitor"].includes(row.entityType))){const id=key(entity.host||entity.name);if(seen.has(id))continue;seen.add(id);const row=map.get(id)??{name:entity.name,host:entity.host,owned:entity.owned,ids:new Set(),sources:new Set(),prompts:new Set(),positive:0,negative:0};row.ids.add(observation.id);row.prompts.add(observation.prompt);for(const citation of observation.citations)row.sources.add(citation.domain);if(entity.sentiment==="positive")row.positive++;if(entity.sentiment==="negative")row.negative++;map.set(id,row);}}
  return [...map.values()].map(row=>({...row,mentions:row.ids.size,sources:row.sources.size,prompts:[...row.prompts],observationIds:[...row.ids]})).sort((a,b)=>b.mentions-a.mentions);
}
export function narrativeRows(observations:AiObservation[]) {
  return aiCompetitorMatrix(observations,[],"topic").map(row=>({...row,positive:row.observations.filter(r=>r.mentioned&&r.sentiment==="positive").length,negative:row.observations.filter(r=>r.mentioned&&r.sentiment==="negative").length,neutral:row.observations.filter(r=>r.mentioned&&!["positive","negative"].includes(r.sentiment)).length}));
}
