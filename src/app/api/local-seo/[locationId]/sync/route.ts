import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { syncLocalLocation } from "@/platform/local-seo";
import { BudgetExceededError, DailyLimitError } from "@/providers/dataforseo/errors";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ result: { locationId, status: "completed", costUsd: 0, synthetic: true } });
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!z.string().uuid().safeParse(locationId).success) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  try {
    return NextResponse.json({ result: await syncLocalLocation(locationId) });
  } catch (error) {
    const status = error instanceof BudgetExceededError || error instanceof DailyLimitError ? 429 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Local scan failed." }, { status });
  }
}
