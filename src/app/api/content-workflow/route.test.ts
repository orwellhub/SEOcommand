import {beforeEach,describe,expect,it,vi} from "vitest";
const permission=vi.hoisted(()=>({allowed:true}));
vi.mock("@/platform/access",()=>({canAccessSite:async()=>true,hasPermission:async()=>permission.allowed}));
vi.mock("@/platform/site-store",()=>({getManagedSite:async(id:string)=>({id,host:"example.com"})}));
vi.mock("@/lib/auth",()=>({sessionFromRequest:async()=>({email:"editor@example.com"})}));
import {GET,POST,PATCH} from "./route";
import {POST as edit} from "../content-editor/route";
const request=(body:unknown)=>new Request("http://localhost/api/content-workflow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
describe("content persistence and permissions",()=>{
 beforeEach(()=>{vi.stubEnv("QA_SYNTHETIC","true");permission.allowed=true;});
 it("creates, saves a draft and advances the same persisted item without losing its brief",async()=>{const created=await POST(request({site:"test-content",title:"Guide",ownerEmail:null,dueDate:"2026-09-18",brief:{primaryKeyword:"bus rental"}}));expect(created.status).toBe(201);let {item}=await created.json();const id=item.id;expect((await edit(request({action:"save",id,text:"Internal draft evidence",revision:null}))).status).toBe(200);let saved=(await (await GET(new Request("http://localhost/api/content-workflow?site=test-content"))).json()).items.find((row:{id:string})=>row.id===id);expect(saved.executionData.editor.text).toBe("Internal draft evidence");expect(saved.brief.primaryKeyword).toBe("bus rental");const stale=await PATCH(request({id,action:"schedule",updatedAt:item.updatedAt,title:"Stale",ownerEmail:null,dueDate:null}));expect(stale.status).toBe(409);({item}=await(await PATCH(request({id,action:"advance",stage:"draft",updatedAt:saved.updatedAt}))).json());expect(item.contentStage).toBe("draft");({item}=await(await PATCH(request({id,action:"advance",stage:"review",updatedAt:item.updatedAt}))).json());expect(item.contentStage).toBe("review");saved=(await (await GET(new Request("http://localhost/api/content-workflow?site=test-content"))).json()).items.find((row:{id:string})=>row.id===id);expect(saved.executionData.editor.text).toBe("Internal draft evidence");});
 it("rejects creation without content permission",async()=>{permission.allowed=false;expect((await POST(request({site:"test-content",title:"Guide",ownerEmail:null,dueDate:null}))).status).toBe(403);});
});
