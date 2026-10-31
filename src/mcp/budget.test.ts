import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createSpendActor, runInSpendActor } from "@/providers/dataforseo/actor";
import { currentMonth, InMemorySpendStore, SpendGuard } from "@/providers/dataforseo/cost";
import { ActorBudgetExceededError, BudgetExceededError } from "@/providers/dataforseo/errors";
import { PgSpendStore } from "@/providers/dataforseo/store-db";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), db: () => testDb }));
// PGlite has a single connection, so the cross-process advisory-lock
// transaction would deadlock the nested ledger reads. Production uses a pool.
vi.mock("@/providers/dataforseo/spend-lock", () => ({ withProviderSpendLock: <T>(action: () => Promise<T>) => action() }));

const { POST } = await import("@/app/api/mcp/route");

const TOKEN = "budget-test-token-0123456789abcdef01234567";
const SITE = "pettransportglobal";
const MONTH = currentMonth();

async function migrations(): Promise<string[]> {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: Array<{ tag: string }> };
  return journal.entries.map((entry) => entry.tag);
}

async function tool(name: string, args: Record<string, unknown> = {}) {
  const response = await POST(new Request("https://seo.test/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  const body = await response.json() as { result: { isError: boolean; structuredContent: Record<string, unknown> } };
  return body.result;
}

/** DataForSEO keyword_suggestions envelope with a fixed reported cost. */
function suggestionsEnvelope(cost: number) {
  return {
    status_code: 20000,
    status_message: "Ok.",
    cost,
    tasks: [{
      id: "task-1",
      status_code: 20000,
      status_message: "Ok.",
      cost,
      result: [{
        total_count: 2,
        items_count: 2,
        items: [
          { keyword: "pet transport dubai", keyword_info: { search_volume: 880, cpc: 2.1, competition: 0.4 }, keyword_properties: { keyword_difficulty: 31 }, search_intent_info: { main_intent: "commercial" } },
          { keyword: "dog shipping cost", keyword_info: { search_volume: 390, cpc: 1.4, competition: 0.3 }, keyword_properties: { keyword_difficulty: 22 }, search_intent_info: { main_intent: "informational" } },
        ],
      }],
    }],
  };
}

const fetchMock = vi.fn();
const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "test");
  vi.stubEnv("QA_SYNTHETIC", "false");
  vi.stubEnv("AUTH_SECRET", "a-long-test-secret-for-internal-sessions");
  vi.stubEnv("SEOCOMMAND_MCP_TOKEN", TOKEN);
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  vi.stubEnv("DATAFORSEO_BASE_URL", "https://dataforseo.invalid");
  vi.stubEnv("MONTHLY_BUDGET_USD", "200");
  vi.stubGlobal("fetch", fetchMock);
  client = new PGlite();
  testDb = drizzle(client);
  for (const tag of await migrations()) await client.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));
});

afterAll(async () => {
  await client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  info.mockRestore();
});

beforeEach(async () => {
  vi.stubEnv("SEOCOMMAND_MCP_MONTHLY_BUDGET_USD", "");
  await testDb.delete(schema.providerSpend);
  await testDb.delete(schema.accessAuditEvents);
  fetchMock.mockReset();
});

describe("provider_spend actor migration", () => {
  it("adds actor additively and labels existing ledger rows as app on disposable data", async () => {
    const disposable = new PGlite();
    try {
      const tags = await migrations();
      const actorMigration = tags.indexOf("0017_provider_spend_actor");
      expect(actorMigration).toBeGreaterThan(0);
      for (const tag of tags.slice(0, actorMigration)) await disposable.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));
      await disposable.exec(`INSERT INTO provider_spend (provider, month, endpoint, domain_slug, cost_usd, requests) VALUES
        ('dataforseo', '2026-10', 'labsRankedKeywords', 'pettransportglobal', 0.05, 1),
        ('dataforseo', '2026-10', 'serpOrganicLive', NULL, 0.003, 1)`);

      // A deploy that ships the code before the migration runs must still
      // record charged spend, while actor caps fail closed.
      const live = testDb;
      testDb = drizzle(disposable);
      try {
        const store = new PgSpendStore();
        await store.record({ provider: "dataforseo", month: "2026-10", endpoint: "labsKeywordOverview", costUsd: 0.02, requests: 1, actor: "claude-mcp" });
        await store.record({ id: "00000000-0000-4000-8000-0000000000aa", provider: "dataforseo", month: "2026-10", endpoint: "labsKeywordSuggestions", costUsd: 0.01, requests: 1 });
        expect(await store.monthToDateUsd("dataforseo", "2026-10")).toBeCloseTo(0.083, 6);
        await expect(store.actorMonthToDateUsd("dataforseo", "2026-10", "claude-mcp")).rejects.toThrow();
      } finally {
        testDb = live;
      }
      const before = await disposable.query<{ total: number }>("SELECT SUM(cost_usd)::float AS total FROM provider_spend");

      for (const tag of tags.slice(actorMigration)) await disposable.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));

      const rows = await disposable.query<{ actor: string; endpoint: string }>("SELECT actor, endpoint FROM provider_spend ORDER BY endpoint");
      expect(rows.rows).toEqual([
        { actor: "app", endpoint: "labsKeywordOverview" },
        { actor: "app", endpoint: "labsKeywordSuggestions" },
        { actor: "app", endpoint: "labsRankedKeywords" },
        { actor: "app", endpoint: "serpOrganicLive" },
      ]);
      const after = await disposable.query<{ total: number }>("SELECT SUM(cost_usd)::float AS total FROM provider_spend");
      expect(after.rows[0]!.total).toBeCloseTo(before.rows[0]!.total, 6);
      await disposable.exec("INSERT INTO provider_spend (provider, month, endpoint, cost_usd) VALUES ('dataforseo', '2026-11', 'x', 0.01)");
      expect((await disposable.query<{ actor: string }>("SELECT actor FROM provider_spend WHERE endpoint = 'x'")).rows[0]!.actor).toBe("app");
      const index = await disposable.query("SELECT indexname FROM pg_indexes WHERE indexname = 'provider_spend_actor_month_idx'");
      expect(index.rows).toHaveLength(1);
    } finally {
      await disposable.close();
    }
  });
});

describe("actor budget accounting in SpendGuard", () => {
  const paid = (costUsd: number) => async () => ({ result: "ok", costUsd });

  it("records the actor, counts actor spend separately and stops at the actor cap", async () => {
    const store = new InMemorySpendStore();
    const guard = new SpendGuard(store, 200);
    await guard.run({ endpoint: "labsRankedKeywords", estimateUsd: 0.05 }, paid(0.5));
    const actor = createSpendActor({ actor: "claude-mcp", monthlyLimitUsd: 1 });
    await runInSpendActor(actor, async () => {
      await guard.run({ endpoint: "labsKeywordSuggestions", estimateUsd: 0.3 }, paid(0.4));
      await guard.run({ endpoint: "labsKeywordSuggestions", estimateUsd: 0.3 }, paid(0.4));
      const third = vi.fn(paid(0.4));
      await expect(guard.run({ endpoint: "labsKeywordSuggestions", estimateUsd: 0.3 }, third)).rejects.toBeInstanceOf(ActorBudgetExceededError);
      expect(third).not.toHaveBeenCalled();
    });
    expect(actor.spentUsd).toBeCloseTo(0.8, 6);
    expect(actor.requests).toBe(2);
    expect(await store.actorMonthToDateUsd("dataforseo", MONTH, "claude-mcp")).toBeCloseTo(0.8, 6);
    expect(await store.actorMonthToDateUsd("dataforseo", MONTH, "app")).toBeCloseTo(0.5, 6);
    expect(await store.monthToDateUsd("dataforseo", MONTH)).toBeCloseTo(1.3, 6);
  });

  it("keeps the overall guardrail in force inside an actor context", async () => {
    const store = new InMemorySpendStore();
    await store.record({ provider: "dataforseo", month: MONTH, endpoint: "x", costUsd: 199.98, requests: 1 });
    const guard = new SpendGuard(store, 200);
    const error = await runInSpendActor(createSpendActor({ actor: "claude-mcp", monthlyLimitUsd: 50 }), () =>
      guard.run({ endpoint: "labsKeywordSuggestions", estimateUsd: 0.05 }, paid(0.05)).catch((caught: unknown) => caught));
    expect(error).toBeInstanceOf(BudgetExceededError);
    expect(error).not.toBeInstanceOf(ActorBudgetExceededError);
  });

  it("fails closed when an actor cap is set but the store cannot report actor spend", async () => {
    const store = { monthToDateUsd: async () => 0, record: vi.fn(async () => undefined) };
    const guard = new SpendGuard(store, 200);
    await expect(runInSpendActor(createSpendActor({ actor: "claude-mcp", monthlyLimitUsd: 50 }), () =>
      guard.run({ endpoint: "x", estimateUsd: 0.01 }, paid(0.01)))).rejects.toBeInstanceOf(ActorBudgetExceededError);
    expect(store.record).not.toHaveBeenCalled();
  });
});

describe("paid MCP tools", () => {
  it("refuses a paid tool before any provider call when the estimate would pass the claude-mcp cap", async () => {
    vi.stubEnv("SEOCOMMAND_MCP_MONTHLY_BUDGET_USD", "1");
    await testDb.insert(schema.providerSpend).values({ provider: "dataforseo", month: MONTH, endpoint: "labsKeywordSuggestions", costUsd: 0.99, requests: 1, actor: "claude-mcp" });
    const result = await tool("keyword_research", { seed: "pet transport", site: SITE, locationCode: 2784, languageCode: "en" });
    expect(result.isError).toBe(true);
    expect(String(result.structuredContent.error)).toMatch(/Refused before spending.*claude-mcp budget/);
    expect(result.structuredContent).toMatchObject({ budget: { actor: "claude-mcp", limitUsd: 1 } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await testDb.select().from(schema.providerSpend)).toHaveLength(1);
    const [audit] = await testDb.select().from(schema.accessAuditEvents).where(eq(schema.accessAuditEvents.action, "mcp.keyword_research"));
    expect(audit!.metadata).toMatchObject({ status: "error", costUsd: 0 });
  });

  it("refuses when the overall $200 guardrail has no room even though the actor budget does", async () => {
    await testDb.insert(schema.providerSpend).values({ provider: "dataforseo", month: MONTH, endpoint: "backlinksList", costUsd: 199.99, requests: 1 });
    const result = await tool("keyword_research", { seed: "pet transport", locationCode: 2784, languageCode: "en" });
    expect(result.isError).toBe(true);
    expect(String(result.structuredContent.error)).toContain("overall DataForSEO guardrail");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs under the cap with a mocked provider, records claude-mcp on the ledger and reports spend", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(suggestionsEnvelope(0.0144)), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await tool("keyword_research", { seed: "pet transport", site: SITE, locationCode: 2784, languageCode: "en", limit: 20 });
    expect(result.isError).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://dataforseo.invalid/v3/dataforseo_labs/google/keyword_suggestions/live");
    const data = result.structuredContent as { rows: Array<{ keyword: string; volume: number }>; spend: { costUsd: number; estimateUsd: number; budget: { spentUsd: number; limitUsd: number } } };
    expect(data.rows.map((row) => row.keyword)).toEqual(["pet transport dubai", "dog shipping cost"]);
    expect(data.spend).toMatchObject({ costUsd: 0.0144, budget: { spentUsd: 0.0144, limitUsd: 50 } });
    expect(data.spend.estimateUsd).toBeGreaterThan(0);

    const ledger = await testDb.select().from(schema.providerSpend);
    expect(ledger).toEqual([expect.objectContaining({ actor: "claude-mcp", endpoint: "labsKeywordSuggestions", domainSlug: SITE, month: MONTH })]);
    expect(ledger[0]!.costUsd).toBeCloseTo(0.0144, 6);

    const [audit] = await testDb.select().from(schema.accessAuditEvents).where(eq(schema.accessAuditEvents.action, "mcp.keyword_research"));
    expect(audit).toMatchObject({ siteSlug: SITE, actorEmail: "claude-mcp" });
    expect((audit!.metadata as { costUsd: number }).costUsd).toBeCloseTo(0.0144, 6);
    expect(JSON.stringify(audit)).not.toContain("test-password");

    const spend = await tool("get_spend");
    expect(spend.structuredContent).toMatchObject({ month: MONTH, overall: { limitUsd: 200 }, mcp: { actor: "claude-mcp", limitUsd: 50 }, durable: true });
    expect((spend.structuredContent as { mcp: { spentUsd: number } }).mcp.spentUsd).toBeCloseTo(0.0144, 6);
    expect((spend.structuredContent as { byActor: Array<{ actor: string }> }).byActor.map((row) => row.actor)).toEqual(["claude-mcp"]);
  });

  it("stops part-way at the actor cap and reports what was actually charged", async () => {
    // Estimate is $0.05; the provider then reports $0.30 per call, so the
    // second paid request (overview mode) must be blocked by SpendGuard.
    vi.stubEnv("SEOCOMMAND_MCP_MONTHLY_BUDGET_USD", "0.40");
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(suggestionsEnvelope(0.3)), { status: 200 }));
    const result = await tool("keyword_research", { seed: "pet transport", locationCode: 2784, languageCode: "en", overview: true });
    const ledger = await testDb.select().from(schema.providerSpend);
    expect(ledger.every((row) => row.actor === "claude-mcp")).toBe(true);
    const total = ledger.reduce((sum, row) => sum + row.costUsd, 0);
    expect(total).toBeLessThanOrEqual(0.4 + 0.3);
    expect(ledger.length).toBeLessThan(4);
    // The overview's extra sections fail soft inside the route, so the tool
    // may still succeed with warnings; either way spend stopped at the cap.
    const data = result.structuredContent as { warnings?: string[]; costUsd?: number; spend?: { costUsd: number } };
    const charged = data.spend?.costUsd ?? data.costUsd;
    expect(charged).toBeCloseTo(total, 6);
    if (!result.isError) expect((data.warnings ?? []).join(" ")).toMatch(/claude-mcp/);
  });

  it("disables paid tools when the budget variable is invalid", async () => {
    vi.stubEnv("SEOCOMMAND_MCP_MONTHLY_BUDGET_USD", "not-a-number");
    const result = await tool("keyword_research", { seed: "pet transport", locationCode: 2784, languageCode: "en" });
    expect(result.isError).toBe(true);
    expect(String(result.structuredContent.error)).toContain("SEOCOMMAND_MCP_MONTHLY_BUDGET_USD");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
