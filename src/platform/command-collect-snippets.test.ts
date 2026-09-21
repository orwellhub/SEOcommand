import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchPublic } = vi.hoisted(() => ({ fetchPublic: vi.fn() }));
vi.mock("./public-network", () => ({ fetchPublic, assertPublicHostname: vi.fn() }));
vi.mock("@/providers/dataforseo", () => ({ getDataForSeoClient: vi.fn() }));
vi.mock("@/providers/google/auth", () => ({ getGoogleAccessToken: vi.fn(), googleConfigured: () => false }));

import { checkWatchedPage } from "./command-collect";
import type { ManagedSite } from "./types";

const site = { id: "example", name: "Example", host: "example.test" } as unknown as ManagedSite;

function page(body: string, headers: Record<string, string> = {}) {
  fetchPublic.mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } }));
}

describe("watched page AI answer eligibility", () => {
  beforeEach(() => { fetchPublic.mockReset(); });

  it("records nothing for a page with no snippet restrictions", async () => {
    page("<html><head><title>A</title></head><body>text</body></html>");
    expect((await checkWatchedPage(site, "/")).issues).toEqual([]);
  });

  it("flags a nosnippet meta robots tag", async () => {
    page('<html><head><meta name="robots" content="index, nosnippet"></head><body>x</body></html>');
    expect((await checkWatchedPage(site, "/")).issues).toContain("ai_snippet_blocked");
  });

  it("flags a googlebot-specific directive", async () => {
    page('<html><head><meta name="googlebot" content="NOSNIPPET"></head><body>x</body></html>');
    expect((await checkWatchedPage(site, "/")).issues).toContain("ai_snippet_blocked");
  });

  it("flags an X-Robots-Tag header", async () => {
    page("<html><body>x</body></html>", { "x-robots-tag": "googlebot: nosnippet" });
    expect((await checkWatchedPage(site, "/")).issues).toContain("ai_snippet_blocked");
  });

  it("flags a snippet capped below a useful length", async () => {
    page('<html><head><meta name="robots" content="max-snippet:40"></head><body>x</body></html>');
    expect((await checkWatchedPage(site, "/")).issues).toEqual(["ai_snippet_limited"]);
  });

  it("does not confuse two separate meta tags when combining directives", async () => {
    page('<html><head><meta name="robots" content="index,follow"><meta name="googlebot" content="max-snippet:20"></head><body>x</body></html>');
    const result = await checkWatchedPage(site, "/");
    expect(result.issues).toEqual(["ai_snippet_limited"]);
    expect(result.indexable).toBe(true);
  });

  it("counts data-nosnippet regions in several attribute spellings", async () => {
    page('<html><body><div data-nosnippet>a</div><span data-nosnippet="true">b</span><p data-nosnippet >c</p></body></html>');
    expect((await checkWatchedPage(site, "/")).issues).toContain("ai_partial_nosnippet");
  });

  it("does not flag an unrelated attribute that merely contains the word", async () => {
    page('<html><body><div class="data-nosnippet-helper">a</div></body></html>');
    expect((await checkWatchedPage(site, "/")).issues).toEqual([]);
  });

  it("keeps reporting a noindex page as not indexable", async () => {
    page('<html><head><meta name="robots" content="noindex"></head><body>x</body></html>');
    expect((await checkWatchedPage(site, "/")).indexable).toBe(false);
  });
});
