import { NextResponse } from "next/server";
import { buildAiVisibilityDashboard } from "@/platform/ai-read-model";
import { getManagedSite, listManagedSites, listPortfolioGroups, resolveGroupSiteSlugs } from "@/platform/site-store";
import { hasDatabase } from "@/sync/store";
import { qaAiVisibility } from "@/data/qa-fixtures";
import { filterAccessibleSiteSlugs } from "@/platform/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopeId = url.searchParams.get("scope") ?? "portfolio";
  const days = Number(url.searchParams.get("days") ?? "90");
  let label = "Portfolio";
  let requested: string[];
  if (scopeId === "portfolio") {
    const sites = await listManagedSites();
    requested = sites.map((site) => site.id);
  } else if (scopeId.startsWith("group:")) {
    const groupId = scopeId.slice(6);
    const group = (await listPortfolioGroups()).find((item) => item.id === groupId);
    if (!group) return NextResponse.json({ error: "Portfolio group not found." }, { status: 404 });
    label = group.name;
    requested = await resolveGroupSiteSlugs(groupId);
  } else {
    const site = await getManagedSite(scopeId);
    if (!site) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    label = site.name;
    requested = [site.id];
  }
  const siteSlugs = await filterAccessibleSiteSlugs(request, requested);
  if (!scopeId.startsWith("group:") && scopeId !== "portfolio" && siteSlugs.length === 0) {
    return NextResponse.json({ error: "Website access required." }, { status: 403 });
  }
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json(qaAiVisibility(scopeId, siteSlugs));
  if (!hasDatabase()) return NextResponse.json({ error: "AI history requires DATABASE_URL." }, { status: 503 });
  return NextResponse.json(await buildAiVisibilityDashboard({ id: scopeId, label, siteSlugs }, days));
}
