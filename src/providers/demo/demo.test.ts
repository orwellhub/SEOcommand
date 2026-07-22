import { describe, it, expect } from "vitest";
import { demoProvider } from "./index";
import { getSeoProvider, IS_DEMO_MODE } from "@/providers";
import { DOMAINS } from "@/data/domains";

describe("demo provider — contract normalisation & provenance", () => {
  it("returns canonical keyword models wrapped in demo provenance", async () => {
    const { data, provenance } = await demoProvider.keywords("mortgagecompare");
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    // canonical shape, not a vendor payload
    expect(data[0]).toHaveProperty("keyword");
    expect(data[0]).toHaveProperty("difficulty");
    // provenance travels with the data and is truthfully labelled demo
    expect(provenance.mode).toBe("demo");
    expect(provenance.source).toBe("demo");
    expect(provenance.location).toBeTruthy();
  });

  it("labels every provider method as demo (provenance mode)", async () => {
    const id = "busrentalglobal" as const;
    const envelopes = await Promise.all([
      demoProvider.rankSnapshots(id),
      demoProvider.backlinks(id),
      demoProvider.issues(id),
      demoProvider.prompts(id),
      demoProvider.competitors(id),
    ]);
    for (const e of envelopes) expect(e.provenance.mode).toBe("demo");
  });

  it("the factory returns the demo provider when no live credentials are present", () => {
    const provider = getSeoProvider();
    expect(provider.live).toBe(false);
    expect(IS_DEMO_MODE).toBe(true);
  });

  it("serves data for every domain in the registry (domain switching)", async () => {
    for (const d of DOMAINS) {
      const { data } = await demoProvider.keywords(d.id);
      expect(data.every((k) => k.domainId === d.id)).toBe(true);
    }
  });
});
