import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Mode } from "../../mode.js";
import { type AgentMeta, MCP_ENTRY } from "./types.js";

function installMcp(binPath: string, mode: Mode): void {
  const entry = MCP_ENTRY[mode];
  // Remove existing entry (ignore errors if not found)
  try {
    execFileSync("claude", ["mcp", "remove", entry], { stdio: "pipe" });
  } catch {
    // not found — fine
  }

  execFileSync(
    "claude",
    ["mcp", "add", "-s", "user", entry, "--", "bun", "run", binPath, "--mode", mode],
    {
      stdio: "pipe",
    },
  );
}

function installSkills(skillsSource: string): void {
  const destDir = join(process.cwd(), ".claude", "skills");
  mkdirSync(destDir, { recursive: true });

  if (!existsSync(skillsSource)) return;

  const skills = readdirSync(skillsSource, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const skill of skills) {
    cpSync(join(skillsSource, skill.name), join(destDir, skill.name), {
      recursive: true,
      force: true,
    });
  }
}

export const claudeCode: AgentMeta = {
  id: "claude-code",
  name: "Claude Code",
  description: "Anthropic's coding agent",
  cli: "claude",
  supportsSkills: true,
  installMcp,
  installSkills,
  postInstallHint: "Restart Claude Code to pick up the changes.",
};
