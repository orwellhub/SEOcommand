import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isoDate } from "@/lib/dates";
import { getDataForSeoClient } from "@/providers/dataforseo";
import { ENDPOINTS } from "@/providers/dataforseo/config";
import { getManagedSite } from "./site-store";
import { createNotification } from "./notifications";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function items(result: Row[]): Row[] {
  return result.flatMap((row) => records(row.items));
}

export function buildLocalGridPoints(latitude: number, longitude: number, radiusKm: number, size: number) {
  const safeSize = Math.min(Math.max(size, 3), 5);
  const half = (safeSize - 1) / 2;
  const latitudeStep = radiusKm / Math.max(half, 1) / 111;
  const longitudeStep = radiusKm / Math.max(half, 1) / (111 * Math.max(Math.cos(latitude * Math.PI / 180), 0.2));
  const points: Array<{ latitude: number; longitude: number }> = [];
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      points.push({
        latitude: Math.round((latitude + y * latitudeStep) * 1e6) / 1e6,
        longitude: Math.round((longitude + x * longitudeStep) * 1e6) / 1e6,
      });
    }
  }
  return points;
}

function matchesBusiness(item: Row, location: typeof schema.localSeoLocations.$inferSelect, host: string): boolean {
  const domain = (text(item.domain) ?? text(item.url) ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const title = (text(item.title) ?? "").toLowerCase();
  return Boolean(
    (location.placeId && text(item.place_id) === location.placeId) ||
    (location.cid && text(item.cid) === location.cid) ||
    domain === host.replace(/^www\./, "") ||
    title === location.name.toLowerCase(),
  );
}

export async function syncLocalLocation(locationId: string) {
  const [location] = await db().select().from(schema.localSeoLocations).where(eq(schema.localSeoLocations.id, locationId)).limit(1);
  if (!location) throw new Error("Local SEO location not found.");
  if (!location.active || location.approval !== "approved") throw new Error("Approve the Local SEO cost forecast before running paid checks.");
  const site = await getManagedSite(location.siteSlug);
  if (!site) throw new Error("Website not found.");
  const client = getDataForSeoClient();
  const identity = location.placeId ? `place_id:${location.placeId}` : location.cid ? `cid:${location.cid}` : location.businessKeyword;
  const { result: profileResult } = await client.post<Row>(
    "businessGoogleMyBusinessInfoLive",
    ENDPOINTS.businessGoogleMyBusinessInfoLive,
    [{ keyword: identity, location_code: site.dataForSeoLocationCode, language_code: site.dataForSeoLanguageCode }],
    { domainSlug: site.id },
  );
  const profile = items(profileResult)[0] ?? null;
  const rating = record(profile?.rating);
  const completenessFields = profile ? [profile.title, profile.description, profile.category, profile.address, profile.phone, profile.url, profile.work_time, profile.main_image, profile.is_claimed, profile.attributes] : [];
  const completeness = Math.round((completenessFields.filter((value) => value != null && value !== "").length / 10) * 100);
  const today = isoDate(new Date());
  const [prior] = await db().select().from(schema.localSeoSnapshots)
    .where(eq(schema.localSeoSnapshots.locationId, location.id))
    .orderBy(desc(schema.localSeoSnapshots.capturedOn)).limit(1);
  await db().insert(schema.localSeoSnapshots).values({
    locationId: location.id,
    siteSlug: site.id,
    capturedOn: today,
    rating: number(rating.value),
    reviewCount: number(rating.votes_count),
    profileCompleteness: completeness,
    matched: Boolean(profile),
    profile: profile ?? {},
  }).onConflictDoUpdate({
    target: [schema.localSeoSnapshots.locationId, schema.localSeoSnapshots.capturedOn],
    set: { rating: sql`excluded.rating`, reviewCount: sql`excluded.review_count`, profileCompleteness: sql`excluded.profile_completeness`, matched: sql`excluded.matched`, profile: sql`excluded.profile` },
  });

  if (prior?.reviewCount != null && number(rating.votes_count) != null && number(rating.votes_count)! > prior.reviewCount) {
    const gained = number(rating.votes_count)! - prior.reviewCount;
    await createNotification({
      siteSlug: site.id,
      eventType: "new_local_review",
      severity: "low",
      title: `${location.name} gained ${gained} Google review${gained === 1 ? "" : "s"}`,
      detail: `Rating is now ${number(rating.value)?.toFixed(1) ?? "unavailable"}. Review responses remain approval-gated.`,
      actionUrl: "/local-seo",
      fingerprint: `local-reviews:${location.id}:${today}`,
    });
  }
  if (prior?.rating != null && number(rating.value) != null && number(rating.value)! < prior.rating) {
    await createNotification({
      siteSlug: site.id,
      eventType: "local_rating_drop",
      severity: "medium",
      title: `${location.name} Google rating declined`,
      detail: `Rating moved from ${prior.rating.toFixed(1)} to ${number(rating.value)!.toFixed(1)}.`,
      actionUrl: "/local-seo",
      fingerprint: `local-rating:${location.id}:${today}`,
    });
  }

  const latitude = location.latitude ?? number(profile?.latitude);
  const longitude = location.longitude ?? number(profile?.longitude);
  const keywords = location.keywords.filter(Boolean).slice(0, 5);
  const savedPoints: Array<typeof schema.localRankGridPoints.$inferInsert> = [];
  if (latitude != null && longitude != null && keywords.length) {
    for (const keyword of keywords) {
      for (const point of buildLocalGridPoints(latitude, longitude, location.gridRadiusKm, location.gridSize)) {
        const { result } = await client.post<Row>(
          "serpGoogleMapsLiveAdvanced",
          ENDPOINTS.serpGoogleMapsLiveAdvanced,
          [{
            keyword,
            location_coordinate: `${point.latitude},${point.longitude},15z`,
            language_code: site.dataForSeoLanguageCode,
            device: "mobile",
            depth: 20,
            search_this_area: true,
            search_places: false,
          }],
          { domainSlug: site.id },
        );
        const mapItems = items(result);
        const match = mapItems.find((item) => matchesBusiness(item, location, site.host));
        savedPoints.push({
          locationId: location.id,
          siteSlug: site.id,
          keyword,
          capturedOn: today,
          latitude: point.latitude,
          longitude: point.longitude,
          position: match ? number(match.rank_group) : null,
          resultName: match ? text(match.title) : null,
          matched: Boolean(match),
        });
      }
    }
  }
  for (let index = 0; index < savedPoints.length; index += 200) {
    await db().insert(schema.localRankGridPoints).values(savedPoints.slice(index, index + 200)).onConflictDoUpdate({
      target: [schema.localRankGridPoints.locationId, schema.localRankGridPoints.keyword, schema.localRankGridPoints.capturedOn, schema.localRankGridPoints.latitude, schema.localRankGridPoints.longitude],
      set: { position: sql`excluded.position`, resultName: sql`excluded.result_name`, matched: sql`excluded.matched` },
    });
  }
  return { profile: profile ?? null, rating: number(rating.value), reviewCount: number(rating.votes_count), profileCompleteness: completeness, gridPoints: savedPoints.length };
}

export async function localSeoDashboard(siteSlugs: string[]) {
  if (!siteSlugs.length) return { locations: [], snapshots: [], grid: [] };
  const locations = await db().select().from(schema.localSeoLocations).where(inArray(schema.localSeoLocations.siteSlug, siteSlugs)).orderBy(schema.localSeoLocations.name);
  if (!locations.length) return { locations, snapshots: [], grid: [] };
  const ids = locations.map((location) => location.id);
  const [snapshots, grid] = await Promise.all([
    db().select().from(schema.localSeoSnapshots).where(inArray(schema.localSeoSnapshots.locationId, ids)).orderBy(desc(schema.localSeoSnapshots.capturedOn)).limit(500),
    db().select().from(schema.localRankGridPoints).where(inArray(schema.localRankGridPoints.locationId, ids)).orderBy(desc(schema.localRankGridPoints.capturedOn)).limit(2_000),
  ]);
  return { locations, snapshots, grid };
}

export async function listDueLocalLocations(now = new Date()) {
  const locations = await db().select().from(schema.localSeoLocations).where(eq(schema.localSeoLocations.active, true));
  const due: typeof locations = [];
  for (const location of locations) {
    const [latest] = await db().select({ capturedOn: schema.localSeoSnapshots.capturedOn }).from(schema.localSeoSnapshots)
      .where(eq(schema.localSeoSnapshots.locationId, location.id)).orderBy(desc(schema.localSeoSnapshots.capturedOn)).limit(1);
    if (!latest || now.getTime() - new Date(latest.capturedOn).getTime() >= 6 * 24 * 60 * 60 * 1_000) due.push(location);
  }
  return due;
}
