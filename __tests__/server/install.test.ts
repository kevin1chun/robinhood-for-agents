import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const detectGlobalAgents = vi.fn();
const listInstalledServers = vi.fn();
const upsertServer = vi.fn();
const removeServer = vi.fn();
const spawnSync = vi.fn();
const confirm = vi.fn();

vi.mock("add-mcp", () => ({
  agents: new Proxy({}, { get: (_, id) => ({ displayName: `App(${String(id)})` }) }),
  detectGlobalAgents,
  listInstalledServers,
  removeServer,
  upsertServer,
}));
vi.mock("node:child_process", () => ({ spawnSync }));
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: () => false,
  multiselect: vi.fn(async (o: { initialValues: string[] }) => o.initialValues),
  confirm,
  log: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { install } = await import("../../src/server/cli/install.js");

function installed(agentType: string, key?: string) {
  return {
    agentType,
    servers: key
      ? [{ serverName: "robinhood-for-agents", config: { env: { ROBINHOOD_TOKEN_KEY: key } } }]
      : [],
  };
}

function keysWritten(): string[] {
  return upsertServer.mock.calls
    .filter((c) => c[1] === "robinhood-for-agents")
    .map((c) => c[2].env.ROBINHOOD_TOKEN_KEY);
}

let home: string;

beforeEach(() => {
  vi.clearAllMocks();
  home = mkdtempSync(join(tmpdir(), "rh-install-test-"));
  vi.stubEnv("HOME", home);
  removeServer.mockReturnValue({ success: true, path: "/claude-code", removed: false });
  process.exitCode = undefined;
  detectGlobalAgents.mockResolvedValue(["claude-code", "cursor"]);
  listInstalledServers.mockResolvedValue([installed("claude-code"), installed("cursor")]);
  upsertServer.mockImplementation((agent: string) => ({ success: true, path: `/${agent}` }));
  spawnSync.mockReturnValue({ status: 0 });
});

afterEach(() => {
  process.exitCode = undefined;
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("install", () => {
  it("generates one 32-byte base64 key when none is installed", async () => {
    await install({ yes: true });
    const keys = keysWritten();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(Buffer.from(keys[0] as string, "base64")).toHaveLength(32);
    expect(upsertServer).toHaveBeenCalledWith("claude-code", "robinhood-for-agents", {
      command: "bunx",
      args: ["robinhood-for-agents"],
      env: { ROBINHOOD_TOKEN_KEY: keys[0] },
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("reuses an existing key", async () => {
    listInstalledServers.mockResolvedValue([
      { ...installed("claude-code"), error: "unreadable" },
      installed("cursor", "EXISTING_KEY"),
    ]);
    await install({ yes: true });
    expect(keysWritten()).toEqual(["EXISTING_KEY", "EXISTING_KEY"]);
  });

  it("omits the web entry under -y", async () => {
    await install({ yes: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(upsertServer.mock.calls.some((c) => c[1] === "robinhood-web")).toBe(false);
  });

  it("adds the web entry when confirmed", async () => {
    confirm.mockResolvedValue(true);
    await install({ yes: false });
    expect(upsertServer).toHaveBeenCalledWith("cursor", "robinhood-web", {
      command: "bunx",
      args: ["robinhood-for-agents", "--mode", "web"],
    });
  });

  it("copies the skill globally to mapped agents and skips unmapped ones", async () => {
    detectGlobalAgents.mockResolvedValue(["claude-code", "claude-desktop", "grok-build"]);
    await install({ yes: true });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const args = spawnSync.mock.calls[0]?.[1] as string[];
    expect(args[0]).toMatch(/skills[/\\]bin[/\\]cli\.mjs$/);
    expect(args[1]).toBe("add");
    expect(args[2]).toMatch(/[/\\]skills$/);
    expect(args).toContain("-g");
    expect(args).toContain("--copy");
    expect(args.slice(args.indexOf("--agent") + 1)).toEqual(["claude-code", "grok"]);
    expect(spawnSync.mock.calls[0]?.[2].env.DISABLE_TELEMETRY).toBe("1");
  });

  it("removes the pre-4.0 robinhood-agent entry from Claude Code only", async () => {
    await install({ yes: true });
    expect(removeServer).toHaveBeenCalledTimes(1);
    expect(removeServer).toHaveBeenCalledWith("claude-code", "robinhood-agent");
    expect(process.exitCode).toBeUndefined();
  });

  it("installs the OpenClaw skill and workspace dependency when ~/.openclaw exists", async () => {
    mkdirSync(join(home, ".openclaw"));
    await install({ yes: true });
    const skillsArgs = spawnSync.mock.calls[0]?.[1] as string[];
    expect(skillsArgs.slice(skillsArgs.indexOf("--agent") + 1)).toEqual([
      "claude-code",
      "cursor",
      "openclaw",
    ]);
    const workspace = join(home, ".openclaw", "workspace");
    expect(spawnSync.mock.calls[1]?.[1]).toEqual(["add", "robinhood-for-agents"]);
    expect(spawnSync.mock.calls[1]?.[2].cwd).toBe(workspace);
    expect(JSON.parse(readFileSync(join(workspace, "package.json"), "utf8")).private).toBe(true);
    expect(upsertServer.mock.calls.some((c) => c[0] === "openclaw")).toBe(false);
  });

  it("keeps going when one agent fails, then exits 1", async () => {
    upsertServer.mockImplementation((agent: string) =>
      agent === "claude-code"
        ? { success: false, path: "/claude-code", error: "boom" }
        : { success: true, path: `/${agent}` },
    );
    await install({ yes: true });
    expect(upsertServer).toHaveBeenCalledWith("cursor", "robinhood-for-agents", expect.anything());
    expect(spawnSync).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
