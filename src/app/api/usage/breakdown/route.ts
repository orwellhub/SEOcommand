import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentMonth } from "@/providers/dataforseo/cost";
import { hasDatabase } from "@/sync/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actual DataForSEO spend this month, from the provider_spend ledger, broken
 * down by property (domain) and by endpoint. `avgPerRequest` is the real
 * measured unit price of each call. Google (GSC/GA4) is free and never appears
 * here. Read-only; no secrets.
 */
export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ ok: false, note: "No database configured." }, { status: 503 });
  }
  const month = currentMonth();
  const where = and(
    eq(schema.providerSpend.provider, "dataforseo"),
    eq(schema.providerSpend.month, month),
  );

  const [byDomain, byEndpoint, totals, runDays] = await Promise.all([
    db()
      .select({
        domain: schema.providerSpend.domainSlug,
        costUsd: sql<number>`ROUND(SUM(${schema.providerSpend.costUsd})::numeric, 4)`,
        requests: sql<number>`SUM(${schema.providerSpend.requests})`,
      })
      .from(schema.providerSpend)
      .where(where)
      .groupBy(schema.providerSpend.domainSlug)
      .orderBy(sql`SUM(${schema.providerSpend.costUsd}) DESC`),
    db()
      .select({
        endpoint: schema.providerSpend.endpoint,
        costUsd: sql<number>`ROUND(SUM(${schema.providerSpend.costUsd})::numeric, 4)`,
        requests: sql<number>`SUM(${schema.providerSpend.requests})`,
        avgPerRequest: sql<number>`ROUND((SUM(${schema.providerSpend.costUsd}) / NULLIF(SUM(${schema.providerSpend.requests}),0))::numeric, 5)`,
      })
      .from(schema.providerSpend)
      .where(where)
      .groupBy(schema.providerSpend.endpoint)
      .orderBy(sql`SUM(${schema.providerSpend.costUsd}) DESC`),
    db()
      .select({
        costUsd: sql<number>`ROUND(SUM(${schema.providerSpend.costUsd})::numeric, 4)`,
        requests: sql<number>`SUM(${schema.providerSpend.requests})`,
      })
      .from(schema.providerSpend)
      .where(where),
    db()
      .select({ days: sql<number>`COUNT(DISTINCT ${schema.providerSpend.occurredAt}::date)` })
      .from(schema.providerSpend)
      .where(where),
  ]);

  const totalCost = Number(totals[0]?.costUsd ?? 0);
  const distinctDomains = byDomain.length || 1;

  return NextResponse.json({
    ok: true,
    month,
    provider: "dataforseo",
    note: "Cumulative this month across all runs. Google (GSC/GA4) is free and excluded. avgPerRequest is the real measured unit price.",
    totalCostUsd: totalCost,
    totalRequests: Number(totals[0]?.requests ?? 0),
    distinctRunDays: Number(runDays[0]?.days ?? 0),
    avgCostPerDomainToDate: Math.round((totalCost / distinctDomains) * 10000) / 10000,
    byDomain,
    byEndpoint,
  });
}
