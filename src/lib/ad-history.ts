import type {AdvertisingRow,AdvertisingKind} from "./advertising";
import {normalizeSerpItems,type SerpItem} from "./serp-evidence";
import {belongsToHost} from "./rank-reports";
export type AdvertisingSnapshot={input:{domain:string;locationCode:number;languageCode:string;kind:AdvertisingKind};rows:AdvertisingRow[];total:number|null;collectedAt:string};
export type AdvertisingChange={keyword:string;status:"New in index"|"No longer in index"|"Newly observed"|"Not observed"|"Changed"|"Unchanged";changes:string[];before:AdvertisingRow|null;after:AdvertisingRow|null};
export function compareAdvertising(before:AdvertisingSnapshot,after:AdvertisingSnapshot):AdvertisingChange[]{
 if(before.input.domain!==after.input.domain||before.input.locationCode!==after.input.locationCode||before.input.languageCode!==after.input.languageCode||before.input.kind!==after.input.kind)throw new Error("Compare the same domain, database, language and report type.");
 if(Date.parse(before.collectedAt)>=Date.parse(after.collectedAt))throw new Error("Choose an earlier baseline and a later comparison date.");
 const a=new Map(before.rows.map(row=>[row.label.toLowerCase(),row])),b=new Map(after.rows.map(row=>[row.label.toLowerCase(),row]));
 return [...new Set([...a.keys(),...b.keys()])].map(key=>{const old=a.get(key)??null,next=b.get(key)??null,changes:string[]=[];if(old&&next){if(old.url!==next.url)changes.push("Landing page");if(old.title!==next.title||old.description!==next.description)changes.push("Ad copy");if(old.position!==next.position)changes.push("Position");if(old.keywords!==next.keywords)changes.push("Keyword coverage");}
 const status:AdvertisingChange["status"]=!old?before.total!=null&&before.rows.length>=before.total?"New in index":"Newly observed":!next?after.total!=null&&after.rows.length>=after.total?"No longer in index":"Not observed":changes.length?"Changed":"Unchanged";
 return {keyword:next?.label??old!.label,status,changes,before:old,after:next};});
}
export type HistoricalAdSnapshot={observedAt:string;checkUrl:string|null;ads:SerpItem[]};
export function normalizeHistoricalAds(results:Record<string,unknown>[],domain:string):HistoricalAdSnapshot[]{
 return results.flatMap(root=>Array.isArray(root.items)?root.items:[]).flatMap((raw:Record<string,unknown>)=>{if(typeof raw.datetime!=="string"||!Number.isFinite(Date.parse(raw.datetime))||!Array.isArray(raw.items))return [];return [{observedAt:new Date(raw.datetime).toISOString(),checkUrl:typeof raw.check_url==="string"?raw.check_url:null,ads:normalizeSerpItems(raw.items).filter(item=>item.type==="paid"&&item.url&&belongsToHost(item.url,domain))}];}).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
}
