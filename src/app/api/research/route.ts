import { after, NextResponse } from "next/server";
import { z } from "zod";
import { sessionFromRequest } from "@/lib/auth";
import { canAccessSite, hasPermission } from "@/platform/access";
import { getManagedSite } from "@/platform/site-store";
import { researchFeature, type ResearchFeature } from "@/lib/research-evidence";
import { buildResearchPlan, researchDefaults, researchInputSchema } from "@/platform/research-plan";
import { resumeResearch, cancelResearch, processResearchJobs, queueResearch, researchRun, researchRuns } from "@/platform/research-jobs";
import { dataForSeoConfigured } from "@/providers/dataforseo";
import { assertSiteSpendAllowed } from "@/platform/spend-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!await sessionFromRequest(request)) return NextResponse.json({ error: "Sign in to view research." }, { status: 401 });
  const params = new URL(request.url).searchParams, siteId = params.get("site") ?? "", feature = params.get("feature") ?? "";
  if (!researchFeature(feature)) return NextResponse.json({ error: "Choose a research tool." }, { status: 400 });
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  try {
    const site = await getManagedSite(siteId);
    if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    const [runs, defaults, canScan, canEdit] = await Promise.all([researchRuns(site.id, feature as ResearchFeature, Math.min(1200, Math.max(0, Number(params.get("offset")) || 0))), researchDefaults(site), hasPermission(request, "run_scans", site.id), hasPermission(request, "manage_content", site.id)]);
    return NextResponse.json({ runs: runs.map((run) => ({ ...run, payload: { ...run.payload, lease: undefined, units: run.payload.units.map(({ raw: _raw, ...unit }) => unit) } })), defaults, canScan, canEdit, configured: dataForSeoConfigured() && process.env.QA_SYNTHETIC !== "true" });
  } catch { return NextResponse.json({ error: "Saved research could not load. Retry shortly." }, { status: 503 }); }
}
const bodySchema = z.object({ site: z.string().min(1).max(120), action: z.enum(["preview", "collect", "cancel", "continue", "resume"]), input: researchInputSchema.optional(), id: z.string().uuid().optional(), approvedEstimate: z.number().finite().nonnegative().max(25).optional() });
export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Sign in to manage research." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Review these details." }, { status: 400 });
  const body = parsed.data;
  if (!await canAccessSite(request, body.site) || !await hasPermission(request, "run_scans", body.site)) return NextResponse.json({ error: "Scan access required for this website." }, { status: 403 });
  try {
    const site = await getManagedSite(body.site);
    if (!site || site.archivedAt) return NextResponse.json({ error: "Active website required." }, { status: 404 });
    if (body.action === "cancel") {
      if (!body.id) throw new Error("Choose an active collection.");
      const run = await cancelResearch(site.id, body.id);
      return NextResponse.json({ run, message: "Collection stopped. Completed evidence is retained; an in-flight request may still finish." });
    }
    if (body.action === "resume") {
      if (!body.id) throw new Error("Choose a saved collection.");
      const run = await resumeResearch(site.id, body.id);
      after(() => processResearchJobs(run.id));
      return NextResponse.json({ run }, { status: 202 });
    }
    if (body.action === "continue") {
      if (!body.id || !body.input) throw new Error("Choose a queued collection.");
      const run = await researchRun(site.id, body.input.feature, body.id);
      if (!run || !["queued", "waiting"].includes(run.status)) throw new Error("Only queued or waiting collections can continue. Failed requests are not replayed.");
      after(() => processResearchJobs(run.id));
      return NextResponse.json({ message: "Worker requested. Existing review task IDs and completed evidence are reused." }, { status: 202 });
    }
    if (!body.input) throw new Error("Choose the research inputs.");
    const plan = await buildResearchPlan(site, body.input);
    if (body.action === "preview") return NextResponse.json({ plan });
    if (process.env.QA_SYNTHETIC === "true" || !dataForSeoConfigured()) return NextResponse.json({ error: "A live DataForSEO connection is required. Paid calls are disabled in previews." }, { status: 409 });
    if (body.approvedEstimate == null || body.approvedEstimate + .0000001 < plan.estimateUsd) return NextResponse.json({ error: "Review the updated collection estimate first.", plan }, { status: 409 });
    // Total site headroom is checked up front; each provider request rechecks category and portfolio limits under the shared spend lock.
    await assertSiteSpendAllowed(site.id, "researchCollection", plan.estimateUsd);
    const run = await queueResearch(site.id, plan, session.email);
    after(() => processResearchJobs(run.id));
    return NextResponse.json({ run, message: "Research queued. You can leave this page; results are saved." }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not collect research." }, { status: 400 }); }
}
