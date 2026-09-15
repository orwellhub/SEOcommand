import type { Provenance } from "./types";
import { shiftDate, type Ga4Dashboard } from "./dashboard-data";

/** Compatibility at the read boundary. Original stored records are never rewritten. */
export function normalizeSavedSnapshot<T extends { dataset: string; payload: unknown; provenance: Provenance }>(snapshot: T): T {
  let payload = snapshot.payload;
  let provenance = snapshot.provenance;
  const day = provenance?.collectedAt?.slice(0, 10);
  const span = (Date.parse(provenance?.rangeEnd) - Date.parse(provenance?.rangeStart)) / 86_400_000;
  if (provenance?.source === "google-search-console" && !provenance.normalizationVersion && day === provenance.rangeEnd && [28, 90].includes(span)) {
    provenance = { ...provenance, rangeStart: shiftDate(provenance.rangeStart, -1), rangeEnd: shiftDate(provenance.rangeEnd, -2), periodNote: "Request dates corrected from the historical collector; final data may end earlier." };
  }
  // The historical dashboard collector requested all daily rows (180 dates,
  // limit 180) and only saved after every report succeeded. Missing date rows
  // mean no recorded metrics, not a failed collection. Keep quality caveats.
  if (snapshot.dataset === "ga4_dashboard" && provenance?.source === "google-analytics" && payload && typeof payload === "object") {
    const data = payload as Ga4Dashboard;
    if (data.completeDateRange === undefined && Array.isArray(data.series) && (Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000 === 179 && data.series.length <= 180) {
      payload = { ...data, completeDateRange: true, qualityNote: "Older saved report: the latest day may be incomplete for some property time zones. Comparisons and tracking coverage are unverified." };
    }
  }
  if (snapshot.dataset === "onpage" && payload && typeof payload === "object" && !Array.isArray(payload)) {
    const audit=payload as {methodologyVersion?:number;issues?:{id?:string;title?:string}[]};
    // This provider field counts successful URL checks. Retain stored records,
    // but remove the known incorrectly labelled issue at the read boundary.
    if ((audit.methodologyVersion??0)<3 && Array.isArray(audit.issues)) payload={...audit,issues:audit.issues.filter(row=>!row.id?.includes("seo_friendly_url_characters_check")&&row.title!=="Non SEO-friendly URL characters")};
  }
  if (Array.isArray(payload)) {
    if (snapshot.dataset === "referring_domains") payload = payload.filter((row) => typeof row?.host === "string" && row.host.trim());
    else if (snapshot.dataset === "backlinks") payload = payload.filter((row) => row?.sourceUrl && row?.targetUrl);
    else if (snapshot.dataset === "keywords") payload = payload.filter((row) => row?.keyword?.trim()).map((row) => !provenance?.normalizationVersion && row.prevPosition === row.position ? { ...row, prevPosition: null } : row);
    else if (snapshot.dataset === "rank_snapshots") payload = payload.map((row) => !provenance?.normalizationVersion && row.prevPosition === row.position ? { ...row, prevPosition: null } : row);
    else if (snapshot.dataset === "position_buckets" && !provenance?.normalizationVersion) payload = payload.map((row) => ({ ...row, prevCount: null }));
    else if (snapshot.dataset === "competitors") payload = payload.filter((row) => row?.host?.trim());
  }
  return { ...snapshot, payload, provenance };
}
