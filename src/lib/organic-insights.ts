import type {Ga4LandingPage,GscRow} from "./types";
export type OrganicLanding={url:string;path:string;search:GscRow|null;analytics:Ga4LandingPage|null};
export function landingKey(value:string,host:string):string|null{try{if(value==="(not set)")return null;const url=new URL(value,`https://${host}`);if(url.hostname.replace(/^www\./,"")!==host.replace(/^www\./,""))return null;return url.pathname+url.search;}catch{return null;}}
export function joinOrganicLandingPages(search:GscRow[],analytics:Ga4LandingPage[],host:string):OrganicLanding[]{
 const rows=new Map<string,OrganicLanding>();
 for(const page of search){const key=landingKey(page.key,host);if(key==null)continue;const existing=rows.get(key);if(existing?.search){const impressions=existing.search.impressions+page.impressions,clicks=existing.search.clicks+page.clicks;existing.search={...existing.search,clicks,impressions,ctr:impressions?clicks/impressions*100:0,position:impressions?(existing.search.position*existing.search.impressions+page.position*page.impressions)/impressions:0};}else rows.set(key,{url:page.key,path:key,search:page,analytics:null});}
 for(const page of analytics){const key=landingKey(page.landingPage,host);if(key==null)continue;const existing=rows.get(key)??{url:`https://${host}${key}`,path:key,search:null,analytics:null};existing.analytics=page;rows.set(key,existing);}
 return [...rows.values()].sort((a,b)=>(b.analytics?.sessions??-1)-(a.analytics?.sessions??-1));
}
