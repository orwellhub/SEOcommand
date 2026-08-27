import { NextResponse } from "next/server";
import { dataForSeoConfigured } from "@/providers/dataforseo";
import { fetchDataForSeoBalance } from "@/providers/dataforseo/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
let cached: { balanceUsd: number; updatedAt: string; expiresAt: number } | null = null;

export async function GET() {
  if (!dataForSeoConfigured()) {
    return NextResponse.json({ provider: "dataforseo", configured: false, available: false });
  }

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ provider: "dataforseo", configured: true, available: true, balanceUsd: cached.balanceUsd, updatedAt: cached.updatedAt });
  }

  try {
    const balanceUsd = await fetchDataForSeoBalance();
    const updatedAt = new Date().toISOString();
    cached = { balanceUsd, updatedAt, expiresAt: now + CACHE_MS };
    return NextResponse.json(
      { provider: "dataforseo", configured: true, available: true, balanceUsd, updatedAt },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ provider: "dataforseo", configured: true, available: false });
  }
}
