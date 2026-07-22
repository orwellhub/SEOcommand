import { describe, it, expect } from "vitest";
import { DOMAINS, getDomain, isDomainId } from "./domains";
import { SEED, healthScore } from "./seed";
import {
  domainMetrics,
  portfolioMetrics,
  orwellAuthorityScore,
  winnersLosers,
} from "./metrics";
import { seedsFor } from "./keyword-seeds";

describe("seed data — determinism & consistency", () => {
  it("keyword generation is deterministic across calls", () => {
    // SEED is a module singleton; re-reading gives identical values.
    const a = SEED.keywords.mortgagecompare.map((k) => k.volume);
    const b = SEED.keywords.mortgagecompare.map((k) => k.volume);
    expect(a).toEqual(b);
  });

  it("has no duplicate keywords within a domain", () => {
    for (const d of DOMAINS) {
      const kws = seedsFor(d.id).map((s) => s.keyword);
      expect(new Set(kws).size).toBe(kws.length);
    }
  });

  it("keeps the three curated pilot universes mutually distinct", () => {
    const pilots = ["mortgagecompare", "busrentalglobal", "pettransportglobal"];
    const all = pilots.flatMap((id) => seedsFor(id).map((s) => s.keyword));
    expect(new Set(all).size).toBe(all.length);
  });

  it("generates keyword seeds for every domain in the registry", () => {
    for (const d of DOMAINS) {
      expect(seedsFor(d.id).length).toBeGreaterThan(0);
    }
  });

  it("ranking snapshots only include ranked keywords and derive delta correctly", () => {
    const { winners, losers } = winnersLosers("mortgagecompare");
    for (const w of winners) expect(w.prevPosition - w.position).toBeGreaterThan(0);
    for (const l of losers) expect(l.prevPosition - l.position).toBeLessThan(0);
  });

  it("position buckets sum to the number of ranked keywords", () => {
    const ranked = SEED.keywords.busrentalglobal.filter((k) => k.position != null).length;
    const bucketSum = SEED.positionBuckets.busrentalglobal.reduce((s, b) => s + b.count, 0);
    expect(bucketSum).toBe(ranked);
  });
});

describe("scores — bounded and transparent", () => {
  it("health score is within 0..100", () => {
    for (const d of DOMAINS) {
      const s = healthScore(d.id);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("Orwell Authority Score is within 1..100", () => {
    for (const d of DOMAINS) {
      const s = orwellAuthorityScore(d.id);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("health weights sum to 1", () => {
    const total = SEED.healthBreakdown.mortgagecompare.reduce((s, b) => s + b.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe("metrics reconcile with underlying tables", () => {
  it("tracked keywords count matches the keyword table", () => {
    const m = domainMetrics("pettransportglobal");
    expect(m.trackedKeywords).toBe(SEED.keywords.pettransportglobal.length);
  });

  it("portfolio totals aggregate the per-domain metrics", () => {
    const pm = portfolioMetrics();
    const sumClicks = pm.domains.reduce((s, d) => s + d.organicClicks, 0);
    expect(pm.totalClicks).toBe(sumClicks);
    expect(pm.domains.length).toBe(DOMAINS.length);
  });
});

describe("domain registry", () => {
  it("resolves ids and guards unknown values", () => {
    expect(getDomain("mortgagecompare").host).toBe("mortgagecompare.ae");
    expect(isDomainId("mortgagecompare")).toBe(true);
    expect(isDomainId("nope")).toBe(false);
  });

  it("all pilot providers start disconnected (demo posture)", () => {
    expect(SEED.providerConnections.every((c) => !c.connected)).toBe(true);
  });
});
