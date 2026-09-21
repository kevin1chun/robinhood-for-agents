import { describe, expect, it } from "vitest";
import { type Bar, compute, resolveParams } from "../../src/compute/indicators.js";

/** Hand-computed golden vectors on synthetic bars. */
function bars(rows: Array<[h: number, l: number, c: number, v?: number, day?: string]>): Bar[] {
  return rows.map(([high, low, close, volume = 0, day = "2026-01-05"], i) => ({
    begins_at: `${day}T${String(14 + i).padStart(2, "0")}:00:00Z`,
    open: close,
    high,
    low,
    close,
    volume,
  }));
}
const closes = (cs: number[]) => bars(cs.map((c) => [c, c, c]));

describe("indicators", () => {
  it("sma / ema / momentum / roc", () => {
    const b = closes([1, 2, 3, 4, 5]);
    expect(compute("sma", b, { period: 3 }).value).toEqual([null, null, 2, 3, 4]);
    expect(compute("ema", b, { period: 3 }).value).toEqual([null, null, 2, 3, 4]);
    expect(compute("momentum", closes([1, 2, 4, 8]), { period: 2 }).value).toEqual([
      null,
      null,
      3,
      6,
    ]);
    expect(compute("roc", closes([1, 2, 4]), { period: 1 }).value).toEqual([null, 100, 100]);
  });

  it("rsi is 100 on a monotonic rise", () => {
    expect(compute("rsi", closes([1, 2, 3, 4]), { period: 2 }).value).toEqual([
      null,
      null,
      100,
      100,
    ]);
  });

  it("atr uses Wilder smoothing of the true range", () => {
    const b = bars([
      [10, 8, 9],
      [12, 9, 11],
      [11, 10, 10],
    ]);
    expect(compute("atr", b, { period: 2 }).value).toEqual([null, 2.5, 1.75]);
  });

  it("bollinger bands use the population standard deviation", () => {
    const r = compute("bollinger_bands", closes([1, 3]), { period: 2, num_std: 1 });
    expect([r.upper?.[1], r.middle?.[1], r.lower?.[1]]).toEqual([3, 2, 1]);
  });

  it("macd histogram is macd minus signal", () => {
    const r = compute("macd", closes([1, 2, 3]), {
      fast_period: 1,
      slow_period: 2,
      signal_period: 1,
    });
    expect(r.macd).toEqual([null, 0.5, 0.5]);
    expect(r.histogram).toEqual([null, 0, 0]);
  });

  it("obv, vwap (daily reset) and classic pivots", () => {
    const b = bars([
      [1, 1, 1, 10],
      [2, 2, 2, 20],
      [1, 1, 1, 30],
      [1, 1, 1, 40],
    ]);
    expect(compute("obv", b, {}).value).toEqual([0, 20, -10, -10]);

    const v = [
      ...bars([
        [11, 9, 10, 1],
        [21, 19, 20, 3],
      ]),
      ...bars([[6, 4, 5, 1]]),
    ];
    v[2] = { ...(v[2] as Bar), begins_at: "2026-01-06T15:00:00Z" };
    expect(compute("vwap", v, {}).value).toEqual([10, 17.5, 5]);

    const p = compute(
      "pivot_points",
      bars([
        [12, 8, 10],
        [1, 1, 1],
      ]),
      {},
    );
    expect([p.pp, p.r1, p.s1, p.r2, p.s2, p.r3, p.s3].map((s) => s?.[1])).toEqual([
      10, 12, 8, 14, 6, 16, 4,
    ]);
  });

  it("resolveParams applies defaults and rejects foreign parameters", () => {
    expect(resolveParams("macd", {})).toEqual({
      fast_period: 12,
      slow_period: 26,
      signal_period: 9,
    });
    expect(resolveParams("rsi", { period: 5 })).toEqual({ period: 5 });
    expect(() => resolveParams("sma", { num_std: 2 })).toThrow(/does not accept num_std/);
    expect(() => resolveParams("pivot_points", { method: "fib" })).toThrow(/classic/);
    expect(() => resolveParams("ema", { period: 0 })).toThrow(/positive integer/);
  });
});
