import { db, schema } from "@/db";
import { hasDatabase } from "@/sync/store";
import { MCP_ACTOR } from "./config";

/**
 * Audit trail for connector tool calls, written to the existing append-only
 * access_audit_events table (area "mcp") plus one structured log line.
 * Records the tool, site, cost, duration and outcome. Never records the bearer
 * token, headers or the internal session; arguments are reduced to their keys.
 */

export interface ToolCallAudit {
  tool: string;
  kind: "read" | "manage" | "paid";
  site: string | null;
  status: "ok" | "error";
  costUsd: number;
  estimateUsd?: number | null;
  durationMs: number;
  argumentKeys: string[];
  error?: string | null;
}

export async function recordToolCall(entry: ToolCallAudit): Promise<void> {
  const metadata = {
    tool: entry.tool,
    kind: entry.kind,
    status: entry.status,
    costUsd: entry.costUsd,
    ...(entry.estimateUsd != null ? { estimateUsd: entry.estimateUsd } : {}),
    durationMs: entry.durationMs,
    argumentKeys: entry.argumentKeys,
    ...(entry.error ? { error: entry.error.slice(0, 300) } : {}),
  };
  console.info(JSON.stringify({ event: "mcp_tool_call", actor: MCP_ACTOR, site: entry.site, ...metadata }));
  if (!hasDatabase()) return;
  try {
    await db().insert(schema.accessAuditEvents).values({
      siteSlug: entry.site,
      actorEmail: MCP_ACTOR,
      actorRole: "mcp",
      action: `mcp.${entry.tool}`,
      area: "mcp",
      summary: `${entry.tool} ${entry.status === "ok" ? "completed" : "failed"}${entry.site ? ` for ${entry.site}` : ""}${entry.costUsd > 0 ? ` ($${entry.costUsd.toFixed(4)})` : ""} in ${entry.durationMs} ms.`,
      metadata,
    });
  } catch (error) {
    // Auditing must never turn a completed tool call into a failure.
    console.warn(JSON.stringify({ event: "mcp_audit_write_failed", tool: entry.tool, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
  }
}
