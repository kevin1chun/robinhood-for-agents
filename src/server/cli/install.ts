import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import {
  type AgentType,
  agents,
  detectGlobalAgents,
  listInstalledServers,
  removeServer,
  upsertServer,
} from "add-mcp";
import { officialCredentialPath } from "../official/auth.js";
import { skillsDir } from "./paths.js";

const SERVER = "robinhood-for-agents";
const WEB_SERVER = "robinhood-web";
const OPENCLAW = "openclaw";

/** add-mcp agent id → skills CLI `--agent` id, per the skills README "Supported Agents" table. */
const SKILLS_AGENT: Partial<Record<AgentType, string>> = {
  antigravity: "antigravity",
  cline: "cline",
  "claude-code": "claude-code",
  codex: "codex",
  cursor: "cursor",
  fx: "fx",
  "gemini-cli": "gemini-cli",
  "github-copilot-cli": "github-copilot",
  goose: "goose",
  "grok-build": "grok",
  "kilo-code": "kilo",
  "kimi-code": "kimi-code-cli",
  "kiro-cli": "kiro-cli",
  opencode: "opencode",
  pi: "pi",
  windsurf: "windsurf",
  zed: "zed",
};

function exitOnCancel<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as T;
}

async function resolveKey(selected: AgentType[]): Promise<string> {
  const found: { agent: AgentType; key: string }[] = [];
  for (const a of await listInstalledServers({ global: true, agents: selected })) {
    if (a.error) continue;
    const env = a.servers.find((s) => s.serverName === SERVER)?.config.env as
      | Record<string, unknown>
      | undefined;
    const key = env?.ROBINHOOD_TOKEN_KEY;
    if (typeof key === "string" && key) found.push({ agent: a.agentType, key });
  }

  const first = found[0];
  if (!first) {
    if (existsSync(officialCredentialPath())) {
      p.log.warn(
        "A saved standard-mode login exists but no existing key was found, so it can't be decrypted with the new key. Ask your agent to log in to Robinhood again.",
      );
    }
    return randomBytes(32).toString("base64");
  }
  const differ = found.filter((f) => f.key !== first.key).map((f) => agents[f.agent].displayName);
  if (differ.length) {
    p.log.warn(
      `ROBINHOOD_TOKEN_KEY differs in ${differ.join(", ")}; overwriting with the key from ${agents[first.agent].displayName}.`,
    );
  }
  return first.key;
}

/** The OpenClaw skill imports the client library through bun, so the workspace needs the package. */
function installOpenclawDep(workspace: string): boolean {
  mkdirSync(workspace, { recursive: true });
  const pkg = join(workspace, "package.json");
  // Without a package.json, bun add walks up and could modify one in a parent directory.
  if (!existsSync(pkg))
    writeFileSync(pkg, `${JSON.stringify({ name: "workspace", private: true }, null, 2)}\n`);
  const r = spawnSync(process.execPath, ["add", "robinhood-for-agents"], {
    cwd: workspace,
    stdio: "inherit",
  });
  return r.status === 0;
}

function skillsCli(): string {
  const pkgJson = fileURLToPath(import.meta.resolve("skills/package.json"));
  const { bin } = JSON.parse(readFileSync(pkgJson, "utf8")) as { bin: { skills: string } };
  return join(dirname(pkgJson), bin.skills);
}

export async function install(opts: { yes: boolean }): Promise<void> {
  p.intro("robinhood-for-agents install");
  let failed = false;

  const detected = await detectGlobalAgents();
  const openclawDir = join(homedir(), ".openclaw");
  const hasOpenclaw = existsSync(openclawDir);
  if (!detected.length && !hasOpenclaw) {
    p.log.error("No supported agent apps found. See `npx add-mcp list-agents` for the list.");
    process.exitCode = 1;
    return;
  }

  const choices: (AgentType | typeof OPENCLAW)[] = hasOpenclaw ? [...detected, OPENCLAW] : detected;
  const chosen = opts.yes
    ? choices
    : exitOnCancel(
        await p.multiselect({
          message: "Install into which agent apps?",
          options: choices.map((t) => ({
            value: t,
            label: t === OPENCLAW ? "OpenClaw (skill only)" : agents[t].displayName,
          })),
          initialValues: choices,
          required: true,
        }),
      );
  const openclaw = chosen.includes(OPENCLAW);
  const selected = chosen.filter((t): t is AgentType => t !== OPENCLAW);

  const web =
    opts.yes || !selected.length
      ? false
      : exitOnCancel(
          await p.confirm({
            message:
              "Also add web mode (robinhood-web)? It uses the unofficial web API and a Chrome login.",
            initialValue: false,
          }),
        );

  const key = selected.length ? await resolveKey(selected) : "";

  for (const agent of selected) {
    const name = agents[agent].displayName;
    const results = [
      upsertServer(agent, SERVER, {
        command: "bunx",
        args: ["robinhood-for-agents"],
        env: { ROBINHOOD_TOKEN_KEY: key },
      }),
    ];
    if (web) {
      results.push(
        upsertServer(agent, WEB_SERVER, {
          command: "bunx",
          args: ["robinhood-for-agents", "--mode", "web"],
        }),
      );
    }
    for (const r of results) {
      if (r.success) p.log.success(`${name}: ${r.path}`);
      else {
        failed = true;
        p.log.error(`${name}: ${r.error ?? "failed"} (${r.path})`);
      }
    }
    // The pre-4.0 entry name; its old command no longer runs.
    if (agent === "claude-code") removeServer(agent, "robinhood-agent");
  }

  const skillAgents: string[] = [];
  for (const agent of selected) {
    const id = SKILLS_AGENT[agent];
    if (id) skillAgents.push(id);
    else p.log.info(`${agents[agent].displayName}: no skills support, skill not installed.`);
  }
  if (openclaw) skillAgents.push(OPENCLAW);
  if (skillAgents.length) {
    // --copy: the source is the bunx/npx cache; symlinks into it dangle once it is evicted.
    const r = spawnSync(
      process.execPath,
      [skillsCli(), "add", skillsDir(), "-g", "-y", "--copy", "--agent", ...skillAgents],
      { stdio: "inherit", env: { ...process.env, DISABLE_TELEMETRY: "1" } },
    );
    if (r.status !== 0) {
      failed = true;
      p.log.error(`skills add failed (exit ${r.status ?? r.signal ?? r.error?.message}).`);
    }
  }

  if (openclaw && !installOpenclawDep(join(openclawDir, "workspace"))) {
    failed = true;
    p.log.error("OpenClaw: `bun add robinhood-for-agents` in the workspace failed.");
  }

  if (failed) process.exitCode = 1;
  const apps = [
    ...selected.map((a) => agents[a].displayName),
    ...(openclaw ? ["OpenClaw"] : []),
  ].join(", ");
  p.outro(
    `Restart ${apps}, then ask your agent: "log in to Robinhood".${web ? " For web mode, ask it to run robinhood_browser_login." : ""}`,
  );
}
