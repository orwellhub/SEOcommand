import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { processBrowserCrawlJobs } from "./operational-jobs";

let client: PGlite, testDb: ReturnType<typeof drizzle>;
const mocks = vi.hoisted(() => ({ crawl: vi.fn(async () => ({ runId: "run", pagesCrawled: 100, issueCounts: {}, diffSummary: {} })) }));
vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), db: () => testDb }));
vi.mock("./advanced-crawler", () => ({ runBrowserCrawl: mocks.crawl, queueBrowserCrawl: vi.fn() }));
vi.mock("./site-store", () => ({ getManagedSite: async (id: string) => ({ id, host: `${id}.test` }), listManagedSites: async () => [] }));
vi.mock("./local-seo", () => ({ listDueLocalLocations: vi.fn(), syncLocalLocation: vi.fn() }));
vi.mock("./reliability", () => ({ checkReliability: vi.fn() }));

beforeAll(async () => {
  client = new PGlite(); testDb = drizzle(client);
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const { tag } of journal.entries) await client.exec(await readFile(`drizzle/${tag}.sql`, "utf8"));
});
afterAll(async () => { await client.close(); });

it("processes only the explicitly selected website and leaves another website’s queue and recovery state intact", async () => {
  const [other, stale, selected] = await testDb.insert(schema.platformJobs).values([
    { siteSlug: "other", kind: "browser_crawl", runAfter: new Date(0), createdAt: new Date(0) },
    { siteSlug: "other", kind: "browser_crawl", runAfter: new Date(0), status: "running", startedAt: new Date(0) },
    { siteSlug: "selected", kind: "browser_crawl", runAfter: new Date(0), progress: { maxPages: 100 } },
  ]).returning();
  expect(await processBrowserCrawlJobs(new Date(), () => false, "selected")).toEqual({ due: 1, completed: 1, failed: 0 });
  expect(mocks.crawl).toHaveBeenCalledOnce();
  expect(mocks.crawl).toHaveBeenCalledWith(expect.objectContaining({ id: "selected" }), 100, expect.any(Object));
  const rows = await testDb.select().from(schema.platformJobs);
  expect(rows.find(row => row.id === other.id)?.status).toBe("queued");
  expect(rows.find(row => row.id === stale.id)?.status).toBe("running");
  expect(rows.find(row => row.id === selected.id)?.status).toBe("completed");
});

it("does not launch a browser when shutdown is requested", async () => {
  mocks.crawl.mockClear();
  const [job] = await testDb.insert(schema.platformJobs).values({ siteSlug: "shutdown", kind: "browser_crawl", runAfter: new Date(0) }).returning();
  expect(await processBrowserCrawlJobs(new Date(), () => true, "shutdown")).toEqual({ due: 1, completed: 0, failed: 0 });
  expect(mocks.crawl).not.toHaveBeenCalled();
  const [saved] = await testDb.select().from(schema.platformJobs).where(eq(schema.platformJobs.id, job.id));
  expect(saved.status).toBe("queued");
});
