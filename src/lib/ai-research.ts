type Observation={id:string;prompt:string;platform:string;mentioned:boolean;capturedAt:Date|string;citations:{domain:string;url:string;owned:boolean}[];entities:{name:string;host:string|null;owned:boolean;entityType:string}[]};
/** A source gap needs actual competitor evidence in a response without our brand. */
export function competitorCitationGaps(observations:Observation[]){
 const sources=new Map<string,{domain:string;checks:number;platforms:Set<string>;prompts:Set<string>;urls:Set<string>;competitors:Set<string>;latest:string;observationIds:Set<string>}>();
 for(const row of observations){
  if(row.mentioned)continue;
  const competitors=row.entities.filter(entity=>!entity.owned&&entity.entityType==="competitor");
  if(!competitors.length)continue;
  for(const citation of row.citations.filter(item=>!item.owned)){
   const source=sources.get(citation.domain)??{domain:citation.domain,checks:0,platforms:new Set<string>(),prompts:new Set<string>(),urls:new Set<string>(),competitors:new Set<string>(),latest:"",observationIds:new Set<string>()};
   if(!source.observationIds.has(row.id)){source.checks++;source.observationIds.add(row.id);}
   source.platforms.add(row.platform);source.prompts.add(row.prompt);source.urls.add(citation.url);
   for(const entity of competitors)source.competitors.add(entity.name);
   const date=new Date(row.capturedAt).toISOString();if(date>source.latest)source.latest=date;
   sources.set(citation.domain,source);
  }
 }
 return [...sources.values()].sort((a,b)=>b.checks-a.checks).map(row=>({...row,platforms:[...row.platforms],prompts:[...row.prompts],urls:[...row.urls],competitors:[...row.competitors],observationIds:[...row.observationIds]}));
}
