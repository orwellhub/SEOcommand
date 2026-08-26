import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { forecastSiteCost } from "@/platform/cost-forecast";
import { listManagedSites, listPortfolioGroups, listSiteConnections } from "@/platform/site-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ConnectionSchema = z.object({
  kind: z.enum(["github", "hostinger_git", "webhook"]),
  displayName: z.string().min(1).max(120),
  remoteUrl: z.string().url().optional().or(z.literal("")),
  config: z.record(z.unknown()).optional(),
});

const SiteSchema = z.object({
  name: z.string().min(2).max(120),
  host: z.string().min(3).max(253),
  industry: z.string().min(2).max(240),
  market: z.string().min(2).max(120),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2).max(12).default("en"),
  devices: z.array(z.enum(["desktop", "mobile"])).min(1),
  gscProperty: z.string().max(500).nullable().optional(),
  ga4Property: z.string().max(100).nullable().optional(),
  trackedKeywords: z.number().int().min(1).max(5000).default(100),
  crawlMaxPages: z.number().int().min(100).max(100000).default(10000),
  backlinkLimit: z.number().int().min(1000).max(100000).default(10000),
  aiPrompts: z.number().int().min(0).max(100).default(10),
  aiPlatforms: z.array(z.enum([
    "chatgpt",
    "claude",
    "gemini",
    "perplexity",
    "google_ai_overview",
    "google_ai_mode",
    "copilot",
  ])).min(1),
  connections: z.array(ConnectionSchema).default([]),
  alertChannels: z.array(z.enum(["in_app", "whatsapp", "email"])).min(1),
  groupIds: z.array(z.string().uuid()).max(20).optional().default([]),
  emailRecipients: z.array(z.string().email()).optional().default([]),
  whatsappRecipients: z.array(z.string().min(6).max(30)).optional().default([]),
});

function cleanHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function slugFor(host: string): string {
  return host
    .replace(/\.[a-z]{2,}$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function unavailable() {
  return NextResponse.json({ error: "Site onboarding requires DATABASE_URL." }, { status: 503 });
}

export async function GET() {
  const sites = await listManagedSites();
  const [connections, groups] = await Promise.all([
    listSiteConnections(sites.map((site) => site.id)),
    listPortfolioGroups(),
  ]);
  return NextResponse.json({
    sites,
    connections,
    groups,
    capacity: { designedFor: "300+", current: sites.length },
  });
}

export async function POST(request: Request) {
  if (!hasDatabase()) return unavailable();
  if (!canWrite(request.headers.get("x-orwell-user-role"))) {
    return NextResponse.json({ error: "Write access required." }, { status: 403 });
  }
  const parsed = SiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Review the site setup fields.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const host = cleanHost(input.host);
  if (!host.includes(".")) {
    return NextResponse.json({ error: "Enter a valid website host." }, { status: 400 });
  }
  const candidateSlug = slugFor(host);
  const [existing] = await db()
    .select({ slug: schema.siteProfiles.slug })
    .from(schema.siteProfiles)
    .where(eq(schema.siteProfiles.host, host))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "That website is already in the portfolio." }, { status: 409 });
  }
  const [slugTaken] = await db()
    .select({ slug: schema.siteProfiles.slug })
    .from(schema.siteProfiles)
    .where(eq(schema.siteProfiles.slug, candidateSlug))
    .limit(1);
  const slug = slugTaken
    ? `${candidateSlug}-${createHash("sha256").update(host).digest("hex").slice(0, 6)}`
    : candidateSlug;

  const forecast = forecastSiteCost({
    trackedKeywords: input.trackedKeywords,
    crawlMaxPages: input.crawlMaxPages,
    backlinkLimit: input.backlinkLimit,
    aiPrompts: input.aiPrompts,
    aiPlatforms: input.aiPlatforms.length,
    devices: input.devices,
  });

  const result = await db().transaction(async (tx) => {
    const [site] = await tx
      .insert(schema.siteProfiles)
      .values({
        slug,
        name: input.name.trim(),
        host,
        industry: input.industry.trim(),
        primaryMarket: input.market,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        devices: input.devices,
        gscProperty: input.gscProperty || null,
        ga4Property: input.ga4Property || null,
        lifecycleStatus: "forecast_pending",
        spendApproval: "pending",
        forecastMonthlyUsd: forecast.monthlyUsd,
        forecastDetails: forecast as unknown as Record<string, unknown>,
        crawlMaxPages: input.crawlMaxPages,
        backlinkLimit: input.backlinkLimit,
        createdBy: request.headers.get("x-orwell-user-email"),
        onboardingProgress: {
          googleDiscovered: Boolean(input.gscProperty || input.ga4Property),
          marketSelected: true,
          devicesSelected: true,
          connectionsAdded: input.connections.length,
          costForecasted: true,
          initialScan: "awaiting_approval",
        },
      })
      .returning();
    if (!site) throw new Error("Site could not be created.");

    if (input.connections.length) {
      await tx.insert(schema.siteConnections).values(
        input.connections.map((connection) => ({
          siteSlug: slug,
          kind: connection.kind,
          displayName: connection.displayName,
          remoteUrl: connection.remoteUrl || null,
          config: { ...(connection.config ?? {}), publishMode: "review_only" },
          status: "pending",
        })),
      );
    }

    if (input.groupIds.length) {
      await tx.insert(schema.siteGroupMemberships).values(
        input.groupIds.map((groupId) => ({ groupId, siteSlug: slug })),
      );
    }

    const promptPatterns = [
      `What are the best ${input.industry} providers in ${input.market}?`,
      `Which companies should I compare for ${input.industry}?`,
      `How do I choose a trustworthy ${input.industry} provider?`,
      `How much does ${input.industry} typically cost in ${input.market}?`,
      `What are the alternatives to ${input.name}?`,
      `Is ${input.name} a good choice for ${input.industry}?`,
      `Which ${input.industry} provider has the best reviews?`,
      `What questions should I ask a ${input.industry} provider?`,
      `What mistakes should I avoid when buying ${input.industry}?`,
      `Recommend a ${input.industry} provider for someone in ${input.market}.`,
    ];
    const prompts = Array.from({ length: input.aiPrompts }, (_, index) => ({
      siteSlug: slug,
      prompt: index < promptPatterns.length
        ? promptPatterns[index]!
        : `Question ${index + 1}: what should a buyer know about ${input.industry} before considering ${input.name}?`,
      topic: ["Discovery", "Comparison", "Trust", "Pricing", "Alternatives", "Brand", "Reviews", "Buying guide", "Risks", "Recommendation"][index] ?? `Tracked question ${index + 1}`,
      platforms: input.aiPlatforms,
      cadence: index < 2 ? "daily" : index < 8 ? "weekly" : "monthly",
      priority: index < 2 ? 90 : index < 8 ? 60 : 40,
      sampleCount: index < 2 ? 2 : 1,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      source: "onboarding",
    }));
    if (prompts.length) await tx.insert(schema.aiTrackingPrompts).values(prompts);

    const recipients = [
      ...input.emailRecipients.map((value) => `email:${value}`),
      ...input.whatsappRecipients.map((value) => `whatsapp:${value}`),
    ];
    await tx.insert(schema.notificationRules).values({
      siteSlug: slug,
      eventTypes: [
        "rank_drop", "technical_issue", "technical_regression", "traffic_drop",
        "new_backlink", "lost_backlink", "site_unavailable", "site_recovered",
        "tls_risk", "domain_expiry", "robots_changed", "sitemap_changed",
        "new_local_review", "local_rating_drop",
      ],
      channels: input.alertChannels,
      recipients,
    });
    return site;
  });

  return NextResponse.json({
    site: result,
    forecast,
    approvalRequired: true,
    next: `/sites/${slug}/approve`,
  }, { status: 201 });
}
