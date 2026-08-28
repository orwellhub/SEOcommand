import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scheduledTiers, shouldReusePaidSnapshots } from "./engine";

describe("scheduledTiers — split-cadence policy", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.SYNC_GOOGLE;
    delete process.env.SYNC_RANKINGS;
    delete process.env.SYNC_DFS_LIGHT;
    delete process.env.SYNC_DFS_HEAVY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("runs Google and approved daily rankings on an ordinary weekday", () => {
    // 2026-07-21 is a Tuesday, not the 1st.
    const t = scheduledTiers(new Date("2026-07-21T06:00:00Z"));
    expect(t).toEqual({ google: true, rankings: true, dfsLight: false, dfsHeavy: false, ai: true, dedupePaid: true, dfsLightModules: null });
  });

  it("adds DataForSEO light on Mondays (weekly)", () => {
    // 2026-07-20 is a Monday.
    const t = scheduledTiers(new Date("2026-07-20T06:00:00Z"));
    expect(t).toEqual({ google: true, rankings: true, dfsLight: true, dfsHeavy: false, ai: true, dedupePaid: true, dfsLightModules: null });
  });

  it("adds crawls + AI (and light) on the 1st of the month (monthly)", () => {
    // 2026-08-01 is a Saturday and the 1st.
    const t = scheduledTiers(new Date("2026-08-01T06:00:00Z"));
    expect(t).toEqual({ google: true, rankings: true, dfsLight: true, dfsHeavy: true, ai: true, dedupePaid: true, dfsLightModules: null });
  });

  it("honours env overrides for a single run", () => {
    process.env.SYNC_DFS_HEAVY = "1";
    const t = scheduledTiers(new Date("2026-07-21T06:00:00Z"));
    expect(t.dfsHeavy).toBe(true);
    expect(t.dfsLight).toBe(true); // heavy implies light
  });

  it("SYNC_GOOGLE=0 disables the free daily Google pull", () => {
    process.env.SYNC_GOOGLE = "0";
    const t = scheduledTiers(new Date("2026-07-21T06:00:00Z"));
    expect(t.google).toBe(false);
  });

  it("SYNC_RANKINGS=0 disables daily paid rank checks", () => {
    process.env.SYNC_RANKINGS = "0";
    const t = scheduledTiers(new Date("2026-07-21T06:00:00Z"));
    expect(t.rankings).toBe(false);
  });

  it("reuses complete same-day paid snapshots only for scheduler retries", () => {
    const captured = new Map([
      ["competitors", "2026-08-28"],
      ["keyword_gaps", "2026-08-28"],
      ["backlinks", "2026-08-27"],
    ]);
    expect(shouldReusePaidSnapshots(true, "2026-08-28", captured, ["competitors", "keyword_gaps"])).toBe(true);
    expect(shouldReusePaidSnapshots(true, "2026-08-28", captured, ["backlinks"])).toBe(false);
    expect(shouldReusePaidSnapshots(false, "2026-08-28", captured, ["competitors", "keyword_gaps"])).toBe(false);
  });
});
