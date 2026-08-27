import { describe, expect, it } from "vitest";
import { resolveReportBranding } from "./branding";

describe("client report branding", () => {
  it("uses the website identity when no white-label settings exist", () => {
    expect(resolveReportBranding({ name: "MortgageCompare", host: "mortgagecompare.ae", accent: "#7137F5", siteSettings: {} })).toMatchObject({
      brandName: "MortgageCompare",
      accent: "#7137F5",
      secondaryColor: "#12B8C4",
      showPoweredBy: false,
    });
  });

  it("applies saved client-facing identity without accepting invalid colours", () => {
    const branding = resolveReportBranding({
      name: "Internal name",
      host: "example.com",
      accent: "#335CFF",
      siteSettings: { reportBranding: { brandName: "Client brand", accent: "red", secondaryColor: "#FF6B5E", preparedBy: "Orwell Lab", showPoweredBy: true } },
    });
    expect(branding).toMatchObject({ brandName: "Client brand", accent: "#335CFF", secondaryColor: "#FF6B5E", preparedBy: "Orwell Lab", showPoweredBy: true });
  });
});
