import {afterEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({project:null as null|{id:string;siteSlug:string|null;status:string}}));
vi.mock("@/sync/store",()=>({hasDatabase:()=>true}));
vi.mock("@/db",()=>({schema:{keywordProjects:{id:"id"}},db:()=>({select:()=>({from:()=>({where:()=>({limit:async()=>state.project?[state.project]:[]})})})})}));
vi.mock("drizzle-orm",()=>({eq:vi.fn()}));
import {validResearchProject} from "./research-projects";
afterEach(()=>{state.project=null;vi.unstubAllEnvs();});
it("allows unfiled research but rejects unknown or cross-site project assignment",async()=>{vi.stubEnv("QA_SYNTHETIC","false");expect(await validResearchProject(undefined,"globalbusrental")).toBe(true);expect(await validResearchProject("missing","globalbusrental")).toBe(false);state.project={id:"p",siteSlug:"other",status:"active"};expect(await validResearchProject("p","globalbusrental")).toBe(false);});
it("only links work to an active project for the chosen website",async()=>{vi.stubEnv("QA_SYNTHETIC","false");state.project={id:"p",siteSlug:"globalbusrental",status:"archived"};expect(await validResearchProject("p","globalbusrental")).toBe(false);state.project.status="active";expect(await validResearchProject("p","globalbusrental")).toBe(true);});
