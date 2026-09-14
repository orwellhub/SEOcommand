import { z } from "zod";
const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const trafficInputSchema=z.object({domain:z.string().trim().toLowerCase().transform(v=>v.replace(/^www\./," ").trim()).pipe(z.string().regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)),month,country:z.string().regex(/^(world|[a-z]{2})$/).default("world")});
export type TrafficInput=z.infer<typeof trafficInputSchema>;
export const TRAFFIC_CHANNELS=["Organic Search","Paid Search","Direct","Social","Referrals","Mail","Display Ads"] as const;
export type TrafficEvidence={input:TrafficInput;collectedAt:string;provider:"similarweb";visits:number|null;channels:{name:string;desktop:number|null;mobile:number|null;visits:number|null;share:number|null}[];notes:string[]};
/** A request plan is safe to inspect: no network calls and no credentials. */
export function trafficRequestPlan(input:TrafficInput){
 const domain=encodeURIComponent(input.domain),query=new URLSearchParams({start_date:input.month,end_date:input.month,country:input.country,granularity:"monthly",format:"json",main_domain_only:"false"});
 return {input,credits:15,requests:[
 {id:"visits",credits:1,url:`https://api.similarweb.com/v1/website/${domain}/total-traffic-and-engagement/visits?${query}`},
 {id:"desktop",credits:7,url:`https://api.similarweb.com/v1/website/${domain}/traffic-sources/overview-share?${query}`},
 {id:"mobile",credits:7,url:`https://api.similarweb.com/v5/website/${domain}/mobile-traffic-sources/mobile-overview-share?${query}`},
 ],notes:["One domain, one calendar month, one country or worldwide. Desktop and mobile channel visits are collected separately.","Estimated 15 data credits, or three request hits on a hit-based contract. Confirm your subscription's charging model and entitlements before activation.","Unique visitors, engagement, country tables and top-page traffic require additional provider entitlements and a separate quote."]};
}
/** Never treat partial device coverage as total traffic, or turn missing data into zero. */
export function combineTrafficChannels(input:TrafficInput,visits:number|null,desktop:Record<string,number|null>,mobile:Record<string,number|null>,collectedAt:string):TrafficEvidence {
 const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
 return {input,provider:"similarweb",collectedAt,visits:valid(visits)?visits:null,channels:TRAFFIC_CHANNELS.map(name=>{const d=desktop[name],m=mobile[name],total=valid(d)&&valid(m)?d+m:null;return {name,desktop:valid(d)?d:null,mobile:valid(m)?m:null,visits:total,share:total!=null&&valid(visits)&&visits>0&&total<=visits?total/visits*100:null};}),notes:["Provider estimates, not first-party analytics. Total channel visits require both device datasets for the same month and market."]};
}
