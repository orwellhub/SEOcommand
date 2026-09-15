import type { EvidenceTable, ResearchRun } from "./research-evidence";
import { normalizedHost } from "./recommendation-quality";

/** Historical traffic is the same evidence whether collected alone or with a traffic report. */
export function matchingDomainHistory(runs: ResearchRun[], site: string, target: string, market: number, language: string) {
  const host = normalizedHost(target);
  return [...runs].filter(run => run.siteSlug === site && run.status === "completed"
    && ["history", "traffic"].includes(run.feature)
    && run.payload.market.locationCode === market && run.payload.market.languageCode === language
    && run.payload.input.domains.some(domain => normalizedHost(domain) === host)
    && run.payload.report?.tables.some(table => table.title === `${host}: monthly history` && table.rows.length > 0))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** Saved table IDs are row keys, not dates; collection can renumber them. */
export function domainHistoryPoints(table: EvidenceTable | undefined) {
  return (table?.rows ?? []).flatMap(row => {
    const period = /^\d{4}-\d{2}$/.test(row.label) ? `${row.label}-01` : /^\d{4}-\d{2}-\d{2}$/.test(row.id) ? row.id : null;
    if (!period) return [];
    return [{ date: period, traffic: row.values["Estimated traffic"], keywords: row.values["Ranking keywords"], top3: row.values["Top 3"], top10: row.values["Top 10"] }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
