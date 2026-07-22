import { describe, expect, it } from "vitest";
import { nextReportRun } from "./report-schedule";

describe("nextReportRun", () => {
  it("schedules daily reports after the next provider refresh", () => {
    expect(nextReportRun("daily", new Date("2026-07-22T07:00:00Z")).toISOString()).toBe(
      "2026-07-23T06:00:00.000Z",
    );
  });

  it("schedules weekly reports for Monday", () => {
    expect(nextReportRun("weekly", new Date("2026-07-22T07:00:00Z")).toISOString()).toBe(
      "2026-07-27T06:00:00.000Z",
    );
  });

  it("uses today's slot when a weekly report is saved before Monday delivery", () => {
    expect(nextReportRun("weekly", new Date("2026-07-27T05:00:00Z")).toISOString()).toBe(
      "2026-07-27T06:00:00.000Z",
    );
  });

  it("schedules monthly reports for the first", () => {
    expect(nextReportRun("monthly", new Date("2026-07-22T07:00:00Z")).toISOString()).toBe(
      "2026-08-01T06:00:00.000Z",
    );
  });

  it("uses today's slot when a monthly report is saved before first-of-month delivery", () => {
    expect(nextReportRun("monthly", new Date("2026-08-01T05:00:00Z")).toISOString()).toBe(
      "2026-08-01T06:00:00.000Z",
    );
  });
});
