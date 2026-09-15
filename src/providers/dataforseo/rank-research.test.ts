import {beforeEach,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({post:vi.fn(),tracked:[{id:"first",keyword:"bus rental",device:"desktop",locationCode:2840,languageCode:"en"}]}));
vi.mock("./client",()=>({DataForSeoClient:class {post=state.post;}}));
vi.mock("@/platform/site-store",()=>({getManagedSite:async()=>({host:"example.com"}),listRankTrackingKeywords:async()=>state.tracked}));
import {fetchDailyTrackedRankings,researchKeywords,keywordGlobalVolume} from "./index";
beforeEach(()=>{vi.stubEnv("DATAFORSEO_LOGIN","test@example.test");vi.stubEnv("DATAFORSEO_PASSWORD","test-only");vi.stubEnv("DATABASE_URL","");state.post.mockReset();state.tracked=[{id:"first",keyword:"bus rental",device:"desktop",locationCode:2840,languageCode:"en"}];});
it("keeps a sponsored result and similar host out of the organic position",async()=>{state.post.mockResolvedValue({result:[{items:[{type:"paid",domain:"example.com",url:"https://example.com/ad",rank_absolute:1},{type:"organic",domain:"notexample.com",url:"https://notexample.com",rank_absolute:2},{type:"featured_snippet",domain:"example.com",url:"https://example.com/snippet",rank_absolute:3},{type:"organic",domain:"example.com",url:"https://example.com/organic",rank_absolute:4},{type:"organic",domain:"rival.com",url:"https://rival.com",rank_absolute:42}]}],costUsd:.03});const [row]=await fetchDailyTrackedRankings("test");expect(row).toMatchObject({position:4,url:"https://example.com/organic",ownedFeatures:["paid","featured_snippet"]});expect(row?.competitors).toEqual(expect.arrayContaining([expect.objectContaining({host:"rival.com",position:42})]));});
it("persists completed ranking targets before surfacing a partial batch failure",async()=>{state.tracked.push({...state.tracked[0]!,id:"second",keyword:"coach hire"});state.post.mockResolvedValueOnce({result:[{items:[]}],costUsd:.03}).mockRejectedValueOnce(new Error("Budget reached"));const checkpoint=vi.fn().mockResolvedValue(undefined);await expect(fetchDailyTrackedRankings("test",checkpoint)).rejects.toThrow("Budget reached");expect(checkpoint).toHaveBeenCalledWith([expect.objectContaining({trackedKeywordId:"first",position:null})]);});
it("does not record a missing response as a ranking loss",async()=>{state.post.mockResolvedValue({result:[],costUsd:0});const checkpoint=vi.fn();await expect(fetchDailyTrackedRankings("test",checkpoint)).rejects.toThrow("valid SERP");expect(checkpoint).not.toHaveBeenCalled();});
it("continues keyword collection at the provider offset without collecting seed metrics again",async()=>{state.post.mockResolvedValue({result:[{total_count:1200,items:[{keyword:"more keywords",keyword_info:{search_volume:120}}]}],costUsd:.012});const onPagination=vi.fn();const rows=await researchKeywords({seed:"keywords",sourceType:"seed",locationCode:2840,languageCode:"en",limit:500,offset:1000,onPagination,siteSlug:"test"});expect(rows[0]?.keyword).toBe("more keywords");expect(state.post).toHaveBeenCalledTimes(1);expect(state.post).toHaveBeenCalledWith("labsKeywordSuggestions",expect.any(String),[expect.objectContaining({offset:1000,limit:500})],{domainSlug:"test"});expect(onPagination).toHaveBeenCalledWith({nextOffset:1001,total:1200,hasMore:true,sourceType:"seed"});});

it("keeps seed metadata outside a filtered page and passes filters before the provider limit",async()=>{
 state.post.mockResolvedValue({result:[{total_count:23,offset_token:"next-page",seed_keyword_data:{keyword:"bus rental",keyword_info:{search_volume:480}},items:[{keyword:"how much is bus rental",keyword_info:{search_volume:20},keyword_properties:{keyword_difficulty:0}}]}]});
 const onPrimary=vi.fn(),onPagination=vi.fn();
 const rows=await researchKeywords({seed:"bus rental",sourceType:"questions",locationCode:2826,languageCode:"en",limit:5,onPrimary,onPagination});
 expect(rows.map(row=>row.keyword)).toEqual(["how much is bus rental"]);expect(rows[0]?.difficulty).toBe(0);
 expect(onPrimary).toHaveBeenCalledWith(expect.objectContaining({keyword:"bus rental",volume:480}));
 expect(state.post.mock.calls[0]?.[2][0]).toMatchObject({keyword:"bus rental",limit:5,filters:["keyword","regex",expect.stringContaining("how")]});
 expect(onPagination).toHaveBeenCalledWith({nextOffset:1,total:23,hasMore:true,sourceType:"questions",nextToken:"next-page"});
});
it("does not treat a malformed provider response as a zero-result search",async()=>{state.post.mockResolvedValue({result:[]});await expect(researchKeywords({seed:"bus rental",locationCode:2826,languageCode:"en"})).rejects.toThrow("valid keyword report");});
it("accepts a real zero-match response without inventing an exact-seed result",async()=>{state.post.mockResolvedValue({result:[{total_count:0,items:null}]});const page=vi.fn();expect(await researchKeywords({seed:"bus rental",sourceType:"questions",locationCode:2826,languageCode:"en",onPagination:page})).toEqual([]);expect(state.post).toHaveBeenCalledTimes(1);expect(page).toHaveBeenCalledWith(expect.objectContaining({total:0,hasMore:false}));});
it("reads split seed metadata without losing the filtered report",async()=>{
 state.post.mockResolvedValue({result:[{seed_keyword_data:{keyword:"bus rental",keyword_info:{search_volume:480}}},{total_count:1,items:[{keyword:"how much is bus rental",keyword_info:{search_volume:10}}]}]});
 const primary=vi.fn();const rows=await researchKeywords({seed:"bus rental",sourceType:"questions",locationCode:2826,languageCode:"en",onPrimary:primary});
 expect(rows.map(row=>row.keyword)).toEqual(["how much is bus rental"]);
 expect(primary).toHaveBeenCalledWith(expect.objectContaining({keyword:"bus rental",volume:480}));
});

it("retains an unassigned clickstream country without making reports unsaveable",async()=>{
 state.post.mockResolvedValue({result:[{items:[{keyword:"bus rental",search_volume:3679,country_distribution:[{country_iso_code:"US",search_volume:1049,percentage:28.5},{country_iso_code:null,search_volume:3,percentage:0.08}]}]}]});
 const result=await keywordGlobalVolume("bus rental","test");
 expect(result.volume).toBe(3679);expect(result.countries).toEqual([{code:"US",volume:1049,percentage:28.5},{code:"ZZ",volume:3,percentage:0.08}]);
});
