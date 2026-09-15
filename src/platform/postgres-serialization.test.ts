import { beforeEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { queueBrowserCrawl } from "./advanced-crawler";
import { updateWorkspace } from "./workspace-store";
import type { CommandRecord } from "@/lib/command-model";

const queries: { sql: string; params: unknown[] }[] = [];
const driver = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    // postgres-js cannot serialize raw Date parameters in untyped SQL fragments.
    // Exercise the real Drizzle adapter, rather than PGlite's different driver.
    if (params.some(value => value instanceof Date)) throw new TypeError("Unencoded Date passed to postgres-js");
    queries.push({ sql, params });
    return Object.assign(Promise.resolve([]), { values: () => Promise.resolve([]) });
  },
  begin<T>(callback: (client: object) => Promise<T>): Promise<T> { return callback(driver); },
};
const database = drizzle(driver as never);
vi.mock("@/db", async () => ({ schema: await import("@/db/schema"), db: () => database }));
beforeEach(() => { queries.length = 0; });
it("encodes the stale crawl cutoff before handing it to postgres-js", async () => {
  await queueBrowserCrawl("globalbusrental", 20);
  const recovery = queries.find(q => q.sql.startsWith("update"));
  expect(recovery?.params.filter(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))).toHaveLength(2);
});
it("encodes the saved revision timestamp for a conflict-safe workspace update", async () => {
  const current = {id:"60000000-0000-4000-8000-000000000001",siteSlug:"globalbusrental",updatedAt:"2026-09-15T10:00:00.001Z",status:"saved"} as CommandRecord;
  await updateWorkspace(current, {content:"Review draft"});
  expect(queries[0]?.params).toContain(current.updatedAt);
});
