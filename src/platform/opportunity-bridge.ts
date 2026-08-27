import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { latestKeywordStrategy } from "@/platform/keyword-strategy";

export const EXECUTION_TYPES = [
  "tracked_keyword_group",
  "keyword_page_map",
  "content_brief",
  "refresh_brief",
  "internal_link_task",
  "link_prospect_list",
  "technical_task",
] as const;

export const PAGE_MODES = ["new_page", "existing_page", "site_wide"] as const;
export const WORKFLOW_STATUSES = ["approved", "in_progress", "shipped", "verifying", "done"] as const;

export type DuplicateWarning = {
  severity: "none" | "info" | "warning";
  summary: string;
  matches: Array<{ kind: "url" | "keyword" | "cannibalisation" | "work"; label: string; url?: string }>;
  checkedAt: string;
};

type StoredWork = { title: string; targetUrl: string | null; plannedUrl: string | null };

function normaliseKeyword(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normaliseUrl(value: string | null | undefined) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}

/** Uses already-stored website intelligence only. It never triggers a paid
 * provider request, so qualification remains safe to repeat while editing. */
export function analyseOpportunityDuplicates(input: {
  targetKeywords: string[];
  targetUrl?: string | null;
  plannedUrl?: string | null;
}, pageMap: Record<string, unknown>[], cannibalisation: Record<string, unknown>[], existing: StoredWork[] = []): DuplicateWarning {
  const selectedUrl = normaliseUrl(input.targetUrl || input.plannedUrl);
  const wanted = new Set(input.targetKeywords.map(normaliseKeyword).filter(Boolean));
  const matches: DuplicateWarning["matches"] = [];

  for (const raw of pageMap) {
    const row = raw as { page?: unknown; primaryQuery?: unknown; queries?: unknown };
    const page = typeof row.page === "string" ? row.page : "";
    const queries = [row.primaryQuery, ...(Array.isArray(row.queries) ? row.queries : [])]
      .filter((value): value is string => typeof value === "string");
    if (selectedUrl && normaliseUrl(page) === selectedUrl) {
      matches.push({ kind: "url", label: "The destination already appears in the website keyword map.", url: page });
    }
    for (const query of queries) {
      if (!wanted.has(normaliseKeyword(query))) continue;
      if (!matches.some((match) => match.kind === "keyword" && match.label === query)) {
        matches.push({ kind: "keyword", label: query, url: page || undefined });
      }
    }
  }

  for (const raw of cannibalisation) {
    const issue = raw as { query?: unknown; pages?: unknown };
    if (typeof issue.query !== "string" || !wanted.has(normaliseKeyword(issue.query))) continue;
    const firstPage = Array.isArray(issue.pages) && typeof issue.pages[0] === "object" && issue.pages[0]
      ? (issue.pages[0] as { page?: unknown }).page
      : undefined;
    matches.push({ kind: "cannibalisation", label: issue.query, url: typeof firstPage === "string" ? firstPage : undefined });
  }

  if (selectedUrl) for (const item of existing) matches.push({ kind: "work", label: item.title, url: item.targetUrl ?? item.plannedUrl ?? undefined });

  const unique = matches.filter((match, index, all) => all.findIndex((item) => `${item.kind}:${item.label}:${item.url ?? ""}` === `${match.kind}:${match.label}:${match.url ?? ""}`) === index).slice(0, 12);
  const risky = unique.some((match) => match.kind === "cannibalisation" || match.kind === "keyword" || match.kind === "work");
  return {
    severity: unique.length ? (risky ? "warning" : "info") : "none",
    summary: unique.length
      ? `${unique.length} possible overlap${unique.length === 1 ? "" : "s"} found. Review before approval.`
      : "No overlap found in the latest stored website evidence.",
    matches: unique,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkOpportunityDuplicates(input: {
  siteSlug: string;
  targetKeywords: string[];
  targetUrl?: string | null;
  plannedUrl?: string | null;
  excludeOpportunityId?: string;
}): Promise<DuplicateWarning> {
  const strategy = await latestKeywordStrategy(input.siteSlug);
  const selectedUrl = input.targetUrl || input.plannedUrl || "";
  const existing = selectedUrl ? await db().select({ title: schema.workflowItems.title, targetUrl: schema.workflowItems.targetUrl, plannedUrl: schema.workflowItems.plannedUrl })
    .from(schema.workflowItems)
    .where(and(
      eq(schema.workflowItems.domainSlug, input.siteSlug),
      input.excludeOpportunityId ? or(isNull(schema.workflowItems.opportunityId), ne(schema.workflowItems.opportunityId, input.excludeOpportunityId)) : undefined,
      or(eq(schema.workflowItems.targetUrl, selectedUrl), eq(schema.workflowItems.plannedUrl, selectedUrl)),
    ))
    .orderBy(desc(schema.workflowItems.updatedAt)).limit(5) : [];
  return analyseOpportunityDuplicates(
    input,
    Array.isArray(strategy?.pageMap) ? strategy.pageMap : [],
    Array.isArray(strategy?.cannibalisation) ? strategy.cannibalisation : [],
    existing,
  );
}
