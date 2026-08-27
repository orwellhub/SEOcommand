import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { qaCompetitorExplorer } from "@/data/qa-fixtures";
import { hasPermission } from "@/platform/access";
import { cleanCompetitorHost, collectDomainResearch } from "@/platform/competitive-intelligence";
import { dataForSeoConfigured } from "@/providers/dataforseo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";
import { hasDatabase } from "@/sync/store";
import { DOMAIN_RESEARCH_ESTIMATE_USD } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunSchema = z.object({
  targetHost: z.string().min(3).max(253),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(12),
  locationLabel: z.string().min(2).max(120),
  projectId: z.string().uuid().nullable().optional(),
});

type QaEvidence = ReturnType<typeof qaEvidence>;
const qaRuns: QaEvidence[] = [];

function qaEvidence(targetHost = "competitor.example", locationCode = 2840, languageCode = "en", locationLabel = "United States") {
  const result = qaCompetitorExplorer(targetHost);
  return {
    id: "71000000-0000-4000-8000-000000000001",
    projectId: null,
    kind: "domain",
    title: `${targetHost} domain research`,
    sourceValue: targetHost,
    locationCode,
    languageCode,
    locationLabel,
    provider: "dataforseo",
    providerCostUsd: 0,
    summary: result.overview,
    evidence: { keywords: result.keywords, pages: result.pages, backlinks: result.backlinks },
    createdBy: "qa@orwell.local",
    capturedAt: result.capturedAt,
    updatedAt: result.capturedAt,
  };
}

export async function GET(request: Request) {
  if (!await hasPermission(request, "research")) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (process.env.QA_SYNTHETIC === "true") {
    const evidence = qaRuns[0] ?? qaEvidence();
    return id ? NextResponse.json({ evidence: id === evidence.id ? evidence : null, synthetic: true }) : NextResponse.json({ evidence: [evidence], estimateUsd: DOMAIN_RESEARCH_ESTIMATE_USD, synthetic: true });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Domain research requires DATABASE_URL." }, { status: 503 });
  if (id) {
    const [evidence] = await db().select().from(schema.researchEvidence).where(eq(schema.researchEvidence.id, id)).limit(1);
    if (!evidence || evidence.kind !== "domain") return NextResponse.json({ error: "Research evidence not found." }, { status: 404 });
    return NextResponse.json({ evidence });
  }
  const evidence = await db().select({
    id: schema.researchEvidence.id,
    projectId: schema.researchEvidence.projectId,
    kind: schema.researchEvidence.kind,
    title: schema.researchEvidence.title,
    sourceValue: schema.researchEvidence.sourceValue,
    locationCode: schema.researchEvidence.locationCode,
    languageCode: schema.researchEvidence.languageCode,
    locationLabel: schema.researchEvidence.locationLabel,
    provider: schema.researchEvidence.provider,
    providerCostUsd: schema.researchEvidence.providerCostUsd,
    summary: schema.researchEvidence.summary,
    createdBy: schema.researchEvidence.createdBy,
    capturedAt: schema.researchEvidence.capturedAt,
    updatedAt: schema.researchEvidence.updatedAt,
  }).from(schema.researchEvidence).where(eq(schema.researchEvidence.kind, "domain")).orderBy(desc(schema.researchEvidence.capturedAt)).limit(50);
  return NextResponse.json({ evidence, estimateUsd: DOMAIN_RESEARCH_ESTIMATE_USD });
}

export async function POST(request: Request) {
  if (!await hasPermission(request, "research")) return NextResponse.json({ error: "Research permission required." }, { status: 403 });
  const parsed = RunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid domain and market." }, { status: 400 });
  let targetHost: string;
  try { targetHost = cleanCompetitorHost(parsed.data.targetHost); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid domain." }, { status: 400 }); }
  if (process.env.QA_SYNTHETIC === "true") {
    const evidence = qaEvidence(targetHost, parsed.data.locationCode, parsed.data.languageCode, parsed.data.locationLabel);
    qaRuns.unshift(evidence);
    return NextResponse.json({ evidence, estimateUsd: DOMAIN_RESEARCH_ESTIMATE_USD, synthetic: true }, { status: 201 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "Domain research requires DATABASE_URL." }, { status: 503 });
  if (!dataForSeoConfigured()) return NextResponse.json({ error: "DataForSEO is not connected." }, { status: 503 });
  try {
    const result = await collectDomainResearch({
      targetHost,
      locationCode: parsed.data.locationCode,
      languageCode: parsed.data.languageCode,
    });
    const [evidence] = await db().insert(schema.researchEvidence).values({
      projectId: parsed.data.projectId ?? null,
      kind: "domain",
      title: `${result.targetHost} domain research`,
      sourceValue: result.targetHost,
      locationCode: parsed.data.locationCode,
      languageCode: parsed.data.languageCode,
      locationLabel: parsed.data.locationLabel,
      providerCostUsd: result.costUsd,
      summary: result.overview,
      evidence: { keywords: result.keywords, pages: result.pages, backlinks: result.backlinks },
      createdBy: request.headers.get("x-orwell-user-email"),
      capturedAt: new Date(result.capturedAt),
    }).returning();
    return NextResponse.json({ evidence, estimateUsd: DOMAIN_RESEARCH_ESTIMATE_USD }, { status: 201 });
  } catch (error) {
    const status = error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Domain research failed." }, { status });
  }
}
