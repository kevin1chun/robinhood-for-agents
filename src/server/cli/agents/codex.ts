import { execFileSync } from "node:child_process";
import type { Mode } from "../../mode.js";
import { type AgentMeta, MCP_ENTRY } from "./types.js";

function installMcp(binPath: string, mode: Mode): void {
  execFileSync(
    "codex",
    ["mcp", "add", MCP_ENTRY[mode], "--", "bun", "run", binPath, "--mode", mode],
    { stdio: "pipe" },
  );
}

export const codex: AgentMeta = {
  id: "codex",
  name: "Codex",
  description: "OpenAI's coding agent",
  cli: "codex",
  supportsSkills: false,
  installMcp,
  postInstallHint: "Restart Codex to pick up the changes.",
};
