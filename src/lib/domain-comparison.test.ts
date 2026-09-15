import {describe,expect,it} from "vitest";
import {domainKeywordMatrix,matchesGap,type ComparisonDomain,type GapKeyword} from "./domain-comparison";
const domain=(name:string,position:number|null):ComparisonDomain=>({id:name,sourceValue:name,locationCode:2826,languageCode:"en",locationLabel:"UK",capturedAt:"2026-09-15",summary:{},evidence:{keywords:position?[{keyword:"bus rental",position,volume:100,difficulty:20,intent:"commercial",url:`https://${name}`,traffic:null}]:[],pages:[],backlinks:{}}});
describe("domain comparison evidence",()=>{
 it("does not manufacture a missing ranking from an incomplete sample",()=>{const row=domainKeywordMatrix([domain("a.com",null),domain("b.com",3)])[0]!;expect(matchesGap(row,["a.com","b.com"],"missing")).toBe(false);expect(row.positions["a.com"]!.known).toBe(false);});
 it("uses explicit non-intersection evidence for missing and unique",()=>{const verified:GapKeyword={keyword:"bus rental",volume:100,difficulty:20,intent:null,positions:{"a.com":{known:true,position:null,url:null},"b.com":{known:true,position:3,url:"https://b.com"}}};const row=domainKeywordMatrix([domain("a.com",null),domain("b.com",3)],[verified])[0]!;expect(matchesGap(row,["a.com","b.com"],"missing")).toBe(true);expect(matchesGap(row,["b.com","a.com"],"unique")).toBe(true);});
 it("distinguishes weak from strong while preserving unknown competitors",()=>{const row=domainKeywordMatrix([domain("a.com",5),domain("b.com",3),domain("c.com",null)])[0]!;expect(matchesGap(row,["a.com","b.com","c.com"],"weak")).toBe(true);expect(matchesGap(row,["b.com","a.com","c.com"],"strong")).toBe(false);});
 it("rejects incompatible search databases",()=>{expect(()=>domainKeywordMatrix([domain("a.com",1),{...domain("b.com",2),languageCode:"ar"}])).toThrow(/same country/);});
});
