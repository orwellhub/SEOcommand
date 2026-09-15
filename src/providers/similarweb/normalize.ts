import type {TrafficInput,TrafficPage,TrafficCountry} from "@/lib/traffic-research";
type ObjectRow=Record<string,unknown>;
const object=(value:unknown):ObjectRow=>value&&typeof value==="object"&&!Array.isArray(value)?value as ObjectRow:{};
const array=(value:unknown):ObjectRow[]=>Array.isArray(value)?value.map(object):[];
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;
function verify(raw:unknown,input:TrafficInput){
 const body=object(raw),meta=object(body.meta),request=object(meta.request);
 if(meta.status!=="Success")throw new Error("The traffic provider did not return a successful result.");
 if(String(request.domain??"").replace(/^www\./,"")!==input.domain||String(request.country).toLowerCase().replace(/^ww$/,"world")!==input.country||String(request.start_date).slice(0,7)!==input.month||String(request.end_date).slice(0,7)!==input.month)throw new Error("Traffic response does not match the requested domain, month and country.");
 return body;
}
export function normalizeVisits(raw:unknown,input:TrafficInput){const rows=array(verify(raw,input).visits).filter(row=>String(row.date).slice(0,7)===input.month);if(rows.length!==1)throw new Error("Expected one monthly total-traffic result.");return number(rows[0].visits);}
/** Official desktop responses split Search into organic/paid; mobile gives each channel separately. */
export function normalizeChannels(raw:unknown,input:TrafficInput,device:"desktop"|"mobile"){
 const body=verify(raw,input),rows=array(object(body.visits)[input.domain]);if(!rows.length)throw new Error(`No ${device} channels were returned for this domain.`);
 const result:Record<string,number|null>={};
 const aliases:Record<string,string>={"E-Mail":"Mail","Email":"Mail","Referral":"Referrals","Organic Search":"Organic Search","Paid Search":"Paid Search","Direct":"Direct","Social":"Social","Referrals":"Referrals","Mail":"Mail","Display Ads":"Display Ads"};
 for(const row of rows){const points=array(row.visits).filter(point=>String(point.date).slice(0,7)===input.month);if(points.length!==1)continue;const point=points[0];
  if(device==="desktop"&&row.source_type==="Search"){result["Organic Search"]=number(point.organic);result["Paid Search"]=number(point.paid);continue;}
  const channel=aliases[String(row.source_type)];if(!channel)continue;
  const organic=number(point.organic),paid=number(point.paid);
  result[channel]=device==="mobile"?number(point.visits):organic!=null&&paid!=null?organic+paid:null;
 }
 return result;
}
const percent=(value:unknown)=>typeof value==="number"&&value>=0&&value<=1?value*100:null;
export function normalizePopularPages(raw:unknown,input:TrafficInput):TrafficPage[]{
 const body=verify(raw,input);if(!Array.isArray(body.data))throw new Error("Popular Pages returned no recognised page dataset.");
 return array(body.data).flatMap(row=>{
  if(typeof row.page!=="string")return [];
  try{const url=new URL(row.page.includes("://")?row.page:`https://${row.page}`),host=url.hostname.replace(/^www\./,"");
   if(!["http:","https:"].includes(url.protocol)||url.username||url.password||!(host===input.domain||host.endsWith(`.${input.domain}`)))return [];
   return [{url:url.toString(),share:percent(row.share),change:typeof row.change==="number"&&Number.isFinite(row.change)?row.change:null}];
  }catch{return [];}
 });
}
export function normalizeGeography(raw:unknown,input:TrafficInput):TrafficCountry[]{
 const body=verify(raw,{...input,country:"world"});if(!Array.isArray(body.records))throw new Error("Geography returned no recognised country dataset.");
 return array(body.records).filter(row=>typeof row.country==="number").map(row=>({code:row.country as number,name:typeof row.country_name==="string"?row.country_name:String(row.country),visits:number(row.visits),share:percent(row.share),pagesPerVisit:number(row.pages_per_visit),duration:number(row.average_time),bounceRate:percent(row.bounce_rate),rank:number(row.rank)}));
}
