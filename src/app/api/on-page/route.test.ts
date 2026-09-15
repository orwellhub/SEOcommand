import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandRecord } from "@/lib/command-model";
import { benchmarkHtml } from "@/lib/content-analysis";
const state=vi.hoisted(()=>({allowed:true,rows:[] as CommandRecord[],failCompletion:false,post:vi.fn(),read:vi.fn()}));
vi.mock("@/platform/access",()=>({canAccessSite:async()=>state.allowed,hasPermission:async()=>state.allowed}));
vi.mock("@/platform/site-store",()=>({getManagedSite:async()=>({host:"example.com"})}));
vi.mock("@/sync/bundle",()=>({buildDomainBundle:async()=>({datasets:{}})}));
vi.mock("@/providers/dataforseo",()=>({getDataForSeoClient:()=>({post:state.post})}));
vi.mock("@/platform/page-benchmark",()=>({readPageBenchmark:state.read}));
vi.mock("@/platform/workspace-store",()=>({
 workspaceRecords:async()=>state.rows,
 saveWorkspace:async(site:string,kind:string,key:string,payload:Record<string,unknown>,status:string)=>{
  if(status==="completed"&&state.failCompletion){state.failCompletion=false;throw new Error("Interrupted save");}
  const prior=state.rows.find(row=>row.recordKey===key),date=new Date(Math.max(Date.now(),Date.parse(prior?.updatedAt??"2020-01-01")+1)).toISOString();
  const row:CommandRecord={id:prior?.id??crypto.randomUUID(),siteSlug:site,kind:`workspace_${kind}`,recordKey:key,payload,status,createdAt:prior?.createdAt??date,updatedAt:date,nextRunAt:null};
  state.rows=[row,...state.rows.filter(item=>item.recordKey!==key)];return row;
 },
 updateWorkspace:async(current:CommandRecord,payload:Record<string,unknown>)=>{const saved={...current,payload,updatedAt:new Date(Date.parse(current.updatedAt)+1).toISOString()};state.rows=[saved];return saved;}
}));
import { POST, PATCH } from "./route";
import { POST as verify } from "./verify/route";
const input={site:"test",keyword:"bus rental",url:"https://example.com/",locationCode:2840,languageCode:"en"};
const request=(body:unknown)=>new Request("http://localhost/api/on-page",{method:"POST",body:JSON.stringify(body)});
describe("on-page saved evidence and verification",()=>{
 beforeEach(()=>{vi.stubEnv("QA_SYNTHETIC","false");state.allowed=true;state.rows=[];state.failCompletion=false;state.post.mockReset().mockResolvedValue({costUsd:.003,result:[{items:[{type:"organic",url:"https://competitor.com/",title:"Bus rental",rank_group:1}]}]});state.read.mockReset().mockImplementation(async(url:string)=>benchmarkHtml("<html><title>Coach hire</title><body><p>Book a coach.</p></body></html>",url));});
 it("resumes saved paid search results after a later failure without another provider charge",async()=>{
  state.failCompletion=true;
  const failed=await POST(request(input));expect(failed.status).toBe(502);
  const id=(await failed.json()).id;expect(state.rows[0].payload.costUsd).toBe(.003);expect(state.rows[0].payload.serp).toHaveLength(1);
  const resumed=await POST(request({...input,resumeId:id}));expect(resumed.status).toBe(200);expect(state.post).toHaveBeenCalledTimes(1);
  expect((await resumed.json()).record.payload.report.costUsd).toBe(.003);
  expect((await POST(request({...input,resumeId:id}))).status).toBe(409);
 });
 it("blocks changed targets and unauthorized users before any paid work",async()=>{
  expect((await POST(request({...input,url:"https://unrelated.com/"}))).status).toBe(400);
  state.allowed=false;expect((await POST(request(input))).status).toBe(403);expect(state.post).not.toHaveBeenCalled();
 });
 it("rejects stale decisions and verifies HTML without overwriting the original benchmark",async()=>{
  const response=await POST(request(input)),{record}=await response.json(),report=record.payload.report;
  expect((await PATCH(request({site:"test",id:report.id,idea:"title-keyword",decision:"done",updatedAt:"2020-01-01T00:00:00.000Z"}))).status).toBe(409);
  state.read.mockResolvedValue(benchmarkHtml('<html><title>Bus rental</title><head><link rel="canonical" href="https://example.com/"><meta name="description" content="Bus rental planning"></head><body><h1>Bus rental</h1><p>Book a coach.</p></body></html>',input.url));
  const checked=await verify(request({site:"test",id:report.id,updatedAt:record.updatedAt}));expect(checked.status).toBe(200);
  const saved=(await checked.json()).record.payload;
  expect(saved.report.verification.resolved).toContain("title-keyword");expect(saved.report.decisions["title-keyword"]).toBe("done");
  expect(saved.report.own.title).toBe("Coach hire");expect(saved.verificationPage.title).toBe("Bus rental");expect(state.post).toHaveBeenCalledTimes(1);
 });
 it("preserves the prior evidence when the recheck cannot read a page",async()=>{
  const {record}=await(await POST(request(input))).json();state.read.mockRejectedValue(new Error("Page returned HTTP 503."));
  expect((await verify(request({site:"test",id:record.recordKey,updatedAt:record.updatedAt}))).status).toBe(502);
  expect(state.rows[0].payload.report).toEqual(record.payload.report);
 });
});
