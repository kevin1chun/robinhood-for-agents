import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentMeta } from "./types.js";

const MCPORTER_DIR = join(homedir(), ".openclaw", "workspace", "config");
const MCPORTER_PATH = join(MCPORTER_DIR, "mcporter.json");
const SKILLS_DIR = join(homedir(), ".openclaw", "workspace", "skills");

function installMcp(binPath: string): void {
  mkdirSync(MCPORTER_DIR, { recursive: true });

  let config: Record<string, unknown> = {};
  if (existsSync(MCPORTER_PATH)) {
    try {
      config = JSON.parse(readFileSync(MCPORTER_PATH, "utf-8"));
    } catch {
      // corrupted — start fresh
    }
  }

  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  servers["rh-agent-tools"] = {
    command: "bun",
    args: ["run", binPath],
  };
  config.mcpServers = servers;

  writeFileSync(MCPORTER_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function installSkills(skillsSource: string): void {
  mkdirSync(SKILLS_DIR, { recursive: true });

  if (!existsSync(skillsSource)) return;

  const skills = readdirSync(skillsSource, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const skill of skills) {
    cpSync(join(skillsSource, skill.name), join(SKILLS_DIR, skill.name), {
      recursive: true,
      force: true,
    });
  }
}

export const openclaw: AgentMeta = {
  id: "openclaw",
  name: "OpenClaw",
  description: "Open-source personal AI assistant (via mcporter)",
  cli: "openclaw",
  supportsSkills: true,
  installMcp,
  installSkills,
  postInstallHint:
    "Restart the OpenClaw gateway to pick up the changes. OpenClaw snapshots skills at session start.",
};
