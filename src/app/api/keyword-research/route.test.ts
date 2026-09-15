import {beforeEach,it,expect,vi} from "vitest";
import {NextRequest} from "next/server";
import {DEFAULT_KEYWORD_QUERY} from "@/lib/keyword-query";
import {unmeasuredKeyword} from "@/lib/keyword-lists";
const provider=vi.hoisted(()=>({research:vi.fn(),metrics:vi.fn(),global:vi.fn(),allowed:true}));
vi.mock("@/providers/dataforseo",()=>({dataForSeoConfigured:()=>true,researchKeywords:provider.research,keywordMetrics:provider.metrics,keywordGlobalVolume:provider.global}));
vi.mock("@/platform/access",()=>({canAccessSite:async()=>provider.allowed,hasPermission:async()=>provider.allowed}));
import {GET,POST} from "./route";
beforeEach(()=>{vi.stubEnv("QA_SYNTHETIC","false");provider.allowed=true;provider.research.mockReset();provider.metrics.mockReset();provider.global.mockReset();});
function get(params:Record<string,string>={}){return new NextRequest(`https://example.test/api/keyword-research?${new URLSearchParams({seed:"bus rental",site:"globalbusrental",location:"2826",language:"en",...params})}`);}
function post(body:object){return new NextRequest("https://example.test/api/keyword-research",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"metrics",site:"globalbusrental",location:2826,language:"en",keywords:["bus rental"],...body})});}
it("retains completed overview sections when related collection fails",async()=>{
 provider.research.mockImplementation(async opts=>{if(opts.sourceType==="related")throw new Error("Budget limit");opts.onPagination?.({nextOffset:1,total:opts.sourceType==="questions"?23:987,hasMore:true,sourceType:opts.sourceType});opts.onPrimary?.({...unmeasuredKeyword("bus rental"),volume:480});return [unmeasuredKeyword(opts.sourceType==="questions"?"how much is bus rental":"mini bus rental")];});
 const response=await GET(get({report:"overview"})),body=await response.json();expect(response.status).toBe(200);expect(body.result.report.variations.total).toBe(987);expect(body.result.report.questions.total).toBe(23);expect(body.result.rows).toHaveLength(1);expect(body.warnings[0]).toContain("Budget limit");expect(body.result.report.related).toBeUndefined();
});
it("rejects unsupported filters before any paid collection",async()=>{const response=await GET(get({filters:JSON.stringify({...DEFAULT_KEYWORD_QUERY,include:"1,2,3,4,5,6,7,8,9"})}));expect(response.status).toBe(400);expect(provider.research).not.toHaveBeenCalled();});
it("retains zero metrics and missing keywords in bulk analysis",async()=>{provider.metrics.mockResolvedValue([{...unmeasuredKeyword("bus rental"),volume:0,difficulty:0}]);const body=await(await POST(post({keywords:["bus rental","missing keyword"]}))).json();expect(body.rows).toEqual([expect.objectContaining({keyword:"bus rental",volume:0,difficulty:0}),expect.objectContaining({keyword:"missing keyword",volume:null})]);});
it("rejects oversized batches and inaccessible website requests before charging",async()=>{expect((await POST(post({keywords:Array.from({length:701},(_,i)=>`bus ${i}`)}))).status).toBe(400);provider.allowed=false;expect((await GET(get())).status).toBe(403);expect((await POST(post({action:"global"}))).status).toBe(403);expect(provider.research).not.toHaveBeenCalled();expect(provider.metrics).not.toHaveBeenCalled();expect(provider.global).not.toHaveBeenCalled();});
it("keeps the query and cursor in continuation requests",async()=>{provider.research.mockImplementation(async opts=>{opts.onPagination({nextOffset:200,total:987,hasMore:true,sourceType:"seed"});return [];});await GET(get({offset:"100",cursor:"opaque",filters:JSON.stringify({...DEFAULT_KEYWORD_QUERY,questions:true,sort:"difficulty"})}));expect(provider.research).toHaveBeenCalledWith(expect.objectContaining({offset:100,offsetToken:"opaque",query:expect.objectContaining({questions:true,sort:"difficulty"})}));});

it("rejects cities and invalid countries before a paid request",async()=>{expect((await GET(get({location:"1006886"}))).status).toBe(400);expect((await GET(get({location:"invalid"}))).status).toBe(400);expect(provider.research).not.toHaveBeenCalled();});
