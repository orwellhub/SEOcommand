export type ReportCadence = "daily" | "weekly" | "monthly";

/** Next 06:00 UTC delivery slot; the cron hands it off after that run's sync. */
export function nextReportRun(cadence: ReportCadence, now = new Date()): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(0);
  next.setUTCHours(6);

  if (cadence === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (cadence === "weekly") {
    let daysToMonday = (1 - next.getUTCDay() + 7) % 7;
    if (daysToMonday === 0 && next <= now) daysToMonday = 7;
    next.setUTCDate(next.getUTCDate() + daysToMonday);
    return next;
  }

  next.setUTCDate(1);
  if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return next;
}
