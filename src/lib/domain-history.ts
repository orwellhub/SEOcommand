import type { ResearchRun } from "./research-evidence";
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
