import { describe, expect, it, vi } from "vitest";
import { binPath } from "../../src/server/cli/paths.js";

const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

describe("installMcp", () => {
  it("removes existing entry then adds via claude CLI", async () => {
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    // First call: remove existing
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "claude",
      ["mcp", "remove", "robinhood-for-agents"],
      {
        stdio: "pipe",
      },
    );

    // Second call: add new
    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(
      expect.arrayContaining([
        "mcp",
        "add",
        "-s",
        "user",
        "robinhood-for-agents",
        "--",
        "bun",
        "run",
      ]),
    );
    expect(addCall[2]).toEqual({ stdio: "pipe" });
    expect((addCall[1] as string[]).slice(-2)).toEqual(["--mode", "standard"]);
  });

  it("agent mode registers robinhood-agent with --mode agent", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("agent");

    expect(execFileSyncMock.mock.calls[0]).toEqual([
      "claude",
      ["mcp", "remove", "robinhood-agent"],
      { stdio: "pipe" },
    ]);
    expect(execFileSyncMock.mock.calls[1]).toEqual([
      "claude",
      [
        "mcp",
        "add",
        "-s",
        "user",
        "robinhood-agent",
        "--",
        "bun",
        "run",
        binPath(),
        "--mode",
        "agent",
      ],
      { stdio: "pipe" },
    ]);
  });

  it("continues when remove throws (entry not found)", async () => {
    execFileSyncMock.mockReset();
    // First call (remove) throws, second call (add) succeeds
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error("not found");
      })
      .mockReturnValueOnce(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    // Should still call add despite remove failing
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    expect(addCall[0]).toBe("claude");
    expect(addCall[1]).toEqual(expect.arrayContaining(["mcp", "add"]));
  });

  it("uses the correct bin path", async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(Buffer.from(""));

    const { installMcp } = await import("../../src/server/cli/install-mcp.js");
    installMcp("standard");

    const addCall = execFileSyncMock.mock.calls[1] as unknown[];
    const args = addCall[1] as string[];
    expect(args).toContain(binPath());
  });
});
