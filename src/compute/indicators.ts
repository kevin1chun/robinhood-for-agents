/**
 * Technical indicators over OHLCV bars (no I/O). Standard textbook definitions:
 * EMA seeded with the SMA of its first `period` values, Wilder smoothing for
 * RSI/ATR/ADX, population standard deviation for Bollinger bands. A point
 * without enough history is null, never extrapolated.
 */

export interface Bar {
  begins_at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Series = Array<number | null>;
export type Values = Record<string, Series>;

export const INDICATOR_TYPES = [
  "ema",
  "sma",
  "rsi",
  "momentum",
  "roc",
  "cci",
  "williams_r",
  "atr",
  "mfi",
  "adx",
  "donchian_channels",
  "bollinger_bands",
  "macd",
  "keltner_channels",
  "supertrend",
  "vwap",
  "obv",
  "pivot_points",
] as const;
export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export interface Params {
  period?: number;
  num_std?: number;
  multiplier?: number;
  fast_period?: number;
  slow_period?: number;
  signal_period?: number;
  method?: string;
}

/** Accepted parameters and their defaults, per type. */
export const DEFAULTS: Record<IndicatorType, Params> = {
  ema: { period: 9 },
  sma: { period: 9 },
  rsi: { period: 14 },
  cci: { period: 14 },
  atr: { period: 14 },
  mfi: { period: 14 },
  williams_r: { period: 10 },
  adx: { period: 10 },
  momentum: { period: 12 },
  roc: { period: 14 },
  donchian_channels: { period: 20 },
  bollinger_bands: { period: 20, num_std: 2 },
  macd: { fast_period: 12, slow_period: 26, signal_period: 9 },
  keltner_channels: { period: 20, multiplier: 2 },
  supertrend: { period: 10, multiplier: 3 },
  pivot_points: { method: "classic" },
  vwap: {},
  obv: {},
};

/** Merge caller params over the type's defaults; reject any the type does not accept. */
export function resolveParams(type: IndicatorType, given: Params): Params {
  const defaults = DEFAULTS[type];
  for (const [k, v] of Object.entries(given)) {
    if (v === undefined || v === null) continue;
    if (!(k in defaults)) throw new Error(`${type} does not accept ${k}.`);
  }
  if (type === "pivot_points" && given.method !== undefined && given.method !== "classic") {
    throw new Error('pivot_points supports only method "classic".');
  }
  const merged: Params = { ...defaults };
  for (const [k, v] of Object.entries(given)) {
    if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
  }
  for (const k of ["period", "fast_period", "slow_period", "signal_period"] as const) {
    const v = merged[k];
    if (v !== undefined && (!Number.isInteger(v) || v < 1)) {
      throw new Error(`${k} must be a positive integer.`);
    }
  }
  return merged;
}

function sma(xs: Series, n: number): Series {
  const out: Series = xs.map(() => null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x === null || x === undefined) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += x;
    count++;
    if (count > n) sum -= xs[i - n] as number;
    if (count >= n) out[i] = sum / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first `n` non-null values. */
function ema(xs: Series, n: number): Series {
  const out: Series = xs.map(() => null);
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x === null || x === undefined) continue;
    if (prev === null) {
      seed.push(x);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
        seed = [];
      }
      continue;
    }
    prev = x * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder smoothing: first value is the mean of the first `n`, then (prev*(n-1)+x)/n. */
function wilder(xs: Series, n: number): Series {
  const out: Series = xs.map(() => null);
  let prev: number | null = null;
  const seed: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x === null || x === undefined) continue;
    if (prev === null) {
      seed.push(x);
      if (seed.length === n) {
        prev = seed.reduce((a, b) => a + b, 0) / n;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (n - 1) + x) / n;
    out[i] = prev;
  }
  return out;
}

function rolling(bars: readonly Bar[], n: number, f: (w: readonly Bar[]) => number | null): Series {
  return bars.map((_, i) => (i + 1 < n ? null : f(bars.slice(i + 1 - n, i + 1))));
}

function trueRange(bars: readonly Bar[]): Series {
  return bars.map((b, i) => {
    const prev = bars[i - 1];
    if (!prev) return b.high - b.low;
    return Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  });
}

function nyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function compute(type: IndicatorType, bars: readonly Bar[], p: Params): Values {
  const close: Series = bars.map((b) => b.close);
  const n = p.period ?? 0;
  switch (type) {
    case "sma":
      return { value: sma(close, n) };
    case "ema":
      return { value: ema(close, n) };
    case "momentum":
      return { value: bars.map((b, i) => (i < n ? null : b.close - (bars[i - n] as Bar).close)) };
    case "roc":
      return {
        value: bars.map((b, i) =>
          i < n ? null : 100 * (b.close / (bars[i - n] as Bar).close - 1),
        ),
      };
    case "rsi": {
      const gain: Series = bars.map((b, i) =>
        i === 0 ? null : Math.max(b.close - (bars[i - 1] as Bar).close, 0),
      );
      const loss: Series = bars.map((b, i) =>
        i === 0 ? null : Math.max((bars[i - 1] as Bar).close - b.close, 0),
      );
      const g = wilder(gain, n);
      const l = wilder(loss, n);
      return {
        value: g.map((gv, i) => {
          const lv = l[i];
          if (gv === null || lv === null || lv === undefined) return null;
          return lv === 0 ? 100 : 100 - 100 / (1 + gv / lv);
        }),
      };
    }
    case "cci":
      return {
        value: rolling(bars, n, (w) => {
          const tp = w.map((b) => (b.high + b.low + b.close) / 3);
          const mean = tp.reduce((a, b) => a + b, 0) / n;
          const dev = tp.reduce((a, b) => a + Math.abs(b - mean), 0) / n;
          return dev === 0 ? 0 : ((tp.at(-1) as number) - mean) / (0.015 * dev);
        }),
      };
    case "williams_r":
      return {
        value: rolling(bars, n, (w) => {
          const hh = Math.max(...w.map((b) => b.high));
          const ll = Math.min(...w.map((b) => b.low));
          return hh === ll ? null : (-100 * (hh - (w.at(-1) as Bar).close)) / (hh - ll);
        }),
      };
    case "atr":
      return { value: wilder(trueRange(bars), n) };
    case "mfi":
      return {
        value: bars.map((_, i) => {
          if (i < n) return null;
          let pos = 0;
          let neg = 0;
          for (let j = i + 1 - n; j <= i; j++) {
            const b = bars[j] as Bar;
            const a = bars[j - 1] as Bar;
            const tp = (b.high + b.low + b.close) / 3;
            const prevTp = (a.high + a.low + a.close) / 3;
            if (tp > prevTp) pos += tp * b.volume;
            else if (tp < prevTp) neg += tp * b.volume;
          }
          return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
        }),
      };
    case "adx": {
      const plusDm: Series = bars.map((b, i) => {
        const a = bars[i - 1];
        if (!a) return null;
        const up = b.high - a.high;
        const down = a.low - b.low;
        return up > down && up > 0 ? up : 0;
      });
      const minusDm: Series = bars.map((b, i) => {
        const a = bars[i - 1];
        if (!a) return null;
        const up = b.high - a.high;
        const down = a.low - b.low;
        return down > up && down > 0 ? down : 0;
      });
      const tr = trueRange(bars).map((t, i) => (i === 0 ? null : t));
      const atr = wilder(tr, n);
      const pdm = wilder(plusDm, n);
      const mdm = wilder(minusDm, n);
      const plusDi = atr.map((a, i) => (a === null || !a ? null : (100 * (pdm[i] as number)) / a));
      const minusDi = atr.map((a, i) => (a === null || !a ? null : (100 * (mdm[i] as number)) / a));
      const dx: Series = plusDi.map((pd, i) => {
        const md = minusDi[i];
        if (pd === null || md === null || md === undefined) return null;
        return pd + md === 0 ? 0 : (100 * Math.abs(pd - md)) / (pd + md);
      });
      return { adx: wilder(dx, n), plus_di: plusDi, minus_di: minusDi };
    }
    case "donchian_channels": {
      const upper = rolling(bars, n, (w) => Math.max(...w.map((b) => b.high)));
      const lower = rolling(bars, n, (w) => Math.min(...w.map((b) => b.low)));
      return {
        upper,
        middle: upper.map((u, i) => (u === null ? null : (u + (lower[i] as number)) / 2)),
        lower,
      };
    }
    case "bollinger_bands": {
      const k = p.num_std ?? 2;
      const middle = sma(close, n);
      const sd = rolling(bars, n, (w) => {
        const mean = w.reduce((a, b) => a + b.close, 0) / n;
        return Math.sqrt(w.reduce((a, b) => a + (b.close - mean) ** 2, 0) / n);
      });
      return {
        upper: middle.map((m, i) => (m === null ? null : m + k * (sd[i] as number))),
        middle,
        lower: middle.map((m, i) => (m === null ? null : m - k * (sd[i] as number))),
      };
    }
    case "macd": {
      const fast = ema(close, p.fast_period ?? 12);
      const slow = ema(close, p.slow_period ?? 26);
      const macd: Series = fast.map((f, i) => {
        const s = slow[i];
        return f === null || s === null || s === undefined ? null : f - s;
      });
      const signal = ema(macd, p.signal_period ?? 9);
      return {
        macd,
        signal,
        histogram: macd.map((m, i) => {
          const s = signal[i];
          return m === null || s === null || s === undefined ? null : m - s;
        }),
      };
    }
    case "keltner_channels": {
      const m = p.multiplier ?? 2;
      const middle = ema(close, n);
      const atr = wilder(trueRange(bars), n);
      const band = (sign: number): Series =>
        middle.map((mid, i) => {
          const a = atr[i];
          return mid === null || a === null || a === undefined ? null : mid + sign * m * a;
        });
      return { upper: band(1), middle, lower: band(-1) };
    }
    case "supertrend": {
      const m = p.multiplier ?? 3;
      const atr = wilder(trueRange(bars), n);
      const value: Series = bars.map(() => null);
      const direction: Series = bars.map(() => null);
      let upper = 0;
      let lower = 0;
      let dir = 1;
      let started = false;
      for (let i = 0; i < bars.length; i++) {
        const a = atr[i];
        const b = bars[i] as Bar;
        if (a === null || a === undefined) continue;
        const hl2 = (b.high + b.low) / 2;
        const basicUpper = hl2 + m * a;
        const basicLower = hl2 - m * a;
        const prevClose = (bars[i - 1] ?? b).close;
        if (!started) {
          upper = basicUpper;
          lower = basicLower;
          dir = b.close >= hl2 ? 1 : -1;
          started = true;
        } else {
          upper = basicUpper < upper || prevClose > upper ? basicUpper : upper;
          lower = basicLower > lower || prevClose < lower ? basicLower : lower;
          if (dir === 1 && b.close < lower) dir = -1;
          else if (dir === -1 && b.close > upper) dir = 1;
        }
        value[i] = dir === 1 ? lower : upper;
        direction[i] = dir;
      }
      return { value, direction };
    }
    case "vwap": {
      let day = "";
      let pv = 0;
      let vol = 0;
      return {
        value: bars.map((b) => {
          const d = nyDate(b.begins_at);
          if (d !== day) {
            day = d;
            pv = 0;
            vol = 0;
          }
          pv += ((b.high + b.low + b.close) / 3) * b.volume;
          vol += b.volume;
          return vol === 0 ? null : pv / vol;
        }),
      };
    }
    case "obv": {
      let obv = 0;
      return {
        value: bars.map((b, i) => {
          const a = bars[i - 1];
          if (a) obv += b.close > a.close ? b.volume : b.close < a.close ? -b.volume : 0;
          return obv;
        }),
      };
    }
    case "pivot_points": {
      // Classic floor pivots from the previous bar's high/low/close.
      const keys = ["pp", "r1", "r2", "r3", "s1", "s2", "s3"] as const;
      const out: Values = Object.fromEntries(keys.map((k) => [k, bars.map(() => null)]));
      for (let i = 1; i < bars.length; i++) {
        const { high: h, low: l, close: c } = bars[i - 1] as Bar;
        const pp = (h + l + c) / 3;
        const row = {
          pp,
          r1: 2 * pp - l,
          s1: 2 * pp - h,
          r2: pp + (h - l),
          s2: pp - (h - l),
          r3: h + 2 * (pp - l),
          s3: l - 2 * (h - pp),
        };
        for (const k of keys) (out[k] as Series)[i] = row[k];
      }
      return out;
    }
  }
}
