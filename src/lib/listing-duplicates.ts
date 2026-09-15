type ListingIdentity = { id: string; locationId: string; directory: string; url: string | null; status: string };

/** Flag evidence to review; never declare or delete a duplicate automatically. */
export function listingDuplicateCandidates(rows: ListingIdentity[]) {
  const candidates = new Map<string, string>();
  const directoryKey = (row: ListingIdentity) => `${row.locationId}:${row.directory.trim().toLocaleLowerCase()}`;
  const urlKey = (row: ListingIdentity) => {
    try { const url = new URL(row.url ?? ""); url.hash = ""; return url.toString().replace(/\/$/, ""); }
    catch { return null; }
  };
  for (const row of rows) {
    if (row.status === "missing") continue;
    const sameUrl = urlKey(row);
    if (sameUrl && rows.some(other => other.id !== row.id && other.status !== "missing" && urlKey(other) === sameUrl)) {
      candidates.set(row.id, "This listing URL appears more than once in the inventory.");
    } else if (sameUrl && rows.some(other => other.id !== row.id && other.status !== "missing" && directoryKey(other) === directoryKey(row) && urlKey(other))) {
      candidates.set(row.id, "Multiple listing URLs are saved for this location and directory. Check whether they represent the same business.");
    }
  }
  return candidates;
}
