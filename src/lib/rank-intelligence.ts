import type { RankReportRow, TrackedKeyword } from "./rank-reports";
export const RANK_MODEL = "seo-command-ctr-v1";
// An explicit planning curve, not Semrush's proprietary model or measured click-through rate.
const CTR = [.28, .15, .10, .075, .055, .04, .03, .025, .02, .015];
export function planningCtr(position: number | null): number { return position != null && position >= 1 && position <= 100 ? CTR[Math.floor(position) - 1] ?? .01 * Math.exp(-(position - 11) / 12) : 0; }
export function volumeKey(k: Pick<TrackedKeyword, "keyword" | "locationCode" | "languageCode">) { return `${k.keyword.trim().toLowerCase()}:${k.locationCode}:${k.languageCode.toLowerCase()}`; }
export function rankingIntelligence(rows: RankReportRow[], volumes: Record<string, number | null>, competitors: string[] = []) {
  const dates = [...new Set(rows.flatMap(r => r.history.map(h => h.capturedOn)))].sort();
  const cohort = [...new Set(competitors)];
  return dates.map(date => {
    const observations = rows.map(row => ({ row, point: row.history.find(p => p.capturedOn === date), volume: volumes[volumeKey(row)] }));
    const observed = observations.filter(o => o.point), weighted = observed.filter(o => typeof o.volume === "number" && Number.isFinite(o.volume) && o.volume >= 0);
    const complete = rows.length > 0 && observed.length === rows.length;
    const uniqueDemand = new Set(rows.map(volumeKey)).size === rows.length;
    const weightedComplete = complete && weighted.length === rows.length && uniqueDemand;
    const own = weighted.reduce((sum, o) => sum + o.volume! * planningCtr(o.point!.position), 0);
    const competing = cohort.reduce((total, host) => total + weighted.reduce((sum, o) => sum + o.volume! * planningCtr(o.point!.competitors.find(c => c.host === host)?.position ?? null), 0), 0);
    return { date, tracked: rows.length, observed: observed.length, volumeCoverage: weighted.length, visibility: complete ? observed.reduce((sum, o) => sum + planningCtr(o.point!.position), 0) / rows.length / CTR[0]! * 100 : null, estimatedTraffic: weightedComplete ? own : null, shareOfVoice: weightedComplete && cohort.length && own + competing > 0 ? own / (own + competing) * 100 : null };
  });
}
