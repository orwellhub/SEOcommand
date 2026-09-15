import {describe,it,expect} from "vitest";
import {DEFAULT_KEYWORD_QUERY,KeywordQuerySchema,providerKeywordQuery,keywordReportHref} from "./keyword-query";

describe("keyword query contract",()=>{
  it("filters questions, volume, intent and exclusions before pagination",()=>{
    const query={...DEFAULT_KEYWORD_QUERY,questions:true,minVolume:"10",intent:"commercial" as const,exclude:"bus times,car rental"};
    const task=providerKeywordQuery("bus rental",query);
    expect(task.filters).toEqual(expect.arrayContaining([["keyword","regex",expect.stringContaining("how")],["keyword_info.search_volume",">=",10],["search_intent_info.main_intent","=","commercial"],["keyword","not_regex","bus times|car rental"]]));
    expect(task.order_by).toEqual(["keyword_info.search_volume,desc","keyword,asc"]);
  });
  it("uses the provider array operator for SERP feature filters",()=>{expect(providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,serpFeature:"local_pack"}).filters).toEqual(["serp_info.serp_item_types","has","local_pack"]);});
  it("uses nested fields in related and domain reports",()=>{
    expect(providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,minCpc:"0",sort:"difficulty",direction:"asc"},true)).toEqual({filters:["keyword_data.keyword_info.cpc",">=",0],order_by:["keyword_data.keyword_properties.keyword_difficulty,asc","keyword_data.keyword,asc"]});
  });
  it("validates filter ranges and refuses silently truncated provider conditions",()=>{
    expect(KeywordQuerySchema.safeParse({...DEFAULT_KEYWORD_QUERY,minVolume:"20",maxVolume:"10"}).success).toBe(false);
    expect(KeywordQuerySchema.safeParse({...DEFAULT_KEYWORD_QUERY,minDifficulty:"101"}).success).toBe(false);
    expect(KeywordQuerySchema.safeParse({...DEFAULT_KEYWORD_QUERY,minCompetition:"1.2"}).success).toBe(false);
    expect(()=>providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,questions:true,include:"one,two,three,four,five,six,seven,eight"})).toThrow("eight conditions");
  });
  it("quotes literal group terms and distinguishes phrase from exact matching",()=>{
    expect(providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,match:"phrase"}).filters).toHaveLength(3);
    expect(providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,group:["c++"]}).filters).toEqual(["keyword","regex",expect.stringContaining("c\\\\+\\\\+")]);
    expect(providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,match:"exact"}).filters).toBeUndefined();
  });
  it("matches complete question strings without ambiguous backslash escapes",()=>{
    const wire=providerKeywordQuery("bus rental",{...DEFAULT_KEYWORD_QUERY,questions:true}).filters as string[];
    expect(wire[2]).not.toContain("\\");
    const expression=new RegExp(wire[2]!.replaceAll("[[:space:]]", "[ \t]"));
    expect(expression.test("how much is bus rental")).toBe(true);
    expect(expression.test("island bus rental")).toBe(false);
    expect(expression.test("bus rental cost?")).toBe(true);
  });
  it("keeps website, scan, project and market when opening the questions card",()=>{
    const href=keywordReportHref(new URLSearchParams({site:"globalbusrental",project:"p",scan:"saved",keywords:"stale",action:"track"}),"bus rental",2826,"United Kingdom","en",{...DEFAULT_KEYWORD_QUERY,questions:true});
    const parsed=new URL(href,"https://example.test");
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({site:"globalbusrental",project:"p",scan:"saved",q:"bus rental",location:"2826",language:"en",view:"discover"});
    expect(JSON.parse(parsed.searchParams.get("filters")!).questions).toBe(true);
    expect(parsed.searchParams.has("keywords")).toBe(false);
    expect(parsed.searchParams.has("action")).toBe(false);
  });
});
