import { NextResponse } from "next/server";
import { buildAiVisibilityDashboard } from "@/platform/ai-read-model";
import { getManagedSite, listManagedSites, listPortfolioGroups, resolveGroupSiteSlugs } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { qaAiVisibility } from "@/data/qa-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.QA_SYNTHETIC === "true") {
    const scopeId = new URL(request.url).searchParams.get("scope") ?? "portfolio";
    return NextResponse.json(qaAiVisibility(scopeId));
  }
  if (!hasDatabase()) return NextResponse.json({ error: "AI history requires DATABASE_URL." }, { status: 503 });
  const url = new URL(request.url);
  const scopeId = url.searchParams.get("scope") ?? "portfolio";
  const days = Number(url.searchParams.get("days") ?? "90");
  if (scopeId === "portfolio") {
    const sites = await listManagedSites();
    return NextResponse.json(await buildAiVisibilityDashboard({ id: scopeId, label: "Portfolio", siteSlugs: sites.map((site) => site.id) }, days));
  }
  if (scopeId.startsWith("group:")) {
    const groupId = scopeId.slice(6);
    const group = (await listPortfolioGroups()).find((item) => item.id === groupId);
    if (!group) return NextResponse.json({ error: "Portfolio group not found." }, { status: 404 });
    return NextResponse.json(await buildAiVisibilityDashboard({ id: scopeId, label: group.name, siteSlugs: await resolveGroupSiteSlugs(groupId) }, days));
  }
  const site = await getManagedSite(scopeId);
  if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  return NextResponse.json(await buildAiVisibilityDashboard({ id: scopeId, label: site.name, siteSlugs: [site.id] }, days));
}
