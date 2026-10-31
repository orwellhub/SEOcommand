import { MANAGE_TOOLS } from "./manage";
import { PAID_TOOLS } from "./paid";
import { READ_TOOLS } from "./read";
import { inputJsonSchema, type McpTool } from "./shared";

/** Every connector tool, in a fixed order (read, manage, paid). */
export const MCP_TOOLS: readonly McpTool[] = [...READ_TOOLS, ...MANAGE_TOOLS, ...PAID_TOOLS] as unknown as McpTool[];

export interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

export function describeTools(tools: readonly McpTool[] = MCP_TOOLS): ToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: inputJsonSchema(tool.input),
    annotations: { title: tool.title, ...tool.annotations },
  }));
}

export type { McpTool } from "./shared";
