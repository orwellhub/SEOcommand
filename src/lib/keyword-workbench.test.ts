import { describe, expect, it } from "vitest";
import { EMPTY_KEYWORD_FILTERS, filterKeywords, keywordGroups, keywordKey, keywordSummary, type WorkbenchKeyword } from "./keyword-workbench";

const row = (keyword: string, volume: number | null = 100, marketCode = 2826): WorkbenchKeyword => ({ keyword, volume, marketCode, marketLabel: "UK", languageCode: "en", difficulty: 25, cpc: 1, competition: null, competitionLevel: null, intent: "commercial", lowTopBid: null, highTopBid: null, trend: [], monthlySearches: [] });
describe("keyword report filtering", () => {
  const rows = [row("bus rental london"), row("rental bus london"), {...row("coach hire london"),relatedToSeed:true}, row("how much is bus rental", null), row("bus rentals", 200)];
  it("distinguishes the three matching controls", () => {
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,match:"broad"})).toHaveLength(4);
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,match:"phrase"})).toHaveLength(3);
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,match:"exact"})).toHaveLength(2);
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,match:"related"}).map(r=>r.keyword)).toEqual(["coach hire london"]);
  });
  it("combines question, market and numeric filters without treating missing metrics as zero", () => {
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,questions:true})).toHaveLength(1);
    expect(filterKeywords(rows,"bus rental",{...EMPTY_KEYWORD_FILTERS,questions:true,minVolume:"0"})).toHaveLength(0);
    expect(filterKeywords([...rows,row("bus rental dubai",200,2784)],"bus rental",{...EMPTY_KEYWORD_FILTERS,market:"2784:en",include:"dubai",exclude:"london"})).toHaveLength(1);
  });
  it("groups whole terms and counts each keyword only once per group", () => {
    expect(keywordGroups([row("bus rental london london",100),row("bus rental london driver",null)],"bus rental").find(g=>g.term==="london")).toEqual({term:"london",count:2,volume:100});
    expect(keywordGroups(rows,"bus rental",["london"]).some(g=>g.term==="london")).toBe(false);
  });
  it("preserves missing summaries and language-specific row identities", () => {
    expect(keywordSummary([row("bus",null)]).volume).toBeNull();
    expect(keywordKey(row("bus"))).not.toBe(keywordKey({...row("bus"),languageCode:"ar"}));
  });
});
