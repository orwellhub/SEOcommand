import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canAccessSite, hasPermission } from "@/platform/access";
import { sessionFromRequest } from "@/lib/auth";
import { workspaceRecords, saveWorkspace, updateWorkspace } from "@/platform/workspace-store";
import { businessConfigured } from "@/providers/google/business";
import { mailConfigured, sendMail } from "@/providers/google/mail";
import { LocalPostSchema, ReviewCampaignSchema, googleReviewUrl } from "@/lib/local-workflows";
export const runtime = "nodejs";
export const maxDuration = 300;
const Input = z.object({ site: z.string().min(1).max(120), kind: z.enum(["local_posts", "review_campaigns"]), action: z.enum(["save", "schedule", "pause", "send"]), key: z.string().uuid().optional(), updatedAt: z.string().datetime().optional(), scheduledAt: z.string().datetime().optional(), payload: z.record(z.unknown()).optional() });
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? "";
  if (!await canAccessSite(request, site)) return NextResponse.json({error:"Website access required."},{status:403});
  const [posts, campaigns] = await Promise.all([workspaceRecords(site,"local_posts"),workspaceRecords(site,"review_campaigns")]);
  const locations = process.env.QA_SYNTHETIC === "true" ? [] : await db().select({id:schema.localSeoLocations.id,name:schema.localSeoLocations.name,placeId:schema.localSeoLocations.placeId}).from(schema.localSeoLocations).where(eq(schema.localSeoLocations.siteSlug,site));
  return NextResponse.json({posts,campaigns,locations,businessConnected:businessConfigured(),mailConnected:mailConfigured()});
}
export async function POST(request: Request) {
  const parsed=Input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Review the workflow details."},{status:400});
  const input=parsed.data;
  if(!await canAccessSite(request,input.site)||!await hasPermission(request,"manage_content",input.site))return NextResponse.json({error:"Business content access required."},{status:403});
  const current=input.key?(await workspaceRecords(input.site,input.kind)).find(row=>row.recordKey===input.key):null;
  if(input.key&&!current)return NextResponse.json({error:"Saved workflow not found."},{status:404});
  if(current&&current.updatedAt!==input.updatedAt)return NextResponse.json({error:"This workflow changed. Reload before continuing."},{status:409});
  try {
    if(input.action==="save") {
      if(current&&!['draft','paused'].includes(current.status))throw new Error("Only drafts and paused workflows can be edited. Create a new draft for different content.");
      const payload=(input.kind==="local_posts"?LocalPostSchema:ReviewCampaignSchema).parse(input.payload);
      const [location]=process.env.QA_SYNTHETIC==="true"?[]:await db().select().from(schema.localSeoLocations).where(and(eq(schema.localSeoLocations.id,payload.businessId),eq(schema.localSeoLocations.siteSlug,input.site))).limit(1);
      if(!location)throw new Error("Add and select a real business location on this website first.");
      const saved={...payload,...(input.kind==="review_campaigns"?{reviewUrl:location.placeId?googleReviewUrl(location.placeId):null}:{})};
      const record=current?await updateWorkspace(current,saved,"draft"):await saveWorkspace(input.site,input.kind,crypto.randomUUID(),saved,"draft");
      if(!record)return NextResponse.json({error:"This workflow changed. Reload before saving."},{status:409});
      return NextResponse.json({record,message:"Draft saved."});
    }
    if(!current)throw new Error("Save a draft before continuing.");
    if(input.action==="pause") {
      if(!["scheduled","draft"].includes(current.status))throw new Error("This workflow can no longer be paused.");
      const record=await updateWorkspace(current,current.payload,"paused");
      return record?NextResponse.json({record,message:"Workflow paused."}):NextResponse.json({error:"The workflow changed. Reload to check its status."},{status:409});
    }
    if(process.env.QA_SYNTHETIC==="true")throw new Error("External publishing and delivery are disabled in preview.");
    if(!["draft","paused"].includes(current.status))throw new Error("This workflow has already been submitted or scheduled. Check its status before creating another.");
    if(input.action==="schedule") {
      if(input.kind!=="local_posts"||!input.scheduledAt||Date.parse(input.scheduledAt)<=Date.now())throw new Error("Choose a future date and time for this Google post.");
      if(!businessConfigured())throw new Error("Connect Google Business Profile before scheduling publication.");
      const [connection]=await db().select().from(schema.commandRecords).where(and(eq(schema.commandRecords.siteSlug,input.site),eq(schema.commandRecords.kind,"workspace_business"),eq(schema.commandRecords.recordKey,String(current.payload.businessId)))).limit(1);
      if(!connection)throw new Error("Link this business to its matching Google profile first.");
      const record=await updateWorkspace(current,{...current.payload,scheduledAt:input.scheduledAt,scheduledBy:(await sessionFromRequest(request))?.email},"scheduled");
      return record?NextResponse.json({record,message:"Post scheduled for the first hourly worker run at or after that time."}):NextResponse.json({error:"The draft changed. Reload before scheduling."},{status:409});
    }
    if(input.kind!=="review_campaigns"||!mailConfigured())throw new Error("Connect the review-request mailbox before sending this campaign.");
    const campaign=ReviewCampaignSchema.parse(current.payload);
    const [location]=await db().select().from(schema.localSeoLocations).where(and(eq(schema.localSeoLocations.id,campaign.businessId),eq(schema.localSeoLocations.siteSlug,input.site))).limit(1);
    if(!location?.placeId||current.payload.reviewUrl!==googleReviewUrl(location.placeId))throw new Error("Save this campaign again after confirming the location’s Google Place ID.");
    const recipients=[...new Set(campaign.recipients.map(value=>value.toLowerCase()))];
    let claimed=await updateWorkspace(current,{...current.payload,submittedBy:(await sessionFromRequest(request))?.email},"sending");
    if(!claimed)return NextResponse.json({error:"This campaign was already submitted. Reload to check its status."},{status:409});
    const deliveries:{email:string;messageId:string}[]=[];
    try {
      for(const [index,to] of recipients.entries()) { const sent=await sendMail({id:`${claimed.id}-${index}`,to:[to],subject:campaign.subject,text:`${campaign.message}\n\nShare your honest experience: ${current.payload.reviewUrl}`});deliveries.push({email:to,messageId:sent.id}); const checkpoint=await updateWorkspace(claimed,{...claimed.payload,deliveries:[...deliveries]},"sending");if(!checkpoint)throw new Error("Could not save the delivery receipt. Check Sent before continuing.");claimed=checkpoint; }
      await updateWorkspace(claimed,{...claimed.payload,deliveries:[...deliveries],sentAt:new Date().toISOString()},"sent");
    }catch(error){await updateWorkspace(claimed,{...claimed.payload,deliveries:[...deliveries],error:`${error instanceof Error?error.message:"Delivery interrupted."} Check Sent before contacting any remaining recipients. No automatic retry.`},"needs_review");throw error;}
    return NextResponse.json({message:`Mailbox accepted ${deliveries.length} individual review requests.`});
  } catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:error instanceof Error?error.message:"Workflow could not be saved."},{status:400});}
}
