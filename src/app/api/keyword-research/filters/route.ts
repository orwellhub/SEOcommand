import {NextResponse} from "next/server";
import {z} from "zod";
import {canAccessSite,hasPermission} from "@/platform/access";
import {workspaceRecords,saveWorkspace} from "@/platform/workspace-store";
import {EMPTY_KEYWORD_FILTERS} from "@/lib/keyword-workbench";
const strings=Object.fromEntries(Object.keys(EMPTY_KEYWORD_FILTERS).filter(key=>!["match","questions","group"].includes(key)).map(key=>[key,z.string().max(500)]));
const Input=z.object({site:z.string().min(1),name:z.string().trim().min(1).max(100),filters:z.object({...strings,match:z.enum(["all","broad","phrase","exact","related"]),questions:z.boolean(),group:z.array(z.string().max(100)).max(4)}),query:z.string().max(400).default(""),hidden:z.array(z.string().max(50)).max(20)});
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!site||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});return NextResponse.json({records:(await workspaceRecords(site,"keyword_filters")).filter(row=>row.status!=="archived")});}
export async function POST(request:Request){const parsed=Input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Enter a name and valid keyword filters."},{status:400});const {site,...payload}=parsed.data;if(!await canAccessSite(request,site)||!await hasPermission(request,"research",site))return NextResponse.json({error:"Research access required."},{status:403});return NextResponse.json({record:await saveWorkspace(site,"keyword_filters",crypto.randomUUID(),payload)});}
