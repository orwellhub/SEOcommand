import { urlKey, type CommandRecord, type PageSummary } from "./command-model";

export type PageCoverageSummary = {
  known: number | null;
  crawled: number | null;
  lastGoogleCrawl: string | null;
  indexed: number | null;
  inspected: number;
  unknownVerdicts: number;
  inspectedAt: string | null;
};

/** A queued or failed recheck must not erase the last completed inspection. */
export function latestIndexInspections(records: CommandRecord[], host: string) {
  const latest = new Map<string, CommandRecord>();
  const time = (row: CommandRecord) => Date.parse(String(row.payload.inspectedAt ?? row.updatedAt)) || 0;
  for (const row of records) {
    if (row.kind !== "indexing" || row.status !== "completed" || typeof row.payload.url !== "string") continue;
    const key = urlKey(row.payload.url, host);
    if (key && (!latest.has(key) || time(row) > time(latest.get(key)!))) latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => time(b) - time(a));
}

/** Current attempt per page and check configuration; older failures remain saved history. */
export function latestCheckAttempts(records: CommandRecord[], host: string) {
  const latest = new Map<string, CommandRecord>();
  for (const row of [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt))) {
    if (typeof row.payload.url !== "string") continue;
    const target = urlKey(row.payload.url, host);
    if (!target) continue;
    const key = JSON.stringify([row.kind, target, row.payload.device ?? "", row.kind === "speed" ? row.payload.provider ?? "google" : ""]);
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()];
}

export function summarizePageCoverage(input: {
  host: string;
  pages: Pick<PageSummary, "url">[];
  inspections: CommandRecord[];
}): PageCoverageSummary {
  const inspections = latestIndexInspections(input.inspections, input.host);
  const known = new Set([...input.pages.map((page) => page.url), ...inspections.map((row) => String(row.payload.url))]
    .map((url) => urlKey(url, input.host)).filter((key): key is string => key !== null));
  const classified = inspections.filter((row) => ["PASS", "FAIL", "NEUTRAL"].includes(String(row.payload.verdict)));
  const crawled = inspections.filter((row) => typeof row.payload.lastCrawl === "string" && Number.isFinite(Date.parse(row.payload.lastCrawl)));
  return {
    known: known.size || null,
    crawled: inspections.length ? crawled.length : null,
    lastGoogleCrawl: crawled.length ? String(crawled.sort((a, b) => Date.parse(String(b.payload.lastCrawl)) - Date.parse(String(a.payload.lastCrawl)))[0]!.payload.lastCrawl) : null,
    // Indexing directives and search impressions do not prove index status.
    indexed: classified.length ? classified.filter((row) => row.payload.verdict === "PASS").length : null,
    inspected: inspections.length,
    unknownVerdicts: inspections.length - classified.length,
    inspectedAt: inspections.length ? String(inspections[0]!.payload.inspectedAt ?? inspections[0]!.updatedAt) : null,
  };
}
