import { describe, expect, it } from "vitest";
import { inWindow, resolveWindow } from "../../src/compute/historicals-window.js";

const NOW = Date.parse("2026-09-18T16:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const at = (start: string, interval?: string) =>
  resolveWindow(start, undefined, interval, { nowMs: NOW });

describe("resolveWindow", () => {
  it("picks the smallest span that reaches start_time and serves the interval", () => {
    expect(at(ago(2))).toMatchObject({ span: "day", interval: "minute" });
    expect(at(ago(2), "hour")).toMatchObject({ span: "week", interval: "hour" });
    expect(at(ago(24 * 100), "day")).toMatchObject({ span: "year", interval: "day" });
    expect(at(ago(24 * 365 * 10))).toMatchObject({ span: "all", interval: "week" });
  });

  it("honours an allowed-interval list when auto-selecting", () => {
    const w = resolveWindow(ago(2), undefined, undefined, {
      nowMs: NOW,
      allowed: ["5minute", "hour"],
    });
    expect(w).toMatchObject({ span: "day", interval: "5minute" });
  });

  it("rejects what REST cannot serve instead of shortening the range", () => {
    expect(() => at(ago(72), "minute")).toThrow(/cannot reach back/);
    expect(() => at(ago(2), "30minute")).toThrow(/not served/);
    expect(() => at("yesterday")).toThrow(/RFC3339/);
    expect(() => at(new Date(NOW + 1000).toISOString())).toThrow(/future/);
  });

  it("inWindow keeps bars inside [start, end]", () => {
    const w = resolveWindow(ago(2), ago(1), undefined, { nowMs: NOW });
    const bars = [ago(3), ago(1.5), ago(0.5)].map((begins_at) => ({ begins_at }));
    expect(inWindow(bars, w)).toEqual([{ begins_at: ago(1.5) }]);
  });
});
