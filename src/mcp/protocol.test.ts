import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), db: () => testDb }));

const { POST, GET, DELETE } = await import("@/app/api/mcp/route");

const TOKEN = "mcp-test-token-0123456789abcdef0123456789";
const SITE = "pettransportglobal";

type Body = Record<string, unknown> & { result?: Record<string, unknown>; error?: { code: number; message: string; data?: Record<string, unknown> } };

function rpc(method: string, params: Record<string, unknown> = {}, options: { token?: string | null; modern?: boolean; headers?: Record<string, string>; id?: number | null } = {}) {
  const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/event-stream" });
  if (options.token !== null) headers.set("authorization", `Bearer ${options.token ?? TOKEN}`);
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, params: { ...params } };
  if (options.id !== null) body.id = options.id ?? 1;
  if (options.modern) {
    (body.params as Record<string, unknown>)._meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    headers.set("mcp-protocol-version", "2026-07-28");
    headers.set("mcp-method", method);
    if (method === "tools/call") headers.set("mcp-name", String(params.name));
  }
  for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
  return new Request("https://seo.test/api/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

async function call(method: string, params: Record<string, unknown> = {}, options: Parameters<typeof rpc>[2] = {}) {
  const response = await POST(rpc(method, params, options));
  const text = await response.text();
  return { response, body: (text ? JSON.parse(text) : null) as Body };
}

async function tool(name: string, args: Record<string, unknown> = {}) {
  const { body } = await call("tools/call", { name, arguments: args });
  const result = body.result as { structuredContent: Record<string, unknown>; isError: boolean; content: Array<{ text: string }> };
  return result;
}

const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "test");
  vi.stubEnv("QA_SYNTHETIC", "false");
  vi.stubEnv("AUTH_SECRET", "a-long-test-secret-for-internal-sessions");
  vi.stubEnv("SEOCOMMAND_MCP_TOKEN", TOKEN);
  vi.stubEnv("DATAFORSEO_LOGIN", "");
  vi.stubEnv("DATAFORSEO_PASSWORD", "");
  client = new PGlite();
  testDb = drizzle(client);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: Array<{ tag: string }> };
  for (const { tag } of journal.entries) await client.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));
});

afterAll(async () => {
  await client.close();
  vi.unstubAllEnvs();
  info.mockRestore();
});

beforeEach(async () => {
  vi.stubEnv("SEOCOMMAND_MCP_TOKEN", TOKEN);
  await testDb.delete(schema.accessAuditEvents);
  info.mockClear();
});

describe("MCP authentication", () => {
  it("rejects a missing bearer token with 401 and a WWW-Authenticate challenge", async () => {
    const { response, body } = await call("tools/list", {}, { token: null });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer realm="seocommand-mcp"/);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("rejects a wrong token with 401 without echoing either token", async () => {
    const wrong = "x".repeat(TOKEN.length);
    const { response, body } = await call("tools/list", {}, { token: wrong });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(JSON.stringify(body)).not.toContain(wrong);
  });

  it("refuses everything with 503 while the token is unset or shorter than 32 characters", async () => {
    vi.stubEnv("SEOCOMMAND_MCP_TOKEN", "");
    expect((await call("tools/list")).response.status).toBe(503);
    vi.stubEnv("SEOCOMMAND_MCP_TOKEN", "short-token-under-32-chars");
    const { response } = await call("tools/list", {}, { token: "short-token-under-32-chars" });
    expect(response.status).toBe(503);
  });

  it("answers GET and DELETE with 405", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });
});

describe("MCP protocol", () => {
  it("negotiates a legacy session-free initialize and accepts notifications/initialized", async () => {
    const { body, response } = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(response.headers.get("mcp-session-id")).toBeNull();
    expect(body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "seocommand" } });
    const unknown = await call("initialize", { protocolVersion: "1999-01-01" });
    expect(unknown.body.result?.protocolVersion).toBe("2025-11-25");
    const notification = await POST(rpc("notifications/initialized", {}, { id: null }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
    expect((await call("ping")).body.result).toEqual({});
  });

  it("lists every tool with JSON Schema inputs in a fixed order", async () => {
    const { body } = await call("tools/list");
    const tools = (body.result?.tools ?? []) as Array<{ name: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }>;
    expect(tools.map((item) => item.name)).toEqual([
      "list_sites", "get_site_live", "get_keyword_strategy", "get_market_intelligence", "get_ai_visibility", "get_rank_tracking", "get_collection_health", "get_spend", "get_analytics",
      "list_ai_prompts", "upsert_ai_prompt", "delete_ai_prompt", "list_rank_keywords", "upsert_rank_keywords", "delete_rank_keywords",
      "keyword_research", "keyword_metrics", "keyword_gap", "run_ai_visibility_now", "refresh_site",
    ]);
    for (const item of tools) expect(item.inputSchema.type).toBe("object");
    expect(tools.find((item) => item.name === "get_site_live")!.inputSchema.required).toEqual(["site"]);
    expect(tools.find((item) => item.name === "keyword_research")!.annotations.openWorldHint).toBe(true);
    expect(tools.find((item) => item.name === "get_spend")!.annotations.readOnlyHint).toBe(true);
  });

  it("serves modern 2026-07-28 requests statelessly with resultType and cache hints", async () => {
    const list = await call("tools/list", {}, { modern: true });
    expect(list.response.status).toBe(200);
    expect(list.body.result).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "private", _meta: { "io.modelcontextprotocol/serverInfo": { name: "seocommand" } } });
    const discover = await call("server/discover", {}, { modern: true });
    expect(discover.body.result).toMatchObject({ resultType: "complete", supportedVersions: expect.arrayContaining(["2026-07-28", "2025-11-25"]), capabilities: { tools: {} } });
  });

  it("rejects modern header mismatches and unsupported versions with 400", async () => {
    const mismatch = await call("tools/list", {}, { modern: true, headers: { "mcp-method": "tools/call" } });
    expect(mismatch.response.status).toBe(400);
    expect(mismatch.body.error?.code).toBe(-32020);
    const missingName = await call("tools/call", { name: "get_spend", arguments: {} }, { modern: true, headers: { "mcp-name": "list_sites" } });
    expect(missingName.body.error?.code).toBe(-32020);
    const request = rpc("tools/list", {}, { modern: true, headers: { "mcp-protocol-version": "2099-01-01" } });
    const body = JSON.parse(await request.clone().text());
    body.params._meta["io.modelcontextprotocol/protocolVersion"] = "2099-01-01";
    const response = await POST(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    const unsupported = await response.json() as Body;
    expect(unsupported.error?.code).toBe(-32022);
    expect(unsupported.error?.data?.supported).toContain("2026-07-28");
    const unknownMethod = await call("resources/list", {}, { modern: true });
    expect(unknownMethod.response.status).toBe(404);
    expect(unknownMethod.body.error?.code).toBe(-32601);
  });

  it("reports unknown tools as protocol errors and bad arguments as tool errors", async () => {
    const unknown = await call("tools/call", { name: "nope", arguments: {} });
    expect(unknown.body.error?.code).toBe(-32602);
    const invalid = await tool("get_site_live", { limit: 5 });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]!.text).toContain("site");
  });
});

describe("read tools", () => {
  beforeAll(async () => {
    const provenance = { source: "google-search-console", collectedAt: "2026-10-30T06:00:00.000Z", rangeStart: "2026-10-01", rangeEnd: "2026-10-28", location: "sc-domain:pettransportglobal.com", device: "desktop", freshness: "fresh", mode: "live" };
    await testDb.insert(schema.datasetSnapshots).values([
      { domainSlug: SITE, dataset: "striking_distance", capturedOn: "2026-10-30", provenance, payload: Array.from({ length: 30 }, (_, i) => ({ query: `ship a dog ${i}`, position: 5 + i / 2, impressions: 900 - i, clicks: 10, ctr: 1.1 })) },
      { domainSlug: SITE, dataset: "gsc_totals", capturedOn: "2026-10-30", provenance, payload: { clicks: 735, impressions: 41000, ctr: 1.8, position: 14.2 } },
      { domainSlug: SITE, dataset: "gsc_movers", capturedOn: "2026-10-30", provenance, payload: { gains: [{ key: "pet relocation uk", clicksNow: 40, clicksBefore: 12, change: 28, positionNow: 4, positionBefore: 9 }], losses: [] } },
    ]);
  });

  it("returns paged live sections with freshness from stored snapshots", async () => {
    const result = await tool("get_site_live", { site: SITE, sections: ["striking_distance", "query_movers", "competitors"], limit: 10, offset: 5 });
    expect(result.isError).toBe(false);
    const data = result.structuredContent as { gscTotals: Record<string, unknown>; sections: Record<string, Record<string, unknown>> };
    expect(data.gscTotals).toMatchObject({ clicks: 735, freshness: { capturedOn: "2026-10-30", collectedAt: "2026-10-30T06:00:00.000Z" } });
    expect(data.sections.striking_distance).toMatchObject({ total: 30, offset: 5, limit: 10, nextOffset: 15 });
    expect((data.sections.striking_distance!.rows as Array<{ query: string }>)[0]!.query).toBe("ship a dog 5");
    expect(data.sections.query_movers).toMatchObject({ gains: { total: 1 }, losses: { total: 0 } });
    expect(data.sections.competitors).toEqual({ status: "awaiting_first_sync" });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });

  it("get_analytics says when GA4 sources are not collected, then classifies them", async () => {
    const before = await tool("get_analytics", { site: SITE });
    expect(before.isError).toBe(false);
    expect((before.structuredContent as { sources: { status: string } }).sources.status).toBe("not_collected_yet");
    const provenance = { source: "google-analytics", collectedAt: "2026-10-30T06:00:00.000Z", location: "GA4 1", freshness: "fresh", mode: "live" };
    const r = (source: string, medium: string, channel: string, sessions: number, keyEvents = 0, leads = 0) => ({ source, medium, channel, sessions, engagedSessions: sessions, keyEvents, leads });
    await testDb.insert(schema.datasetSnapshots).values([{ domainSlug: SITE, dataset: "ga4_sources", capturedOn: "2026-10-30", provenance, payload: {
      days: 28, leadEvent: "generate_lead", leadsCounted: true, truncated: false,
      current: { start: "2026-10-01", end: "2026-10-28", rows: [r("google", "organic", "Organic Search", 100, 5, 2), r("bing", "organic", "Organic Search", 20, 1, 1), r("chatgpt.com", "referral", "Referral", 12, 2, 1), r("(direct)", "(none)", "Direct", 40)] },
      previous: { start: "2026-09-03", end: "2026-09-30", rows: [r("google", "organic", "Organic Search", 80), r("chatgpt.com", "referral", "Referral", 6)] },
    } }]);
    const after = await tool("get_analytics", { site: SITE });
    const data = after.structuredContent as { sources: Record<string, any> };
    expect(data.sources.status).toBe("ok");
    expect(data.sources.classes.ai_assistants.sessions).toMatchObject({ now: 12, before: 6, delta: 6, pct: 100 });
    expect(data.sources.classes.other_search.sessions).toMatchObject({ now: 20, before: 0, pct: null });
    expect(data.sources.nonGoogleShareOfOrganic.now).toBeCloseTo(20 / 120, 3);
    expect(data.sources.aiAssistants[0]).toMatchObject({ name: "ChatGPT", leads: { now: 1 } });
    expect(data.sources.rows.rows.map((x: { class: string }) => x.class)).toEqual(["google_organic", "other_search", "ai_assistants", "direct"]);
  });

  it("audits each tool call without recording secrets", async () => {
    await tool("get_site_live", { site: SITE, sections: ["striking_distance"] });
    const [row] = await testDb.select().from(schema.accessAuditEvents).where(eq(schema.accessAuditEvents.action, "mcp.get_site_live"));
    expect(row).toMatchObject({ siteSlug: SITE, actorEmail: "claude-mcp", area: "mcp" });
    expect(row!.metadata).toMatchObject({ tool: "get_site_live", status: "ok", costUsd: 0 });
    const logged = JSON.stringify(info.mock.calls) + JSON.stringify(row);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("orwell_session");
  });

  it("refuses an unknown site with a tool error naming list_sites", async () => {
    const result = await tool("get_site_live", { site: "no-such-site" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.structuredContent)).toContain("no-such-site");
  });

  it("lists registry sites", async () => {
    const result = await tool("list_sites");
    const sites = (result.structuredContent.sites as Array<{ slug: string }>).map((item) => item.slug);
    expect(sites).toContain(SITE);
  });
});

describe("manage tools", () => {
  beforeEach(async () => {
    await testDb.delete(schema.aiResponseObservations);
    await testDb.delete(schema.aiTrackingPrompts);
    await testDb.delete(schema.dailyRankHistory);
    await testDb.delete(schema.rankTrackingKeywords);
    await testDb.delete(schema.rankTrackingCampaigns);
  });

  it("creates, updates by text, lists and safely deletes tracked AI prompts", async () => {
    const created = await tool("upsert_ai_prompt", { site: SITE, prompt: "How much does it cost to fly a dog to Dubai?", topic: "Pricing", platforms: ["chatgpt", "claude"] });
    expect(created.isError).toBe(false);
    const prompt = (created.structuredContent as { created: boolean; prompt: Record<string, unknown> });
    expect(prompt.created).toBe(true);
    expect(prompt.prompt).toMatchObject({ sampleCount: 1, cadence: "monthly", active: true, source: "claude-mcp", languageCode: "en" });

    const updated = await tool("upsert_ai_prompt", { site: SITE, prompt: "How much does it cost to fly a dog to Dubai?", topic: "Pricing", platforms: ["perplexity"], sampleCount: 3, cadence: "monthly", locationCode: 2784, languageCode: "EN" });
    expect(updated.structuredContent).toMatchObject({ created: false, prompt: { id: prompt.prompt.id, platforms: ["perplexity"], sampleCount: 3, cadence: "monthly", locationCode: 2784, languageCode: "en" } });

    const listed = await tool("list_ai_prompts", { site: SITE });
    expect(listed.structuredContent).toMatchObject({ count: 1 });

    const id = prompt.prompt.id as string;
    await testDb.insert(schema.aiResponseObservations).values({ promptId: id, siteSlug: SITE, prompt: "How much does it cost to fly a dog to Dubai?", topic: "Pricing", platform: "perplexity", modelName: "sonar", capturedOn: "2026-10-30", responseHash: "h" });
    const kept = await tool("delete_ai_prompt", { site: SITE, id });
    expect(kept.structuredContent).toMatchObject({ action: "deactivated", observationsKept: 1 });
    expect((await testDb.select().from(schema.aiResponseObservations)).length).toBe(1);

    const other = await tool("upsert_ai_prompt", { site: SITE, prompt: "Which pet shipping firms fly to Australia?", topic: "Routes", platforms: ["gemini"] });
    const removed = await tool("delete_ai_prompt", { site: SITE, id: (other.structuredContent as { prompt: { id: string } }).prompt.id });
    expect(removed.structuredContent).toMatchObject({ action: "deleted" });
  });

  it("upserts rank keywords into a reusable campaign and keeps history on delete", async () => {
    const first = await tool("upsert_rank_keywords", { site: SITE, keywords: [{ keyword: "pet transport uk", targetUrl: "https://pettransportglobal.com/uk" }, { keyword: "dog shipping" }], locationCode: 2826 });
    expect(first.isError).toBe(false);
    const added = (first.structuredContent as { added: Array<{ id: string; keyword: string }>; campaignId: string });
    expect(added.added.map((row) => row.keyword).sort()).toEqual(["dog shipping", "pet transport uk"]);

    const second = await tool("upsert_rank_keywords", { site: SITE, keywords: [{ keyword: "dog shipping", tags: ["core"] }, { keyword: "cat flights" }], locationCode: 2826, cadence: "daily" });
    const result = second.structuredContent as { campaignId: string; added: Array<{ keyword: string }>; updated: Array<{ keyword: string; tags: string[]; cadence: string }> };
    expect(result.campaignId).toBe(added.campaignId);
    expect(result.added.map((row) => row.keyword)).toEqual(["cat flights"]);
    expect(result.updated).toEqual([expect.objectContaining({ keyword: "dog shipping", tags: ["core"], cadence: "daily" })]);
    expect((await testDb.select().from(schema.rankTrackingCampaigns)).length).toBe(1);

    const withHistory = added.added.find((row) => row.keyword === "pet transport uk")!;
    const withoutHistory = added.added.find((row) => row.keyword === "dog shipping")!;
    await testDb.insert(schema.dailyRankHistory).values({ trackedKeywordId: withHistory.id, siteSlug: SITE, capturedOn: "2026-10-30", position: 7 });
    const missing = "00000000-0000-4000-8000-000000000001";
    const deleted = await tool("delete_rank_keywords", { site: SITE, ids: [withHistory.id, withoutHistory.id, missing] });
    expect(deleted.structuredContent).toMatchObject({ deactivated: [withHistory.id], deleted: [withoutHistory.id], notFound: [missing] });
    expect((await testDb.select().from(schema.dailyRankHistory)).length).toBe(1);

    const listed = await tool("list_rank_keywords", { site: SITE, includeInactive: false });
    expect((listed.structuredContent as { keywords: { rows: Array<{ keyword: string }> } }).keywords.rows.map((row) => row.keyword)).toEqual(["cat flights"]);
  });
});
