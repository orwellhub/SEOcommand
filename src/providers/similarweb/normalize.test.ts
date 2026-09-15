import {describe,it,expect} from "vitest";
import {normalizeChannels,normalizeVisits,normalizePopularPages,normalizeGeography} from "./normalize";
import {combineTrafficChannels,trafficDetailPlan} from "@/lib/traffic-research";
const input={domain:"example.com",month:"2026-08",country:"world"};
const meta={status:"Success",request:{domain:input.domain,country:input.country,start_date:"2026-08-01",end_date:"2026-08-31"}};
describe("traffic provider evidence",()=>{
 it("checks domain, country and month before accepting values",()=>{expect(normalizeVisits({meta,visits:[{date:"2026-08-01",visits:123}]},input)).toBe(123);expect(()=>normalizeVisits({meta,visits:[]},{...input,country:"us"})).toThrow("does not match");});
 it("separates paid search from organic and requires both devices for totals",()=>{const desktop=normalizeChannels({meta,visits:{"example.com":[{source_type:"Search",visits:[{date:"2026-08-01",organic:100,paid:10}]},{source_type:"Direct",visits:[{date:"2026-08-01",organic:30,paid:0}]}]}},input,"desktop");const mobile=normalizeChannels({meta,visits:{"example.com":[{source_type:"Organic Search",visits:[{date:"2026-08-01",visits:200}]}]}},input,"mobile");const report=combineTrafficChannels(input,500,desktop,mobile,"2026-09-15");expect(report.channels[0].visits).toBe(300);expect(report.channels[1].visits).toBeNull();expect(report.channels[2].desktop).toBe(30);expect(report.channels[2].visits).toBeNull();});
 it("never converts missing numbers into zero",()=>{expect(normalizeVisits({meta,visits:[{date:"2026-08-01",visits:null}]},input)).toBeNull();});
});
it("normalises premium page shares without inventing page visits or scaling percentage-point change",()=>{
 const rows=normalizePopularPages({meta:{...meta,request:{...meta.request,country:"ww"}},data:[{page:"example.com/guide",share:.24,change:1.5},{page:"unrelated.com",share:.2},{page:"example.com/unknown",share:null}]},input);
 expect(rows).toEqual([{url:"https://example.com/guide",share:24,change:1.5},{url:"https://example.com/unknown",share:null,change:null}]);
 expect(trafficDetailPlan(input,"pages").credits).toBe(30);expect(trafficDetailPlan(input,"pages").requests[0].url).toContain("limit=10");
});
it("keeps geography as worldwide all-device evidence and preserves missing metrics",()=>{
 const rows=normalizeGeography({meta,records:[{country:840,country_name:"United States",share:.6,visits:500,bounce_rate:.42,average_time:80}]},input);
 expect(rows[0]).toMatchObject({name:"United States",share:60,bounceRate:42,visits:500,pagesPerVisit:null});
 expect(()=>normalizeGeography({meta:{...meta,request:{...meta.request,domain:"other.com"}},records:[]},input)).toThrow("does not match");
 expect(trafficDetailPlan(input,"countries").credits).toBe(70);
});
