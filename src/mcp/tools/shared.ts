import { z } from "zod/v4";
import { getManagedSite } from "@/platform/site-store";
import type { ManagedSite } from "@/platform/types";
import { McpToolError } from "../internal";

export type ToolKind = "read" | "manage" | "paid";

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** What a tool handler returns. `data` becomes structuredContent. */
export interface ToolOutput {
  data: Record<string, unknown>;
  site?: string | null;
  costUsd?: number;
  estimateUsd?: number;
}

export interface McpTool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  input: S;
  annotations: ToolAnnotations;
  run(args: z.output<S>): Promise<ToolOutput>;
}

export function defineTool<S extends z.ZodType>(tool: McpTool<S>): McpTool<S> {
  return tool;
}

/* ------------------------------ Arguments ------------------------------- */

export const siteArg = z.string().trim().min(1).max(120).describe('Site slug from list_sites, e.g. "pettransportglobal".');
export const limitArg = (fallback: number, max: number) =>
  z.number().int().min(1).max(max).default(fallback).describe(`Rows to return per list (default ${fallback}, max ${max}).`);
export const offsetArg = z.number().int().min(0).max(100_000).default(0).describe("Rows to skip, for paging (default 0).");

/* ------------------------------ Helpers -------------------------------- */

export async function requireSite(slug: string): Promise<ManagedSite> {
  const site = await getManagedSite(slug);
  if (!site) throw new McpToolError(`Unknown site "${slug}". Call list_sites for valid slugs.`);
  return site;
}

export interface Page<T> {
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  rows: T[];
}

export function page<T>(rows: readonly T[] | null | undefined, limit: number, offset = 0): Page<T> {
  const all = rows ?? [];
  const slice = all.slice(offset, offset + limit);
  return {
    total: all.length,
    offset,
    limit,
    nextOffset: offset + slice.length < all.length ? offset + slice.length : null,
    rows: slice,
  };
}

export function round(value: number | null | undefined, places = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Freshness of one stored live dataset, from its provenance. */
export function freshness(ds: { capturedOn: string; provenance?: { source?: string; collectedAt?: string; rangeStart?: string; rangeEnd?: string; location?: string } } | undefined) {
  if (!ds) return null;
  return {
    capturedOn: ds.capturedOn,
    collectedAt: ds.provenance?.collectedAt ?? null,
    source: ds.provenance?.source ?? null,
    rangeStart: ds.provenance?.rangeStart ?? null,
    rangeEnd: ds.provenance?.rangeEnd ?? null,
    location: ds.provenance?.location ?? null,
  };
}

/** JSON Schema for a tool's arguments (2020-12, the MCP default dialect). */
export function inputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  if (json.type === "object" && !json.properties) json.properties = {};
  return json;
}
