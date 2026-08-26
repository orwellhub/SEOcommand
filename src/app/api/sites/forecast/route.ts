import { NextResponse } from "next/server";
import { z } from "zod";
import { forecastSiteCost } from "@/platform/cost-forecast";

const Schema = z.object({
  trackedKeywords: z.number().int().min(1).max(5000),
  crawlMaxPages: z.number().int().min(100).max(100000),
  backlinkLimit: z.number().int().min(1000).max(100000),
  aiPrompts: z.number().int().min(0).max(100),
  aiPlatforms: z.number().int().min(1).max(4),
  devices: z.array(z.enum(["desktop", "mobile"])).min(1),
});

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid forecast assumptions." }, { status: 400 });
  }
  return NextResponse.json({ forecast: forecastSiteCost(parsed.data) });
}
