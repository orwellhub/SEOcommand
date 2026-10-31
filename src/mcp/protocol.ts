import { authorizeMcpRequest } from "./auth";
import { recordToolCall } from "./audit";
import {
  allowedOrigins,
  LEGACY_PROTOCOL_VERSIONS,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  MODERN_PROTOCOL_VERSIONS,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "./config";
import { McpToolError } from "./internal";
import { describeTools, MCP_TOOLS, type McpTool, type ToolDescriptor } from "./tools";

/**
 * Stateless MCP server over Streamable HTTP (JSON responses, no sessions).
 *
 * Dual-era, per the 2026-07-28 revision's backward-compatibility rules:
 *  - Modern clients (2026-07-28) send `_meta["io.modelcontextprotocol/protocolVersion"]`
 *    on every request plus the MCP-Protocol-Version / Mcp-Method / Mcp-Name
 *    headers; `server/discover` is supported and results carry `resultType`.
 *  - Legacy clients (2025-03-26 to 2025-11-25) open with `initialize`, then send
 *    `notifications/initialized`, `ping`, `tools/list` and `tools/call`.
 * No session ids are minted, so every request is self-contained.
 */

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function rpcError(id: JsonRpcId, code: number, message: string, status: number, data?: unknown): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }, status);
}

function decodeHeaderValue(value: string): string {
  const match = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!match) return value;
  try {
    return Buffer.from(match[1]!, "base64").toString("utf8");
  } catch {
    return value;
  }
}

function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const normalised = origin.replace(/\/$/, "");
  try {
    if (new URL(request.url).origin === normalised) return true;
  } catch {
    // fall through to the allow-list
  }
  return allowedOrigins().has(normalised);
}

let cachedDescriptors: ToolDescriptor[] | null = null;
function toolDescriptors(tools: readonly McpTool[]): ToolDescriptor[] {
  if (tools !== MCP_TOOLS) return describeTools(tools);
  cachedDescriptors ??= describeTools(MCP_TOOLS);
  return cachedDescriptors;
}

export interface McpHandlerOptions {
  tools?: readonly McpTool[];
  env?: Record<string, string | undefined>;
}

type ToolCallOutcome =
  | { protocolError: { code: number; message: string } }
  | { result: { content: Array<{ type: "text"; text: string }>; structuredContent: Record<string, unknown>; isError: boolean } };

async function callTool(tools: readonly McpTool[], params: Record<string, unknown>): Promise<ToolCallOutcome> {
  const name = params.name;
  const tool = typeof name === "string" ? tools.find((item) => item.name === name) : undefined;
  if (!tool) return { protocolError: { code: ERR.invalidParams, message: `Unknown tool: ${String(name)}` } };
  const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Record<string, unknown>;
  const started = Date.now();
  const argSite = typeof args.site === "string" ? args.site : null;
  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    const message = `Invalid arguments for ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`).join("; ")}`;
    await recordToolCall({ tool: tool.name, kind: tool.kind, site: argSite, status: "error", costUsd: 0, durationMs: Date.now() - started, argumentKeys: Object.keys(args), error: message });
    return { result: { content: [{ type: "text", text: message }], structuredContent: { error: message }, isError: true } };
  }
  try {
    const output = await tool.run(parsed.data);
    await recordToolCall({ tool: tool.name, kind: tool.kind, site: output.site ?? argSite, status: "ok", costUsd: output.costUsd ?? 0, estimateUsd: output.estimateUsd ?? null, durationMs: Date.now() - started, argumentKeys: Object.keys(args) });
    return { result: { content: [{ type: "text", text: JSON.stringify(output.data) }], structuredContent: output.data, isError: false } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The tool failed.";
    const details = error instanceof McpToolError ? error.details ?? {} : {};
    const costUsd = typeof details.costUsd === "number" ? details.costUsd : 0;
    const estimateUsd = typeof details.estimateUsd === "number" ? details.estimateUsd : null;
    if (!(error instanceof McpToolError)) console.error(JSON.stringify({ event: "mcp_tool_failed", tool: tool.name, error: message.slice(0, 300) }));
    await recordToolCall({ tool: tool.name, kind: tool.kind, site: argSite, status: "error", costUsd, estimateUsd, durationMs: Date.now() - started, argumentKeys: Object.keys(args), error: message });
    const structured = { error: message, ...details };
    return { result: { content: [{ type: "text", text: JSON.stringify(structured) }], structuredContent: structured, isError: true } };
  }
}

/** Handle one POST to /api/mcp. */
export async function handleMcpPost(request: Request, options: McpHandlerOptions = {}): Promise<Response> {
  const auth = authorizeMcpRequest(request, options.env);
  if (!auth.ok) return json(auth.body, auth.status, auth.headers);
  if (!originAllowed(request)) return rpcError(null, ERR.invalidRequest, "Origin not allowed.", 403);

  let message: JsonRpcMessage | JsonRpcMessage[];
  try {
    message = JSON.parse(await request.text()) as JsonRpcMessage | JsonRpcMessage[];
  } catch {
    return rpcError(null, ERR.parse, "Parse error: the body must be one JSON-RPC message.", 400);
  }
  if (Array.isArray(message)) return rpcError(null, ERR.invalidRequest, "Batch requests are not supported; send one JSON-RPC message per POST.", 400);
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") return rpcError(null, ERR.invalidRequest, "Invalid JSON-RPC 2.0 message.", 400);

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  // Notifications (e.g. notifications/initialized) and stray responses are accepted without a body.
  if (!hasId || (message.method === undefined && (message.result !== undefined || message.error !== undefined))) {
    return new Response(null, { status: 202 });
  }
  const id = (typeof message.id === "string" || typeof message.id === "number" ? message.id : null) as JsonRpcId;
  if (typeof message.method !== "string") return rpcError(id, ERR.invalidRequest, "The request has no method.", 400);
  const method = message.method;
  const params = (message.params && typeof message.params === "object" && !Array.isArray(message.params) ? message.params : {}) as Record<string, unknown>;
  const meta = (params._meta && typeof params._meta === "object" ? params._meta : {}) as Record<string, unknown>;
  const headerVersion = request.headers.get("mcp-protocol-version");
  const tools = options.tools ?? MCP_TOOLS;

  /* ------------------------------ Era detection ----------------------------- */
  let modern = false;
  if (method === "initialize") {
    modern = false;
  } else if (meta[META_VERSION] !== undefined) {
    modern = true;
    const version = meta[META_VERSION];
    if (typeof version !== "string" || !(MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
      return rpcError(id, ERR.unsupportedVersion, "Unsupported protocol version", 400, { supported: SUPPORTED_PROTOCOL_VERSIONS, requested: version });
    }
    if (headerVersion !== version) {
      return rpcError(id, ERR.headerMismatch, headerVersion ? `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match _meta '${version}'.` : "Missing required MCP-Protocol-Version header.", 400);
    }
    const methodHeader = request.headers.get("mcp-method");
    if (methodHeader !== method) {
      return rpcError(id, ERR.headerMismatch, methodHeader ? `Header mismatch: Mcp-Method '${methodHeader}' does not match body method '${method}'.` : "Missing required Mcp-Method header.", 400);
    }
    if (method === "tools/call") {
      const nameHeader = request.headers.get("mcp-name");
      if (nameHeader === null || decodeHeaderValue(nameHeader) !== params.name) {
        return rpcError(id, ERR.headerMismatch, nameHeader === null ? "Missing required Mcp-Name header." : `Header mismatch: Mcp-Name does not match body name '${String(params.name)}'.`, 400);
      }
    }
  } else if (headerVersion !== null && !(LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
    if ((MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(headerVersion)) {
      return rpcError(id, ERR.headerMismatch, `Header mismatch: MCP-Protocol-Version '${headerVersion}' requires _meta["${META_VERSION}"] in the request body.`, 400);
    }
    return rpcError(id, ERR.unsupportedVersion, "Unsupported protocol version", 400, { supported: SUPPORTED_PROTOCOL_VERSIONS, requested: headerVersion });
  }

  const ok = (result: Record<string, unknown>) =>
    json({
      jsonrpc: "2.0",
      id,
      result: modern ? { resultType: "complete", ...result, _meta: { [META_SERVER_INFO]: MCP_SERVER_INFO } } : result,
    });

  /* -------------------------------- Dispatch -------------------------------- */
  try {
    switch (method) {
      case "initialize": {
        const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        const protocolVersion = (LEGACY_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LEGACY_PROTOCOL_VERSIONS[0];
        return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS });
      }
      case "ping":
        return ok({});
      case "server/discover":
        return ok({
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: { tools: { listChanged: false } },
          instructions: MCP_INSTRUCTIONS,
          ...(modern ? { ttlMs: 300_000, cacheScope: "private" } : { serverInfo: MCP_SERVER_INFO }),
        });
      case "tools/list":
        return ok({ tools: toolDescriptors(tools), ...(modern ? { ttlMs: 300_000, cacheScope: "private" } : {}) });
      case "tools/call": {
        const outcome = await callTool(tools, params);
        if ("protocolError" in outcome) return rpcError(id, outcome.protocolError.code, outcome.protocolError.message, 200);
        return ok(outcome.result as unknown as Record<string, unknown>);
      }
      default:
        return rpcError(id, ERR.methodNotFound, `Method not found: ${method}`, modern ? 404 : 200);
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "mcp_request_failed", method, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" }));
    return rpcError(id, ERR.internal, "Internal error.", 500);
  }
}

/** GET and DELETE: no SSE stream and no sessions on this stateless server. */
export function methodNotAllowed(): Response {
  return json({ jsonrpc: "2.0", id: null, error: { code: ERR.invalidRequest, message: "Method not allowed: this MCP endpoint accepts POST only." } }, 405, { allow: "POST" });
}
