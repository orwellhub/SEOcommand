import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({allowed:true,collect:vi.fn()}));
vi.mock("@/platform/access",()=>({canAccessSite:async()=>true,hasPermission:async()=>state.allowed}));
vi.mock("@/platform/site-store",()=>({getManagedSite:async()=>({host:"example.com"})}));
vi.mock("@/providers/similarweb/collect",()=>({collectTraffic:state.collect}));
import {POST} from "./route";
const request=(report="overview")=>new Request("http://localhost/api/traffic-analytics",{method:"POST",body:JSON.stringify({site:"test",domain:"example.com",country:"world",month:"2026-01",report})});
describe("traffic spending permissions",()=>{
 beforeEach(()=>{state.allowed=true;state.collect.mockReset().mockResolvedValue({});vi.stubEnv("SIMILARWEB_API_KEY","test-key");vi.stubEnv("SIMILARWEB_CONTRACT_APPROVED","");vi.stubEnv("SIMILARWEB_MONTHLY_CREDIT_LIMIT","1000");vi.stubEnv("SIMILARWEB_POPULAR_PAGES_APPROVED","");vi.stubEnv("SIMILARWEB_GEOGRAPHY_APPROVED","");});
 it("never treats a key as permission to buy traffic data",async()=>{expect((await POST(request())).status).toBe(409);expect(state.collect).not.toHaveBeenCalled();});
 it("requires the premium entitlement separately and rejects users without scan permission",async()=>{
  vi.stubEnv("SIMILARWEB_CONTRACT_APPROVED","true");expect((await POST(request("pages"))).status).toBe(409);
  vi.stubEnv("SIMILARWEB_POPULAR_PAGES_APPROVED","true");state.allowed=false;expect((await POST(request("pages"))).status).toBe(403);expect(state.collect).not.toHaveBeenCalled();
 });
 it("passes only an explicitly enabled report to the collector",async()=>{
  vi.stubEnv("SIMILARWEB_CONTRACT_APPROVED","true");vi.stubEnv("SIMILARWEB_GEOGRAPHY_APPROVED","true");expect((await POST(request("countries"))).status).toBe(200);expect(state.collect).toHaveBeenCalledWith("test",expect.objectContaining({country:"world"}),"countries");
 });
});
