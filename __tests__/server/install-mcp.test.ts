import { describe, expect, it, vi } from "vitest";
import { binPath } from "../../src/server/cli/paths.js";

const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

describe("installMcp", () => {
  it("removes the entry and the legacy robinhood-agent, then adds via claude CLI", async () => {
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("web");

    expect(execFileSyncMock.mock.calls[0]).toEqual([
      "claude",
      ["mcp", "remove", "robinhood-web"],
      { stdio: "pipe" },
    ]);
    expect(execFileSyncMock.mock.calls[1]).toEqual([
      "claude",
      ["mcp", "remove", "robinhood-agent"],
      { stdio: "pipe" },
    ]);

    const addCall = execFileSyncMock.mock.calls[2] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(
      expect.arrayContaining(["mcp", "add", "-s", "user", "robinhood-web", "--", "bun", "run"]),
    );
    expect(addCall[2]).toEqual({ stdio: "pipe" });
    expect((addCall[1] as string[]).slice(-2)).toEqual(["--mode", "web"]);
  });

  it("standard mode registers robinhood-for-agents with --mode standard", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    expect(execFileSyncMock.mock.calls[0]).toEqual([
      "claude",
      ["mcp", "remove", "robinhood-for-agents"],
      { stdio: "pipe" },
    ]);
    expect(execFileSyncMock.mock.calls[2]).toEqual([
      "claude",
      [
        "mcp",
        "add",
        "-s",
        "user",
        "robinhood-for-agents",
        "--",
        "bun",
        "run",
        binPath(),
        "--mode",
        "standard",
      ],
      { stdio: "pipe" },
    ]);
  });

  it("continues when remove throws (entry not found)", async () => {
    execFileSyncMock.mockReset();
    const notFound = () => {
      throw new Error("not found");
    };
    execFileSyncMock
      .mockImplementationOnce(notFound)
      .mockImplementationOnce(notFound)
      .mockReturnValueOnce(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    expect(execFileSyncMock).toHaveBeenCalledTimes(3);
    const addCall = execFileSyncMock.mock.calls[2] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(expect.arrayContaining(["mcp", "add"]));
  });

  it("uses the correct bin path", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    const addCall = execFileSyncMock.mock.calls[2] as unknown[];
    const args = addCall[1] as string[];
    expect(args).toContain(binPath());
  });
});
