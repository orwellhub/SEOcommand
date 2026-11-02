import { describe, expect, it } from "vitest";
import { chooseWebSearchModel } from "./index";

// 2 Nov 2026: DataForSEO refused the hard-coded "gpt-4o" and every AI run failed.
describe("chooseWebSearchModel", () => {
  const list = [
    { model_name: "gpt-5-mini", web_search_supported: true },
    { model_name: "gpt-4.1", web_search_supported: true },
    { model_name: "gpt-4.1-nano", web_search_supported: false },
  ];
  it("keeps the configured model when DataForSEO lists it with web search", () => {
    expect(chooseWebSearchModel("gpt-5-mini", list)).toBe("gpt-5-mini");
  });
  it("replaces a configured model that is not listed", () => {
    expect(chooseWebSearchModel("gpt-4o", list)).toBe("gpt-4.1");
  });
  it("never picks a model without web search", () => {
    expect(chooseWebSearchModel("gpt-4.1-nano", list)).toBe("gpt-4.1");
  });
  it("treats an empty setting as unset", () => {
    expect(chooseWebSearchModel("", list)).toBe("gpt-4.1");
  });
  it("falls back to the configured name when no list is available", () => {
    expect(chooseWebSearchModel("gpt-4o", [])).toBe("gpt-4o");
  });
});
