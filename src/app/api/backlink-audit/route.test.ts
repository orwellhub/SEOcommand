import { beforeEach,describe,expect,it,vi } from "vitest";
const permission=vi.hoisted(()=>({allowed:true}));
vi.mock("@/platform/access",()=>({canAccessSite:async()=>true,hasPermission:async()=>permission.allowed}));
vi.mock("@/platform/site-store",()=>({getManagedSite:async()=>({host:"example.com"})}));
import { POST,GET } from "./route";
const req=(body:unknown)=>new Request("http://localhost/api/backlink-audit",{method:"POST",body:JSON.stringify(body)});
describe("backlink review persistence",()=>{
 beforeEach(()=>{vi.stubEnv("QA_SYNTHETIC","true");permission.allowed=true;});
 it("retains notes when changing bulk status, and collapses repeated domain reviews",async()=>{
  const site=`links-${crypto.randomUUID()}`,row={sourceUrl:"https://source.com/a",targetUrl:"https://example.com/"};
  expect((await POST(req({site,rows:[row],scope:"domain",decision:"remove",note:"Contact is already logged"}))).status).toBe(200);
  expect((await POST(req({site,rows:[row,{...row,sourceUrl:"https://source.com/b"}],scope:"domain",decision:"whitelist"}))).status).toBe(200);
  const {decisions}=await(await GET(new Request(`http://localhost/api/backlink-audit?site=${site}`))).json();
  expect(decisions).toHaveLength(1);expect(decisions[0]).toMatchObject({decision:"whitelist",note:"Contact is already logged"});
 });
 it("blocks unapproved edits and credential-bearing URLs",async()=>{
  permission.allowed=false;expect((await POST(req({site:"test",rows:[{sourceUrl:"https://source.com",targetUrl:"https://example.com"}],decision:"remove"}))).status).toBe(403);
  permission.allowed=true;expect((await POST(req({site:"test",rows:[{sourceUrl:"https://secret:password@source.com",targetUrl:"https://example.com"}],decision:"remove"}))).status).toBe(400);
 });
});
