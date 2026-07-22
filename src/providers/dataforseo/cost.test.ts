import { describe, it, expect } from "vitest";
import { InMemorySpendStore, SpendGuard, currentMonth } from "./cost";
import { BudgetExceededError, classifyStatus, DailyLimitError } from "./errors";

const FIXED = new Date("2026-07-22T09:00:00.000Z");
const clock = () => FIXED;

describe("SpendGuard — app-owned monthly $200 guardrail", () => {
  it("records actual cost and reports month-to-date status", async () => {
    const guard = new SpendGuard(new InMemorySpendStore(), 200, "dataforseo", clock);
    await guard.run({ endpoint: "serpOrganicLive", estimateUsd: 0.003 }, async () => ({
      result: "ok",
      costUsd: 0.05,
    }));
    const status = await guard.status();
    expect(status.spentUsd).toBeCloseTo(0.05, 5);
    expect(status.remainingUsd).toBeCloseTo(199.95, 2);
    expect(status.limitUsd).toBe(200);
  });

  it("blocks a call BEFORE it runs when the estimate would breach the ceiling", async () => {
    const store = new InMemorySpendStore();
    await store.record({ provider: "dataforseo", month: currentMonth(FIXED), endpoint: "x", costUsd: 199.9, requests: 1 });
    const guard = new SpendGuard(store, 200, "dataforseo", clock);

    let ran = false;
    await expect(
      guard.run({ endpoint: "labsRankedKeywords", estimateUsd: 0.5 }, async () => {
        ran = true;
        return { result: null, costUsd: 0.5 };
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(ran).toBe(false); // never executed — blocked pre-flight
  });

  it("pauses non-critical work once fully spent but lets critical proceed", async () => {
    const store = new InMemorySpendStore();
    await store.record({ provider: "dataforseo", month: currentMonth(FIXED), endpoint: "x", costUsd: 200, requests: 1 });
    const guard = new SpendGuard(store, 200, "dataforseo", clock);

    await expect(
      guard.run({ endpoint: "e", estimateUsd: 0, critical: false }, async () => ({ result: 1, costUsd: 0 })),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    const ok = await guard.run({ endpoint: "e", estimateUsd: 0, critical: true }, async () => ({ result: 1, costUsd: 0 }));
    expect(ok.result).toBe(1);
  });

  it("surfaces crossed alert thresholds as spend accumulates", async () => {
    const guard = new SpendGuard(new InMemorySpendStore(), 200, "dataforseo", clock);
    await guard.run({ endpoint: "e", estimateUsd: 0, critical: true }, async () => ({ result: 0, costUsd: 150 }));
    const status = await guard.status();
    expect(status.crossed).toEqual([50, 75]);
    expect(status.pctUsed).toBe(75);
  });
});

describe("DataForSEO status classification", () => {
  it("maps 20000 ok, 40203 daily limit, others error", () => {
    expect(classifyStatus(20000)).toBe("ok");
    expect(classifyStatus(40203)).toBe("daily_limit");
    expect(classifyStatus(40101)).toBe("error");
  });

  it("DailyLimitError carries the 40203 code", () => {
    const e = new DailyLimitError("/v3/serp/...");
    expect(e.statusCode).toBe(40203);
  });
});
