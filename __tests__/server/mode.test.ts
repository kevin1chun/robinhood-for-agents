import { describe, expect, it } from "vitest";
import { resolveMode } from "../../src/server/mode.js";

describe("resolveMode", () => {
  it("the flag wins over the env", () => {
    expect(resolveMode(["--mode", "agent"], { ROBINHOOD_MODE: "standard" })).toBe("agent");
  });

  it("the env wins over the default", () => {
    expect(resolveMode([], { ROBINHOOD_MODE: "agent" })).toBe("agent");
    expect(resolveMode([], {})).toBe("standard");
  });

  it("takes --mode=agent", () => {
    expect(resolveMode(["--mode=agent"], {})).toBe("agent");
  });

  it("throws on an unknown value, naming the accepted ones", () => {
    expect(() => resolveMode(["--mode", "both"], {})).toThrow(/agent, standard/);
    expect(() => resolveMode([], { ROBINHOOD_MODE: "x" })).toThrow(/agent, standard/);
  });
});
