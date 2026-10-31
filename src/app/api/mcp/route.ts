import { handleMcpPost, methodNotAllowed } from "@/mcp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Remote MCP server for Claude (claude.ai custom connector or Claude Code,
 * Streamable HTTP, stateless JSON responses). Protected by its own bearer token
 * (SEOCOMMAND_MCP_TOKEN), independent of dashboard sessions; refuses everything
 * while the token is unset. See docs/mcp-connector.md.
 */
export async function POST(request: Request) {
  return handleMcpPost(request);
}

export async function GET() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}
