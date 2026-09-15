import type { ManagedSite } from "@/platform/types";
/** Provisioning must not block free Google refreshes; paid setup remains explicit. */
export function scheduledSiteMode(site: Pick<ManagedSite, "lifecycleStatus" | "archivedAt">): "full" | "google" | null {
  if (site.archivedAt) return null;
  if (site.lifecycleStatus === "active") return "full";
  return ["approved", "provisioning", "error"].includes(site.lifecycleStatus) ? "google" : null;
}
