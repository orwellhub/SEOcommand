/**
 * Fixed reference date for the demo build.
 *
 * The whole product is seeded relative to this anchor so the app is fully
 * deterministic. When live providers are connected this is replaced by the
 * real "now" and collected timestamps come from provider sync runs.
 */
export const DEMO_NOW = new Date("2026-07-22T09:00:00.000Z");

export function daysAgo(n: number): Date {
  const d = new Date(DEMO_NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isoDaysAgo(n: number): string {
  return isoDate(daysAgo(n));
}

/** Human "3 days ago" style relative label from an ISO date/time. */
export function relativeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = DEMO_NOW.getTime() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
