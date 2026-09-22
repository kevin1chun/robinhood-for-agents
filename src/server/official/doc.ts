/**
 * Official Robinhood Trading MCP tools, read from docs/official-mcp-tools.json (the server's own
 * `tools/list` result), and the parity status from docs/official-mcp-tools.md.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export type OfficialTool = Tool;

export type ParityStatus = "same" | "renamed" | "new" | "standard-only";

/** Source layout is src/server/official/; the published build adds dist/ in front. */
function read(file: string): string {
  let url = new URL(`../../../docs/${file}`, import.meta.url);
  if (!existsSync(url)) url = new URL(`../../../../docs/${file}`, import.meta.url);
  return readFileSync(url, "utf8");
}

let tools: Map<string, OfficialTool> | undefined;

export function officialTools(): Map<string, OfficialTool> {
  if (!tools) {
    const list = JSON.parse(read("official-mcp-tools.json")) as OfficialTool[];
    tools = new Map(list.map((t) => [t.name, t]));
  }
  return tools;
}

let status: Map<string, ParityStatus> | undefined;

export function parityStatus(): Map<string, ParityStatus> {
  if (!status) {
    status = new Map();
    for (const m of read("official-mcp-tools.md").matchAll(
      /^\| `([a-z_]+)` \| [^|]+ \| ([\w-]+) \|/gm,
    )) {
      status.set(m[1] as string, m[2] as ParityStatus);
    }
  }
  return status;
}
