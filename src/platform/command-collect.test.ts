import { afterEach, expect, it, vi } from "vitest";
import { getDataForSeoClient } from "@/providers/dataforseo";
import { collectSpeed, inspectIndex, normalizeSpeed } from "./command-collect";
import { getGoogleAccessToken, googleConfigured } from "@/providers/google/auth";
import type { ManagedSite } from "./types";
vi.mock("@/providers/dataforseo", () => ({ getDataForSeoClient: vi.fn() }));
vi.mock("@/providers/google/auth", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token"), googleConfigured: vi.fn(() => false) }));
vi.mock("./public-network", () => ({ assertPublicHostname: vi.fn(async () => undefined), fetchPublic: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); vi.mocked(googleConfigured).mockReturnValue(false); });
it("keeps missing lab and field metrics absent; does not fabricate INP", () => {
  const result = normalizeSpeed({ lighthouseResult: { fetchTime: "2026-09-09T10:00:00Z", categories: { performance: { score: .64 } }, audits: { "largest-contentful-paint": { numericValue: 4100, score: .2, title: "LCP", displayValue: "4.1s" } } } }, "https://example.com", "mobile");
  expect(result).toMatchObject({ score: 64, lcpMs: 4100, tbtMs: null, cls: null, field: null }); expect(result).not.toHaveProperty("inp");
  expect(() => normalizeSpeed({ lighthouseResult: { runtimeError: { message: "Navigation failed" } } }, "https://example.com", "desktop")).toThrow("Navigation failed");
});
it("labels origin field data separately from a page lab test", () => {
  const result = normalizeSpeed({ originLoadingExperience: { id: "https://example.com", metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 140, category: "FAST" } } }, lighthouseResult: { categories: { performance: { score: 0 } } } }, "https://example.com/page", "desktop");
  expect(result.score).toBe(0); expect(result.field?.scope).toBe("origin");
});
it("uses the authorised property for inspection and preserves Google crawl versus inspection dates", async () => {
  const fetcher = vi.fn(async () => Response.json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed", lastCrawlTime: "2026-08-01T10:00:00Z" } } }));
  vi.stubGlobal("fetch", fetcher);
  const site = { host: "example.com", gscSite: "sc-domain:example.com" } as ManagedSite;
  const result = await inspectIndex(site, "/page");
  expect(result.lastCrawl).toBe("2026-08-01T10:00:00Z"); expect(result.inspectedAt).not.toBe(result.lastCrawl);
  expect(JSON.parse((fetcher.mock.calls[0] as any)[1].body)).toMatchObject({ inspectionUrl: "https://example.com/page", siteUrl: "sc-domain:example.com" });
  await expect(inspectIndex(site, "http://evil.test/")).rejects.toThrow("this website"); expect(fetcher).toHaveBeenCalledTimes(1);
});

it("uses the existing Google connection for speed tests without shared anonymous quota", async () => {
  vi.mocked(googleConfigured).mockReturnValue(true); vi.stubEnv("PAGESPEED_API_KEY", ""); vi.stubEnv("GOOGLE_CLOUD_PROJECT", "test-project");
  const fetcher = vi.fn(async () => Response.json({ lighthouseResult: { categories: { performance: { score: .81 } } } })); vi.stubGlobal("fetch", fetcher);
  expect((await collectSpeed({ host: "example.com" } as ManagedSite, "/", "mobile")).score).toBe(81);
  expect(getGoogleAccessToken).toHaveBeenCalledWith(["openid"]);
  expect((fetcher.mock.calls[0] as any)[1].headers).toEqual({ Authorization: "Bearer test-token", "x-goog-user-project": "test-project" });
});
it("prefers an explicitly configured PageSpeed key and explains quota failures", async () => {
  vi.mocked(googleConfigured).mockReturnValue(true); vi.stubEnv("PAGESPEED_API_KEY", "test-key");
  const fetcher = vi.fn(async () => Response.json({ error: { message: "Quota exceeded" } }, { status: 429 })); vi.stubGlobal("fetch", fetcher);
  await expect(collectSpeed({ host: "example.com" } as ManagedSite, "/", "desktop")).rejects.toThrow("quota");
  expect(getGoogleAccessToken).not.toHaveBeenCalled(); expect(String((fetcher.mock.calls[0] as any)[0])).toContain("key=test-key");
});

it("uses an explicit paid Lighthouse request once and preserves provider cost", async () => {
 const post=vi.fn(async()=>({result:[{categories:{performance:{score:.75}},lighthouseVersion:"13.0"}],costUsd:.00425}));
 vi.mocked(getDataForSeoClient).mockReturnValue({post} as never);
 const result=await collectSpeed({id:"globalbusrental",host:"globalbusrental.com"} as ManagedSite,"/","mobile","dataforseo");
 expect(result).toMatchObject({score:75,provider:"dataforseo",costUsd:.00425,field:null});
 expect(post).toHaveBeenCalledExactlyOnceWith("onPageLighthouse","/v3/on_page/lighthouse/live/json",[{url:"https://globalbusrental.com/",for_mobile:true,categories:["performance"]}],{domainSlug:"globalbusrental",retry:false});
});
