import { expect, it, vi } from "vitest";
import type { Browser } from "playwright";
import { CrawlBrowser } from "./crawl-browser";

function fixture() {
  const contexts: { close: ReturnType<typeof vi.fn> }[] = [];
  const browsers: { close: ReturnType<typeof vi.fn> }[] = [];
  const launch = vi.fn(async () => {
    const browser = { close: vi.fn(async () => {}), newContext: vi.fn(async () => {
      const context = { close: vi.fn(async () => {}), newPage: vi.fn(async () => ({})) };
      contexts.push(context);
      return context;
    }) };
    browsers.push(browser);
    return browser as unknown as Browser;
  });
  return { contexts, browsers, launch };
}

it("disposes every page context and recycles the browser across a 100-page crawl", async () => {
  const f = fixture(), crawler = new CrawlBrowser(f.launch, "test");
  const results = [];
  for (let index = 0; index < 100; index++) results.push(await crawler.inspect(async () => {}, async () => index));
  await crawler.close();
  expect(results).toHaveLength(100);
  expect(f.launch).toHaveBeenCalledTimes(10);
  expect(f.contexts).toHaveLength(100);
  expect(f.contexts.every(context => context.close.mock.calls.length === 1)).toBe(true);
  expect(f.browsers.every(browser => browser.close.mock.calls.length === 1)).toBe(true);
});

it("releases request history when a page fails, allowing the next page to run", async () => {
  const f = fixture(), crawler = new CrawlBrowser(f.launch, "test");
  await expect(crawler.inspect(async () => {}, async () => { throw new Error("timeout"); })).rejects.toThrow("timeout");
  expect(f.contexts[0].close).toHaveBeenCalledOnce();
  expect(await crawler.inspect(async () => {}, async () => "saved")).toBe("saved");
  await crawler.close();
  expect(f.contexts[1].close).toHaveBeenCalledOnce();
});

it("closes a context if request protection fails to initialise", async () => {
  const f = fixture(), crawler = new CrawlBrowser(f.launch, "test"), collect = vi.fn();
  await expect(crawler.inspect(async () => { throw new Error("routing failed"); }, collect)).rejects.toThrow("routing failed");
  expect(collect).not.toHaveBeenCalled();
  expect(f.contexts[0].close).toHaveBeenCalledOnce();
  await crawler.close();
});
