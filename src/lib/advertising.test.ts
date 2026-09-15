import {describe,it,expect} from "vitest";
import {normalizeAdvertising} from "./advertising";
import {normalizeKeywordIdeas} from "@/providers/dataforseo/normalizers";
describe("indexed advertising and keyword dates",()=>{
 it("keeps only paid ad observations and preserves unknown metrics",()=>{
  const result=normalizeAdvertising([{items:[{keyword_data:{keyword:"bus rental",keyword_info:{search_volume:100,cpc:0}},ranked_serp_element:{serp_item:{type:"paid",rank_group:2,rank_absolute:7,title:"Hire a bus",description:"Book today",url:"https://example.com/"}}},{keyword_data:{keyword:"organic result"},ranked_serp_element:{serp_item:{type:"organic"}}}]}],"keywords");
  expect(result).toHaveLength(1);expect(result[0]).toMatchObject({label:"bus rental",position:2,volume:100,cpc:0,traffic:null,title:"Hire a bus"});
 });
 it("reads paid metrics for competitors and rejects unsafe landing links",()=>{
  expect(normalizeAdvertising([{items:[{domain:"example.com",intersections:3,full_domain_metrics:{organic:{etv:999},paid:{etv:20,count:7}}}]}],"competitors")[0]).toMatchObject({traffic:20,keywords:7,common:3});
  expect(normalizeAdvertising([{items:[{page_address:"javascript:alert(1)",metrics:{paid:{count:2}}}]}],"pages")[0].url).toBeNull();
 });
 it("sorts provider monthly records chronologically and excludes invalid months",()=>{
  const rows=normalizeKeywordIdeas([{items:[{keyword:"bus",keyword_info:{monthly_searches:[{year:2026,month:8,search_volume:10},{year:2025,month:12,search_volume:0},{year:2026,month:99,search_volume:10}]}}]}]);
  expect(rows[0].monthlySearches.map(row=>`${row.year}-${row.month}`)).toEqual(["2025-12","2026-8"]);expect(rows[0].trend).toEqual([0,10]);
 });
});
