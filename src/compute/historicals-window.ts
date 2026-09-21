/**
 * Maps an absolute [start_time, end_time] bar request (the official MCP's shape)
 * onto the REST `/quotes/historicals/` span/interval grid, which is anchored at
 * "now" and only accepts the combinations below (docs/robinhood-api-reference.md
 * §8 in the robinhood_for_agents fork: "Interval / Span Compatibility").
 */

const SPANS: ReadonlyArray<readonly [span: string, days: number, intervals: readonly string[]]> = [
  ["day", 1, ["minute", "5minute", "10minute"]],
  ["week", 7, ["10minute", "hour"]],
  ["month", 31, ["hour", "day"]],
  ["3month", 92, ["day"]],
  ["year", 366, ["day", "week"]],
  ["5year", 1827, ["week"]],
  ["all", Number.POSITIVE_INFINITY, ["week"]],
];

export const REST_INTERVALS = ["minute", "5minute", "10minute", "hour", "day", "week"] as const;

export interface Window {
  span: string;
  interval: string;
  startMs: number;
  endMs: number;
}

function parseTime(value: string, name: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`${name} must be an RFC3339 timestamp, got "${value}".`);
  return ms;
}

/**
 * Smallest REST span that reaches back to `startTime` and serves `interval`
 * (or, with no interval, that span's finest allowed interval). Throws when no REST
 * combination can serve the request, rather than returning a shorter range.
 */
export function resolveWindow(
  startTime: string,
  endTime: string | undefined,
  interval: string | undefined,
  opts: { allowed?: readonly string[]; nowMs?: number } = {},
): Window {
  const allowed = opts.allowed ?? REST_INTERVALS;
  const nowMs = opts.nowMs ?? Date.now();
  const startMs = parseTime(startTime, "start_time");
  const endMs = endTime === undefined ? nowMs : parseTime(endTime, "end_time");
  if (startMs > nowMs) throw new Error("start_time is in the future.");
  if (startMs > endMs) throw new Error("start_time must be before end_time.");
  if (interval !== undefined && !allowed.includes(interval)) {
    throw new Error(
      `interval "${interval}" is not served by the REST historicals endpoint; use one of ${allowed.join(", ")}.`,
    );
  }
  const days = (nowMs - startMs) / 86_400_000;
  for (const [span, spanDays, intervals] of SPANS) {
    if (spanDays < days) continue;
    const pick = interval ?? intervals.find((i) => allowed.includes(i));
    if (pick !== undefined && intervals.includes(pick))
      return { span, interval: pick, startMs, endMs };
  }
  const longest = SPANS.filter(([, , i]) => interval && i.includes(interval)).at(-1);
  throw new Error(
    `interval "${interval}" cannot reach back to start_time over REST (it covers at most the last ${longest?.[0]}); use a later start_time or a coarser interval.`,
  );
}

/** Keep bars whose `begins_at` falls in [startMs, endMs]. */
export function inWindow<T extends { begins_at: string }>(bars: readonly T[], w: Window): T[] {
  return bars.filter((b) => {
    const t = Date.parse(b.begins_at);
    return t >= w.startMs && t <= w.endMs;
  });
}
