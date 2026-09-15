export type AdvertisingKind = "keywords" | "competitors" | "pages";
export type AdvertisingRow = {label:string;url:string|null;position:number|null;volume:number|null;cpc:number|null;traffic:number|null;keywords:number|null;common:number|null;title:string|null;description:string|null};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
const text=(value:unknown)=>typeof value==="string"&&value.trim()?value.trim():null;
const url=(value:unknown)=>{try{const candidate=new URL(String(value));return ['http:','https:'].includes(candidate.protocol)&&!candidate.username&&!candidate.password?candidate.href:null;}catch{return null;}};
export function normalizeAdvertising(result:Record<string,unknown>[],kind:AdvertisingKind):AdvertisingRow[]{
 const rows=result.flatMap(row=>Array.isArray(row.items)?row.items:[]).map(object);
 return rows.flatMap((row):AdvertisingRow[]=>{
  const blank={url:null,position:null,volume:null,cpc:null,traffic:null,keywords:null,common:null,title:null,description:null};
  if(kind==="keywords"){const data=object(row.keyword_data),info=object(data.keyword_info),serp=object(object(row.ranked_serp_element).serp_item);if(serp.type!=="paid")return [];const label=text(data.keyword);return label?[{...blank,label,url:url(serp.url),position:number(serp.rank_group),volume:number(info.search_volume),cpc:number(info.cpc),traffic:number(serp.etv),title:text(serp.title),description:text(serp.description)}]:[];}
  const paid=object(object(kind==="competitors"?row.full_domain_metrics:row.metrics).paid),label=text(kind==="competitors"?row.domain:row.page_address??row.url);return label?[{...blank,label,url:kind==="pages"?url(label):null,traffic:number(paid.etv),keywords:number(paid.count),common:kind==="competitors"?number(row.intersections):null}]:[];
 });
}
