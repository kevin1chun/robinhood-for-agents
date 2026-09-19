import type { Mode } from "../mode.js";
import { claudeCode } from "./agents/claude-code.js";
import { MCP_ENTRY } from "./agents/types.js";
import { binPath } from "./paths.js";

export function installMcp(mode: Mode): void {
  const entry = binPath();

  claudeCode.installMcp?.(entry, mode);

  console.log(`  MCP server '${MCP_ENTRY[mode]}' added via 'claude mcp add -s user'`);
  console.log(`  Command: bun run ${entry} --mode ${mode}`);
}
