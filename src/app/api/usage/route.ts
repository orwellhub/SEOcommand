import { NextResponse } from "next/server";
import { InMemorySpendStore, SpendGuard, type SpendStore } from "@/providers/dataforseo/cost";
import { PgSpendStore } from "@/providers/dataforseo/store-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Month-to-date DataForSEO spend against the app-owned monthly guardrail.
 * Works in demo mode (shows $0 of the configured limit). Feeds the Settings
 * usage meter once wired to live data.
 */
export async function GET() {
  const limitUsd = Number(process.env.MONTHLY_BUDGET_USD ?? "200");
  const store: SpendStore = process.env.DATABASE_URL ? new PgSpendStore() : new InMemorySpendStore();
  const guard = new SpendGuard(store, limitUsd);
  try {
    const budget = await guard.status();
    return NextResponse.json({ ok: true, budget });
  } catch {
    return NextResponse.json({
      ok: false,
      note: "Spend store unavailable; showing defaults.",
      budget: { spentUsd: 0, limitUsd, remainingUsd: limitUsd, pctUsed: 0, crossed: [] },
    });
  }
}
