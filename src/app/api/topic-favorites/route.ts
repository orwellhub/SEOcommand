import {NextResponse} from "next/server";
import {z} from "zod";
import {canAccessSite,hasPermission} from "@/platform/access";
import {getManagedSite} from "@/platform/site-store";
import {saveWorkspace,workspaceRecords} from "@/platform/workspace-store";
export async function GET(request:Request){const site=new URL(request.url).searchParams.get("site")??"";if(!await getManagedSite(site)||!await canAccessSite(request,site))return NextResponse.json({error:"Website access required."},{status:403});return NextResponse.json({favorites:(await workspaceRecords(site,"topic_favorites")).filter(row=>row.status==="saved")});}
const Input=z.object({site:z.string(),key:z.string().min(1).max(500),label:z.string().min(1).max(500),url:z.string().url().max(2000).optional(),saved:z.boolean()});
export async function POST(request:Request){const parsed=Input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Choose a topic to save."},{status:400});const input=parsed.data;if(!await getManagedSite(input.site)||!await canAccessSite(request,input.site)||!await hasPermission(request,"manage_content",input.site))return NextResponse.json({error:"Content permission required."},{status:403});const record=await saveWorkspace(input.site,"topic_favorites",input.key,{label:input.label,url:input.url??null},input.saved?"saved":"removed");return NextResponse.json({record});}
