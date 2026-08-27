import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canApproveBudget, canWrite } from "@/lib/auth";
import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { currentMonth } from "@/providers/dataforseo/cost";
import { setSiteGroups } from "@/platform/site-store";
import { getManagedSite } from "@/platform/site-store";
import { canAccessSite } from "@/platform/access";
import { qaSettings } from "@/data/qa-fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["rankings", "crawling", "backlinks", "competitors", "ai", "local_seo"] as const;
const ConnectionSchema = z.object({
  kind: z.enum(["github", "hostinger_git", "webhook"]),
  displayName: z.string().min(1).max(120),
  remoteUrl: z.string().url().nullable().optional(),
  status: z.enum(["pending", "connected", "error", "disabled"]).default("pending"),
  config: z.record(z.unknown()).default({}),
});
const PatchSchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("general"),
    name: z.string().min(2).max(120),
    host: z.string().min(3).max(253),
    industry: z.string().max(240),
    primaryMarket: z.string().min(2).max(120),
    locationCode: z.number().int().positive(),
    languageCode: z.string().min(2).max(12),
    devices: z.array(z.enum(["desktop", "mobile"])).min(1),
    lifecycleStatus: z.enum(["active", "pre_launch", "paused", "archived"]),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  z.object({
    section: z.literal("groups"),
    groupIds: z.array(z.string().uuid()).max(50),
  }),
  z.object({
    section: z.literal("budget"),
    approvedMonthlyUsd: z.number().min(0).max(100000).nullable(),
    budgetLimits: z.record(z.enum(CATEGORIES), z.number().min(0).max(100000).nullable()),
    spendApproval: z.enum(["pending", "approved", "rejected"]),
  }),
  z.object({
    section: z.literal("monitoring"),
    monitoringSchedule: z.record(z.unknown()),
    siteSettings: z.record(z.unknown()),
    crawlMaxPages: z.number().int().min(100).max(100000),
    backlinkLimit: z.number().int().min(1000).max(100000),
  }),
  z.object({
    section: z.literal("google"),
    gscProperty: z.string().max(500).nullable(),
    ga4Property: z.string().max(100).nullable(),
  }),
  z.object({
    section: z.literal("connection"),
    connection: ConnectionSchema,
  }),
  z.object({
    section: z.literal("alerts"),
    channels: z.array(z.enum(["in_app", "email", "whatsapp"])).min(1),
    recipients: z.array(z.string().max(320)).max(100),
    eventTypes: z.array(z.string().max(80)).max(100),
    rankDropThreshold: z.number().int().min(1).max(100),
    trafficDropPct: z.number().int().min(1).max(100),
    enabled: z.boolean(),
  }),
]);

function unavailable() {
  return NextResponse.json({ error: "Site settings require DATABASE_URL." }, { status: 503 });
}

async function audit(request: Request, siteSlug: string, action: string, area: string, summary: string, metadata: Record<string, unknown> = {}) {
  await db().insert(schema.accessAuditEvents).values({
    siteSlug,
    actorEmail: request.headers.get("x-orwell-user-email"),
    actorRole: request.headers.get("x-orwell-user-role"),
    action,
    area,
    summary,
    metadata,
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!(await getManagedSite(siteId))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json(qaSettings(siteId));
  if (!hasDatabase()) return unavailable();
  const [storedSite] = await db().select().from(schema.siteProfiles).where(eq(schema.siteProfiles.slug, siteId)).limit(1);
  const managed = storedSite ? null : await getManagedSite(siteId);
  if (!storedSite && !managed) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const site = storedSite ?? {
    slug: managed!.id, name: managed!.name, host: managed!.host, accent: managed!.accent,
    industry: managed!.industry, primaryMarket: managed!.primaryMarket,
    locationCode: managed!.dataForSeoLocationCode, languageCode: managed!.dataForSeoLanguageCode,
    devices: managed!.devices, gscProperty: managed!.gscSite || null, ga4Property: managed!.ga4PropertyId,
    lifecycleStatus: managed!.lifecycleStatus, spendApproval: managed!.spendApproval,
    forecastMonthlyUsd: managed!.forecastMonthlyUsd, approvedMonthlyUsd: managed!.approvedMonthlyUsd,
    budgetLimits: managed!.budgetLimits, monitoringSchedule: managed!.monitoringSchedule,
    siteSettings: managed!.siteSettings, crawlMaxPages: managed!.crawlMaxPages, backlinkLimit: managed!.backlinkLimit,
  };
  const month = currentMonth();
  const [connections, memberships, groups, rules, spend, auditEvents] = await Promise.all([
    db().select().from(schema.siteConnections).where(eq(schema.siteConnections.siteSlug, siteId)),
    db().select().from(schema.siteGroupMemberships).where(eq(schema.siteGroupMemberships.siteSlug, siteId)),
    db().select().from(schema.portfolioGroups),
    db().select().from(schema.notificationRules).where(eq(schema.notificationRules.siteSlug, siteId)),
    db().select({
      endpoint: schema.providerSpend.endpoint,
      spentUsd: sql<number>`coalesce(sum(${schema.providerSpend.costUsd}), 0)::float`,
    }).from(schema.providerSpend).where(and(
      eq(schema.providerSpend.domainSlug, siteId),
      eq(schema.providerSpend.month, month),
    )).groupBy(schema.providerSpend.endpoint),
    db().select().from(schema.accessAuditEvents)
      .where(eq(schema.accessAuditEvents.siteSlug, siteId))
      .orderBy(desc(schema.accessAuditEvents.createdAt)).limit(50),
  ]);
  return NextResponse.json({
    site,
    connections,
    groupIds: memberships.map((item) => item.groupId),
    groups,
    notificationRule: rules[0] ?? null,
    spend: { month, lines: spend, totalUsd: spend.reduce((total, item) => total + item.spentUsd, 0) },
    auditEvents,
    credentialPolicy: "Central credentials are stored outside this database and mapped to each website.",
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const role = request.headers.get("x-orwell-user-role");
  if (!(await getManagedSite(siteId))) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  if (!await canAccessSite(request, siteId)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Review the settings fields.", fields: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  if (input.section === "budget") {
    if (!canApproveBudget(role)) return NextResponse.json({ error: "Admin or Owner approval required." }, { status: 403 });
  } else if (!canWrite(role)) {
    return NextResponse.json({ error: "Admin or SEO operator access required." }, { status: 403 });
  }
  if (process.env.QA_SYNTHETIC === "true") {
    const settings = qaSettings(siteId);
    const site = { ...settings.site };
    if (input.section === "general") {
      Object.assign(site, input);
    } else if (input.section === "groups") {
      settings.groupIds = input.groupIds;
    } else if (input.section === "budget") {
      if (input.spendApproval === "approved" && (input.approvedMonthlyUsd ?? 0) < site.forecastMonthlyUsd) {
        return NextResponse.json({ error: "The approved ceiling cannot be below the current forecast." }, { status: 400 });
      }
      site.approvedMonthlyUsd = input.approvedMonthlyUsd;
      site.budgetLimits = input.budgetLimits;
      site.spendApproval = input.spendApproval;
    } else if (input.section === "monitoring") {
      site.monitoringSchedule = input.monitoringSchedule;
      site.siteSettings = input.siteSettings;
      site.crawlMaxPages = input.crawlMaxPages;
      site.backlinkLimit = input.backlinkLimit;
    } else if (input.section === "google") {
      site.gscProperty = input.gscProperty;
      site.ga4Property = input.ga4Property;
    } else if (input.section === "connection") {
      const connection = {
        id: `qa-${input.connection.kind}`,
        ...input.connection,
        remoteUrl: input.connection.remoteUrl ?? "",
        config: { ...input.connection.config, publishMode: "review_only" },
        lastCheckedAt: input.connection.status === "connected" ? new Date().toISOString() : "",
      };
      settings.connections = [
        ...settings.connections.filter((item) => item.kind !== input.connection.kind),
        connection,
      ];
    } else if (input.section === "alerts") {
      settings.notificationRule = {
        channels: input.channels,
        recipients: input.recipients,
        eventTypes: input.eventTypes,
        rankDropThreshold: input.rankDropThreshold,
        trafficDropPct: input.trafficDropPct,
        enabled: input.enabled,
      };
    }
    settings.site = site;
    return NextResponse.json({ site, settings, saved: true, synthetic: true });
  }
  if (!hasDatabase()) return unavailable();
  const [existing] = await db().select().from(schema.siteProfiles).where(eq(schema.siteProfiles.slug, siteId)).limit(1);
  if (!existing) {
    const managed = await getManagedSite(siteId);
    if (!managed) return NextResponse.json({ error: "Website not found." }, { status: 404 });
    await db().insert(schema.siteProfiles).values({
      slug: managed.id, name: managed.name, host: managed.host, accent: managed.accent,
      industry: managed.industry, primaryMarket: managed.primaryMarket,
      locationCode: managed.dataForSeoLocationCode ?? 2840, languageCode: managed.dataForSeoLanguageCode,
      devices: managed.devices, gscProperty: managed.gscSite || null, ga4Property: managed.ga4PropertyId,
      lifecycleStatus: managed.lifecycleStatus, spendApproval: managed.spendApproval,
      forecastMonthlyUsd: managed.forecastMonthlyUsd, approvedMonthlyUsd: managed.approvedMonthlyUsd,
      budgetLimits: managed.budgetLimits, monitoringSchedule: managed.monitoringSchedule as Record<string, unknown>,
      siteSettings: managed.siteSettings, crawlMaxPages: managed.crawlMaxPages, backlinkLimit: managed.backlinkLimit,
      createdBy: request.headers.get("x-orwell-user-email"),
    });
  }

  if (input.section === "groups") {
    await setSiteGroups(siteId, input.groupIds);
    await audit(request, siteId, "updated", "groups", "Updated portfolio group membership.", { groupIds: input.groupIds });
  } else if (input.section === "connection") {
    const connection = input.connection;
    await db().insert(schema.siteConnections).values({
      siteSlug: siteId,
      kind: connection.kind,
      displayName: connection.displayName,
      remoteUrl: connection.remoteUrl ?? null,
      status: connection.status,
      config: { ...connection.config, publishMode: "review_only" },
      lastCheckedAt: connection.status === "connected" ? new Date() : null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [schema.siteConnections.siteSlug, schema.siteConnections.kind],
      set: {
        displayName: connection.displayName,
        remoteUrl: connection.remoteUrl ?? null,
        status: connection.status,
        config: { ...connection.config, publishMode: "review_only" },
        lastCheckedAt: connection.status === "connected" ? new Date() : null,
        updatedAt: new Date(),
      },
    });
    await audit(request, siteId, "updated", "connection", `Updated ${connection.displayName} connection.`, { kind: connection.kind, status: connection.status });
  } else if (input.section === "alerts") {
    const [rule] = await db().select().from(schema.notificationRules).where(eq(schema.notificationRules.siteSlug, siteId)).limit(1);
    const values = {
      channels: input.channels,
      recipients: input.recipients,
      eventTypes: input.eventTypes,
      rankDropThreshold: input.rankDropThreshold,
      trafficDropPct: input.trafficDropPct,
      enabled: input.enabled,
      updatedAt: new Date(),
    };
    if (rule) await db().update(schema.notificationRules).set(values).where(eq(schema.notificationRules.id, rule.id));
    else await db().insert(schema.notificationRules).values({ siteSlug: siteId, ...values });
    await audit(request, siteId, "updated", "alerts", "Updated notification routing.");
  } else {
    const updatedAt = new Date();
    if (input.section === "general") {
      await db().update(schema.siteProfiles).set({
        name: input.name,
        host: input.host,
        industry: input.industry,
        primaryMarket: input.primaryMarket,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        devices: input.devices,
        lifecycleStatus: input.lifecycleStatus,
        accent: input.accent,
        archivedAt: input.lifecycleStatus === "archived" ? updatedAt : null,
        updatedAt,
      }).where(eq(schema.siteProfiles.slug, siteId));
    } else if (input.section === "budget") {
      const [current] = await db().select({ forecastMonthlyUsd: schema.siteProfiles.forecastMonthlyUsd })
        .from(schema.siteProfiles).where(eq(schema.siteProfiles.slug, siteId)).limit(1);
      if (input.spendApproval === "approved" && (input.approvedMonthlyUsd ?? 0) < (current?.forecastMonthlyUsd ?? 0)) {
        return NextResponse.json({ error: "The approved ceiling cannot be below the current forecast." }, { status: 400 });
      }
      await db().update(schema.siteProfiles).set({
        approvedMonthlyUsd: input.approvedMonthlyUsd,
        budgetLimits: input.budgetLimits,
        spendApproval: input.spendApproval,
        approvedBy: request.headers.get("x-orwell-user-email"),
        approvedAt: input.spendApproval === "approved" ? updatedAt : null,
        updatedAt,
      }).where(eq(schema.siteProfiles.slug, siteId));
    } else if (input.section === "monitoring") {
      await db().update(schema.siteProfiles).set({
        monitoringSchedule: input.monitoringSchedule,
        siteSettings: input.siteSettings,
        crawlMaxPages: input.crawlMaxPages,
        backlinkLimit: input.backlinkLimit,
        updatedAt,
      }).where(eq(schema.siteProfiles.slug, siteId));
    } else if (input.section === "google") {
      await db().update(schema.siteProfiles).set({
        gscProperty: input.gscProperty,
        ga4Property: input.ga4Property,
        updatedAt,
      }).where(eq(schema.siteProfiles.slug, siteId));
    }
    await audit(request, siteId, "updated", input.section, `Updated ${input.section} settings.`);
  }

  const [site] = await db().select().from(schema.siteProfiles).where(eq(schema.siteProfiles.slug, siteId)).limit(1);
  return NextResponse.json({ site, saved: true });
}
