import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { resumeResearch, cancelResearch, processResearchJobs, queueResearch, researchRun, researchRuns } from "./research-jobs";
import { queueBrowserCrawl } from "./advanced-crawler";
import { uncertainResearchSpend } from "@/providers/dataforseo/reservations";
import { SpendGuard } from "@/providers/dataforseo/cost";
import { type ResearchPayload } from "@/lib/research-evidence";
import { POST } from "@/app/api/research/route";
import { canAccessSite, hasPermission } from "./access";

let client: PGlite, testDb: ReturnType<typeof drizzle>;
const mocks = vi.hoisted(() => ({ post: vi.fn(), postTask: vi.fn(), fetchReviewTask: vi.fn() }));
vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), db: () => testDb }));
vi.mock("@/sync/store", () => ({ hasDatabase: () => true }));
vi.mock("@/providers/dataforseo", () => ({ getDataForSeoClient: () => mocks, dataForSeoConfigured: () => true }));
vi.mock("@/lib/auth", () => ({ sessionFromRequest: async () => ({ email: "owner@test.local", role: "admin" }) }));
vi.mock("./access", () => ({ canAccessSite: vi.fn(async () => true), hasPermission: vi.fn(async () => true) }));
vi.mock("./site-store", () => ({ getManagedSite: async (id: string) => ({ id, host: `${id}.test`, primaryMarket: { location_code: 2840, language_code: "en", label: "US" } }) }));
vi.mock("./research-plan", async (original) => ({ ...await original<typeof import("./research-plan")>(), buildResearchPlan: async () => plan() }));
vi.mock("./spend-approval", () => ({ assertSiteSpendAllowed: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
function plan(count = 1, reviews = false): ResearchPayload {
  return { input: { feature: reviews ? "reviews" : "footprint", keywords: [], domains: ["a.test"], platform: "google", device: "desktop" }, market: { locationCode: 2840, languageCode: "en", label: "US" }, estimateUsd: count * .15, notes: [], units: Array.from({ length: count }, (_, i) => ({ id: String(i), label: `a.test ${i}`, endpoint: "rankedKeywords", path: "/test", body: { target: "a.test" }, estimateUsd: .15, ...(reviews ? { mode: "reviews" as const } : {}) })) };
}
const request = (body: unknown) => new Request("https://seo.test/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "test"); vi.stubEnv("QA_SYNTHETIC", "false"); client = new PGlite(); testDb = drizzle(client);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const { tag } of journal.entries) await client.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));
  await testDb.insert(schema.datasetSnapshots).values({ domainSlug: "a", dataset: "saved-history", capturedOn: "2026-09-01", payload: { clicks: 123 }, provenance: { mode: "live" } });
});
afterAll(async () => { await client.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await testDb.delete(schema.commandRecords); await testDb.delete(schema.providerSpend); vi.clearAllMocks();
  vi.mocked(canAccessSite).mockResolvedValue(true); vi.mocked(hasPermission).mockResolvedValue(true);
  mocks.post.mockResolvedValue({ result: [], costUsd: .012 }); mocks.postTask.mockResolvedValue({ taskId: "saved-task", costUsd: .015 }); mocks.fetchReviewTask.mockResolvedValue([]);
});
it("previews without charging or creating records and refuses inaccessible sites", async () => {
  expect((await POST(request({ action: "preview", site: "a", input: plan().input }))).status).toBe(200);
  expect(await researchRuns("a", "footprint")).toHaveLength(0); expect(mocks.post).not.toHaveBeenCalled();
  vi.mocked(canAccessSite).mockResolvedValue(false);
  expect((await POST(request({ action: "collect", site: "b", input: plan().input, approvedEstimate: .15 }))).status).toBe(403);
});
it("deduplicates concurrent queue attempts and worker claims", async () => {
  const attempts = await Promise.allSettled([queueResearch("a", plan(), "owner"), queueResearch("a", plan(), "owner")]);
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
  const [run] = await researchRuns("a", "footprint");
  await Promise.all([processResearchJobs(run!.id), processResearchJobs(run!.id)]);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post.mock.calls[0]![3]).toMatchObject({ retry: false, requestId: expect.any(String) });
  expect((await researchRuns("a", "footprint"))[0]!.status).toBe("completed");
  expect((await testDb.select().from(schema.datasetSnapshots))[0]!.payload).toEqual({ clicks: 123 });
});
it("posts reviews once and polls the saved task without purchasing again", async () => {
  const run = await queueResearch("a", plan(1, true), "owner"); await processResearchJobs(run.id);
  expect((await researchRuns("a", "reviews"))[0]!.payload.units[0]!.taskId).toBe("saved-task");
  await testDb.update(schema.commandRecords).set({ nextRunAt: new Date(0) }).where(eq(schema.commandRecords.id, run.id));
  await processResearchJobs(run.id);
  expect(mocks.postTask).toHaveBeenCalledTimes(1); expect(mocks.fetchReviewTask).toHaveBeenCalledWith("saved-task");
  expect((await researchRuns("a", "reviews"))[0]!.status).toBe("completed");
});
it("retains completed evidence and reserves an uncertain second charge without retrying", async () => {
  mocks.post.mockResolvedValueOnce({ result: [], costUsd: .012 }).mockRejectedValueOnce(new Error("Network interrupted"));
  const run = await queueResearch("a", plan(2), "owner"); await processResearchJobs(run.id); await processResearchJobs(run.id);
  const saved = (await researchRuns("a", "footprint"))[0]!;
  expect(saved.status).toBe("failed"); expect(saved.payload.units[0]!.costUsd).toBe(.012); expect(mocks.post).toHaveBeenCalledTimes(2);
  const month = new Date().toISOString().slice(0, 7);
  expect(await uncertainResearchSpend(month)).toBe(.15);
  expect(await uncertainResearchSpend(month, { site: "b" })).toBe(0);
  expect(await uncertainResearchSpend(month, { excludeId: saved.payload.units[1]!.chargeId })).toBe(0);
  await testDb.insert(schema.providerSpend).values({ id: saved.payload.units[1]!.chargeId!, provider: "dataforseo", month, endpoint: "rankedKeywords", costUsd: .01, requests: 1 });
  expect(await uncertainResearchSpend(month)).toBe(0);
});
it("keeps cancellation while an in-flight paid response finishes", async () => {
  const run = await queueResearch("a", plan(2), "owner");
  mocks.post.mockImplementationOnce(async () => { await cancelResearch("a", run.id); return { result: [], costUsd: .01 }; });
  await processResearchJobs(run.id);
  const saved = (await researchRuns("a", "footprint"))[0]!;
  expect(saved.status).toBe("cancelled"); expect(saved.payload.units[0]!.costUsd).toBe(.01); expect(mocks.post).toHaveBeenCalledTimes(1);
  await expect(cancelResearch("b", run.id)).rejects.toThrow();
});
it("marks a stale worker failed without replaying or dropping old records", async () => {
  const run = await queueResearch("a", plan(), "owner");
  await testDb.update(schema.commandRecords).set({ status: "running", updatedAt: new Date(Date.now() - 20 * 60000) }).where(eq(schema.commandRecords.id, run.id));
  await processResearchJobs(run.id);
  expect((await researchRuns("a", "footprint"))[0]!.status).toBe("failed"); expect(mocks.post).not.toHaveBeenCalled();
});
it("subtracts uncertain charges from headroom without labelling them actual spend", async () => {
  const record = vi.fn(), call = vi.fn();
  const guard = new SpendGuard({ monthToDateUsd: async () => 199, reservedUsd: async () => .8, record }, 200);
  expect(await guard.status()).toMatchObject({ spentUsd: 199, reservedUsd: .8, remainingUsd: expect.closeTo(.2, 5) });
  await expect(guard.run({ endpoint: "test", estimateUsd: .3 }, call)).rejects.toThrow(); expect(call).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
});

it("resumes cancelled pending work without repeating completed charges", async () => {
 const run = await queueResearch("a", plan(2), "owner");
 mocks.post.mockImplementationOnce(async () => { await cancelResearch("a", run.id); return { result: [], costUsd: .01 }; });
 await processResearchJobs(run.id);
 await resumeResearch("a", run.id);
 await processResearchJobs(run.id);
 expect(mocks.post).toHaveBeenCalledTimes(2);
 expect((await researchRuns("a", "footprint"))[0]!.status).toBe("completed");
});
it("refuses resuming uncertain paid work and inaccessible records", async () => {
 const run = await queueResearch("a", plan(2), "owner"); mocks.post.mockRejectedValueOnce(new Error("connection lost"));
 await processResearchJobs(run.id);
 await expect(resumeResearch("a", run.id)).rejects.toThrow("uncertain");
 await expect(resumeResearch("b", run.id)).rejects.toThrow();
 expect(mocks.post).toHaveBeenCalledTimes(1);
});
it("background pagination saves every result page and stops at the provider total", async () => {
 const input=plan(); input.units[0]={...input.units[0]!,endpoint:"labsKeywordIdeas",body:{offset:0,limit:1000},maxRows:50000};
 const item=(keyword:string)=>({keyword,keyword_info:{search_volume:10}});
 mocks.post.mockResolvedValueOnce({result:[{items:Array.from({length:1000},(_,i)=>item(`bus ${i}`)),total_count:1001}],costUsd:.02}).mockResolvedValueOnce({result:[{items:[item("last bus")],total_count:1001}],costUsd:.01});
 const run=await queueResearch("a",input,"owner");await processResearchJobs(run.id);
 const saved=(await researchRuns("a","footprint"))[0]!;
 expect(saved.status).toBe("completed");expect(saved.payload.units).toHaveLength(2);expect(saved.payload.report?.tables[0]?.rows).toHaveLength(1001);
 expect(mocks.post.mock.calls[1]?.[2]).toEqual([expect.objectContaining({offset:1000})]);
});

it("finds older collection progress beyond the first history page without crossing site boundaries", async()=>{
 const old=await queueResearch("a",plan(),"owner");
 await testDb.update(schema.commandRecords).set({status:"completed",createdAt:new Date(0)}).where(eq(schema.commandRecords.id,old.id));
 await testDb.insert(schema.commandRecords).values(Array.from({length:13},(_,i)=>({siteSlug:"a",kind:"research_footprint",recordKey:String(i),status:"completed",payload:plan()})));
 expect((await researchRuns("a","footprint")).some(r=>r.id===old.id)).toBe(false);
 expect((await researchRun("a","footprint",old.id))?.id).toBe(old.id);expect(await researchRun("b","footprint",old.id)).toBeNull();
});

it("deduplicates browser requests and recovers a dead worker without deleting its evidence", async()=>{
 await testDb.delete(schema.platformJobs);
 const [old]=await testDb.insert(schema.platformJobs).values({siteSlug:"a",kind:"browser_crawl",status:"running",startedAt:new Date(0),progress:{heartbeatAt:1,maxPages:20}}).returning();
 const [first,second]=await Promise.all([queueBrowserCrawl("a",10),queueBrowserCrawl("a",10)]);
 expect(first.id).toBe(second.id);expect(first.id).not.toBe(old!.id);
 const [retained]=await testDb.select().from(schema.platformJobs).where(eq(schema.platformJobs.id,old!.id));
 expect(retained?.status).toBe("failed");expect(retained?.progress).toMatchObject({maxPages:20});
});
