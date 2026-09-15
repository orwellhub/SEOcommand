export type BacklinkDecision={sourceUrl:string;targetUrl:string;scope:"url"|"domain";decision:"audit"|"whitelist"|"remove"|"disavow";note:string;updatedAt?:string};
export function disavowText(rows:BacklinkDecision[]){
 const lines=new Set<string>(),notes=new Set<string>();
 for(const row of rows.filter(row=>row.decision==="disavow")){
  try{const url=new URL(row.sourceUrl);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)continue;url.hash="";
   if(decisionFor(row.sourceUrl,row.targetUrl,rows)?.decision!=="disavow")continue;
   if(row.scope==="domain"&&rows.some(other=>other.scope==="url"&&other.decision!=="disavow"&&(other.updatedAt??"")>(row.updatedAt??"")&&new URL(other.sourceUrl).hostname===url.hostname)){notes.add(`# Omitted domain:${url.hostname}: a newer URL review conflicts with this domain-wide decision.`);continue;}
   if(row.scope==="url"&&rows.some(other=>other.scope==="url"&&other.decision!=="disavow"&&(other.updatedAt??"")>(row.updatedAt??"")&&other.sourceUrl.split("#")[0]===row.sourceUrl.split("#")[0])){notes.add(`# Omitted ${url.toString()}: a newer review of this source URL conflicts with disavowal.`);continue;}
   lines.add(row.scope==="domain"?`domain:${url.hostname.toLowerCase()}`:url.toString());
  }catch{/* Invalid destinations cannot enter an exported file. */}
 }
 return ["# SEO Command: reviewed disavow candidates",...notes,...lines].join("\n")+"\n";
}
export function decisionFor(sourceUrl:string,targetUrl:string,rows:BacklinkDecision[]){const host=(value:string)=>{try{return new URL(value).hostname;}catch{return null;}};return rows.filter(row=>row.scope==="domain"?host(row.sourceUrl)!==null&&host(row.sourceUrl)===host(sourceUrl):row.sourceUrl===sourceUrl&&row.targetUrl===targetUrl).sort((a,b)=>(b.updatedAt??"").localeCompare(a.updatedAt??""))[0];}
