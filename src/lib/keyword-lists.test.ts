import { describe, expect, it } from "vitest";
import { mergeKeywordLists, unmeasuredKeyword } from "./keyword-lists";
const list=(date:string,volume:number|null)=>({seed:"bus",locationCode:2826,languageCode:"en",locationLabel:"United Kingdom",fetchedAt:date,rows:[{...unmeasuredKeyword("Bus Rental"),volume}]});
describe("keyword list preservation",()=>{
 it("deduplicates case variations using the latest saved evidence without changing originals",()=>{const old=list("2026-09-01T00:00:00Z",100),recent=list("2026-09-10T00:00:00Z",200);recent.rows[0]!.keyword="bus rental";const merged=mergeKeywordLists([recent,old],"Merged list");expect(merged.rows).toHaveLength(1);expect(merged.rows[0]).toMatchObject({keyword:"bus rental",volume:200,collectedAt:recent.fetchedAt});expect(old.rows[0]?.volume).toBe(100);expect(merged.pagination).toBeUndefined();expect(merged.query).toBeUndefined();expect(merged.report).toBeUndefined();expect(merged.rows[0]?.updatedAt).toBeUndefined();});
 it("refuses to blend markets or languages",()=>{expect(()=>mergeKeywordLists([list("a",1),{...list("b",2),locationCode:2840}],"x")).toThrow("same country");expect(()=>mergeKeywordLists([list("a",1),{...list("b",2),languageCode:"ar"}],"x")).toThrow("same country");});
 it("keeps uncollected keyword metrics unknown",()=>{expect(unmeasuredKeyword("bus")).toMatchObject({volume:null,difficulty:null,cpc:null,monthlySearches:[]});});
});
