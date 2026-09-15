import {describe,expect,it} from "vitest";
import {benchmarkHtml,originalityAgainstBenchmarks} from "./content-analysis";
import {onPageIdeas} from "./on-page-analysis";
describe("on-page evidence",()=>{
 it("extracts SEO signals and never treats unreadable HTML as a clean page",()=>{expect(onPageIdeas(null,[],"bus",[],[])).toEqual([]);const page=benchmarkHtml('<html><head><title>Coach hire</title><meta content="noindex" name="robots"></head><body><h1>Coach hire</h1><img src="bus.jpg"><a href="/contact">Contact us</a></body></html>',"https://example.com");expect(page.noindex).toBe(true);expect(page.internalLinks).toBe(1);expect(page.missingAlt).toBe(1);expect(onPageIdeas(page,[],"bus rental",[],[]).map(idea=>idea.id)).toContain("noindex");});
 it("compares passages only against the supplied pages",()=>{const draft="Here is an original eight word passage explaining how we plan journeys for groups.";const page=benchmarkHtml(`<p>${draft}</p>`,"https://example.com");expect(originalityAgainstBenchmarks(draft,[page])[0]!.overlapPercent).toBe(100);expect(originalityAgainstBenchmarks(draft,[])).toEqual([]);});
});
