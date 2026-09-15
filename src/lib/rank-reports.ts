export type TrackedKeyword = { id:string; keyword:string; campaignId:string|null; locationCode:number; languageCode:string; device:string; searchEngine:string; tags:string[]; targetUrl:string|null; active:boolean; cadence:string };
export type RankObservation = { trackedKeywordId:string; capturedOn:string; position:number|null; url:string|null; serpFeatures:string[]; ownedFeatures:string[]; competitors:{host:string;position:number;url:string|null}[] };
export type RankCampaign = {id:string;name:string;competitors:string[];defaultCadence:string;alertThreshold:number;updatedAt:string};
export function rankReportRows(keywords:TrackedKeyword[],history:RankObservation[],from:string,to:string){
  const byKeyword=new Map<string,RankObservation[]>();
  for(const row of history)if((!from||row.capturedOn>=from)&&(!to||row.capturedOn<=to))byKeyword.set(row.trackedKeywordId,[...(byKeyword.get(row.trackedKeywordId)??[]),row]);
  return keywords.map(keyword=>{const points=(byKeyword.get(keyword.id)??[]).sort((a,b)=>a.capturedOn.localeCompare(b.capturedOn));const first=points[0],last=points.at(-1);return {...keyword,history:points,position:last?.position??null,previous:first?.position??null,change:points.length>1&&first?.position!=null&&last?.position!=null?first.position-last.position:null,url:last?.url??null,lastChecked:last?.capturedOn??null,features:last?.serpFeatures??[],ownedFeatures:last?.ownedFeatures??[],competitors:last?.competitors??[],observed:!!last};});
}
export type RankReportRow=ReturnType<typeof rankReportRows>[number];
export function rankSummary(rows:RankReportRow[]){const observed=rows.filter(row=>row.observed),ranked=observed.filter(row=>row.position!=null);return {tracked:rows.length,observed:observed.length,top3:ranked.filter(row=>row.position!<=3).length,top10:ranked.filter(row=>row.position!<=10).length,average:ranked.length?Math.round(ranked.reduce((sum,row)=>sum+row.position!,0)/ranked.length*10)/10:null,improved:rows.filter(row=>(row.change??0)>0).length,declined:rows.filter(row=>(row.change??0)<0).length};}
export function rankGroups(rows:RankReportRow[],kind:"tags"|"pages"|"targets"){
 const groups=new Map<string,RankReportRow[]>();for(const row of rows){const keys=kind==="tags"?(row.tags.length?row.tags:["Untagged"]):kind==="pages"?[row.url??"No observed ranking URL"]:[`${row.locationCode} · ${row.languageCode} · ${row.device} · ${row.searchEngine}`];for(const key of new Set(keys))groups.set(key,[...(groups.get(key)??[]),row]);}return [...groups].map(([label,items])=>({label,...rankSummary(items)}));
}
export function rankCompetitors(rows:RankReportRow[],hosts:string[]=[]){
 const all=new Set([...hosts,...rows.flatMap(row=>row.competitors.map(item=>item.host))]);return [...all].map(host=>{const observations=rows.flatMap(row=>{const match=row.competitors.filter(item=>item.host===host).sort((a,b)=>a.position-b.position)[0];return match?[match]:[];});return {host,keywords:observations.length,top3:observations.filter(row=>row.position<=3).length,average:observations.length?Math.round(observations.reduce((sum,row)=>sum+row.position,0)/observations.length*10)/10:null};}).sort((a,b)=>b.keywords-a.keywords);
}
/** Host boundaries prevent example.com matching notexample.com or a URL path. */
export function belongsToHost(value:string,host:string){try{const actual=new URL(value.includes("://")?value:`https://${value}`).hostname.toLowerCase().replace(/^www\./,"");const wanted=host.toLowerCase().replace(/^www\./,"");return actual===wanted||actual.endsWith(`.${wanted}`);}catch{return false;}}
