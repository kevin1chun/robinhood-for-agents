/** Official Robinhood Trading MCP tool schemas and parity status, read from docs/official-mcp-tools.md. */

import { existsSync, readFileSync } from "node:fs";

export type OfficialTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ParityStatus = "same" | "renamed" | "new" | "agent-only";

let cached: string | undefined;

/** Source layout is src/server/official/; the published build adds dist/ in front. */
function doc(): string {
  if (cached === undefined) {
    let url = new URL("../../../docs/official-mcp-tools.md", import.meta.url);
    if (!existsSync(url)) url = new URL("../../../../docs/official-mcp-tools.md", import.meta.url);
    cached = readFileSync(url, "utf8");
  }
  return cached;
}

let tools: Map<string, OfficialTool> | undefined;

export function officialTools(): Map<string, OfficialTool> {
  if (!tools) {
    tools = new Map();
    for (const section of doc().split(/^## /m).slice(1)) {
      const name = section.slice(0, section.indexOf("\n")).trim();
      const fence = section.indexOf("```json\n");
      if (fence < 0) continue;
      const json = section.slice(fence + 8, section.indexOf("```", fence + 8));
      tools.set(name, {
        name,
        description: section.slice(name.length, fence).trim(),
        inputSchema: JSON.parse(json) as Record<string, unknown>,
      });
    }
  }
  return tools;
}

let status: Map<string, ParityStatus> | undefined;

export function parityStatus(): Map<string, ParityStatus> {
  if (!status) {
    status = new Map();
    for (const m of doc().matchAll(/^\| `([a-z_]+)` \| [^|]+ \| ([\w-]+) \|/gm)) {
      status.set(m[1] as string, m[2] as ParityStatus);
    }
  }
  return status;
}
