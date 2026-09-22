import { describe, expect, it } from "vitest";
import { resolveMode } from "../../src/server/mode.js";

describe("resolveMode", () => {
  it("the flag wins over the env", () => {
    expect(resolveMode(["--mode", "web"], { ROBINHOOD_MODE: "standard" })).toBe("web");
  });

  it("the env wins over the default", () => {
    expect(resolveMode([], { ROBINHOOD_MODE: "web" })).toBe("web");
    expect(resolveMode([], {})).toBe("standard");
  });

  it("takes --mode=web", () => {
    expect(resolveMode(["--mode=web"], {})).toBe("web");
  });

  it("throws on an unknown value, naming the accepted ones", () => {
    expect(() => resolveMode(["--mode", "both"], {})).toThrow(/standard, web/);
    expect(() => resolveMode([], { ROBINHOOD_MODE: "x" })).toThrow(/standard, web/);
  });

  it("rejects the pre-4.0 value agent with a hint", () => {
    const hint = /renamed in 4.0.0.*"standard".*"web"/;
    expect(() => resolveMode(["--mode", "agent"], {})).toThrow(hint);
    expect(() => resolveMode([], { ROBINHOOD_MODE: "agent" })).toThrow(hint);
  });
});
