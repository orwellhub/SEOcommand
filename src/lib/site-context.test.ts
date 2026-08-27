import { describe, expect, it } from "vitest";
import { requiresSiteContext, siteIdFromLocation } from "./site-context";

describe("explicit website context", () => {
  it("resolves route and query website identifiers without a fallback", () => {
    expect(siteIdFromLocation("/sites/pettransportglobal/settings", null)).toBe("pettransportglobal");
    expect(siteIdFromLocation("/link-building", "busrentalglobal")).toBe("busrentalglobal");
    expect(siteIdFromLocation("/link-building", null)).toBeNull();
    expect(siteIdFromLocation("/research", null)).toBeNull();
  });

  it("separates global workspaces from website tools", () => {
    expect(requiresSiteContext("/link-building")).toBe(true);
    expect(requiresSiteContext("/monitoring")).toBe(true);
    expect(requiresSiteContext("/reports/client")).toBe(true);
    expect(requiresSiteContext("/sites/pettransportglobal")).toBe(true);
    expect(requiresSiteContext("/research")).toBe(false);
    expect(requiresSiteContext("/keyword-research")).toBe(false);
    expect(requiresSiteContext("/portfolio")).toBe(false);
  });
});
