/** Stock data tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { inWindow, resolveWindow } from "../../compute/historicals-window.js";
import { type Bar, compute, INDICATOR_TYPES, resolveParams } from "../../compute/indicators.js";
import { getAuthenticatedRh, stringEnum, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

function upper(symbols: string[]): string[] {
  return symbols.map((s) => s.trim().toUpperCase());
}

/** 'series' → all points; 'latest' → 1; 'last:N' → N. */
function parseOutput(output: string | undefined): number | undefined {
  if (output === undefined || output === "series") return undefined;
  if (output === "latest") return 1;
  const m = /^last:(\d+)$/.exec(output);
  if (m && Number(m[1]) > 0) return Number(m[1]);
  throw new Error(`output must be 'series', 'latest', or 'last:N', got "${output}".`);
}

function etToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function registerStockTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_equity_quotes",
    {
      title: "Get Equity Quotes",
      description:
        "Get a live quote plus fundamentals for one or more stock or index tickers (SPX, NDX, VIX, RUT, XSP supported). Use this when you need the current price. For fundamentals only (no live quote), use robinhood_get_equity_fundamentals.",
      inputSchema: {
        symbols: z
          .array(z.string())
          .min(1)
          .max(100)
          .describe('Ticker symbols, e.g. ["AAPL", "MSFT"].'),
      },
      // Keyed dynamically by uppercased symbol — a raw shape can't express
      // that. z.record() would be the natural fit, but the installed SDK's
      // normalizeObjectSchema() only recognizes actual ZodObject schemas
      // (checks def.type === 'object'); a bare z.record() crashes output
      // validation (its def.type is 'record'). A loose empty object schema
      // IS a ZodObject and validates any key/value shape.
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const symbolList = upper(symbols);
        const quotes = await rh.getQuotes(symbolList);
        const fundamentals = await rh.getFundamentals(symbolList);

        const results: Record<string, unknown> = {};
        for (let i = 0; i < symbolList.length; i++) {
          const sym = symbolList[i] as string;
          const quote = quotes[i];
          if (quote && Object.keys(quote).length > 0) {
            results[sym] = {
              quote,
              fundamentals: fundamentals[i] ?? {},
            };
          } else {
            // Fallback: try index value for symbols like SPX, NDX, VIX
            const indexValue = await rh.getIndexValue(sym);
            if (indexValue) {
              results[sym] = { index_value: indexValue };
            } else {
              results[sym] = { quote: {}, fundamentals: fundamentals[i] ?? {} };
            }
          }
        }
        return structured(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_historicals",
    {
      title: "Get Equity Historicals",
      description:
        "Get OHLCV bars for up to 10 stock tickers over [start_time, end_time]. Served from Robinhood's REST chart endpoint, which is anchored at now: the range is fetched over the smallest chart span that reaches start_time and trimmed to the range. Intervals: minute (last day only), 5minute, 10minute, hour, day, week; omit interval for the finest one available for the range. A range an interval cannot reach is rejected rather than shortened.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).max(10).describe("Stock symbols, up to 10."),
        start_time: z.string().describe("Range start, RFC3339 UTC (e.g. 2026-01-01T00:00:00Z)."),
        end_time: z.string().optional().describe("Range end, RFC3339 UTC. Defaults to now."),
        interval: z
          .string()
          .optional()
          .describe("minute, 5minute, 10minute, hour, day, or week. Omit to auto-select."),
        bounds: stringEnum(["regular", "extended", "trading", "24_7"])
          .optional()
          .describe("Session bounds: regular (default), extended, trading, or 24_7."),
        adjustment_type: stringEnum(["none", "split", "all"])
          .optional()
          .describe("Only 'split' (default) — the chart endpoint serves one adjustment."),
      },
      outputSchema: {
        span: z.string(),
        interval: z.string(),
        bounds: z.string(),
        historicals: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols, start_time, end_time, interval, bounds, adjustment_type }) => {
      try {
        if (adjustment_type !== undefined && adjustment_type !== "split") {
          return textError(
            `adjustment_type "${adjustment_type}" is not available; omit it or pass "split".`,
          );
        }
        const w = resolveWindow(start_time, end_time, interval);
        const b = bounds ?? "regular";
        const rh = await getAuthenticatedRh();
        const data = await rh.getStockHistoricals(upper(symbols), {
          interval: w.interval,
          span: w.span,
          bounds: b,
        });
        return structured({
          span: w.span,
          interval: w.interval,
          bounds: b,
          historicals: data.map((d) => ({ ...d, historicals: inWindow(d.historicals, w) })),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_technical_indicators",
    {
      title: "Get Equity Technical Indicators",
      description:
        "Compute a technical indicator (sma, ema, rsi, momentum, roc, cci, williams_r, atr, mfi, adx, donchian_channels, bollinger_bands, macd, keltner_channels, supertrend, vwap, obv, pivot_points) over one stock's bars in [start_time, end_time]. Computed by this server from the same REST bars robinhood_get_equity_historicals returns (bars before start_time in the fetched span serve as warm-up). Parameters a type does not accept are rejected; omitted ones take the type's default (see each parameter).",
      inputSchema: {
        symbol: z.string().describe("Stock symbol."),
        type: stringEnum(INDICATOR_TYPES).describe("Indicator to compute."),
        interval: z
          .string()
          .describe("Bar interval: minute, 5minute, 10minute, hour, day, or week."),
        start_time: z.string().describe("Range start, RFC3339 UTC."),
        end_time: z.string().optional().describe("Range end, RFC3339 UTC. Defaults to now."),
        bounds: stringEnum(["regular", "extended"])
          .optional()
          .describe("Session bounds: regular (default) or extended."),
        adjustment_type: stringEnum(["none", "split", "all"])
          .optional()
          .describe("Only 'split' (default) — the chart endpoint serves one adjustment."),
        period: z
          .number()
          .int()
          .nullish()
          .describe(
            "Lookback in bars. Defaults: sma/ema 9, rsi/cci/atr/mfi/roc 14, williams_r/adx 10, momentum 12, donchian_channels/bollinger_bands/keltner_channels 20, supertrend 10.",
          ),
        num_std: z.number().nullish().describe("bollinger_bands only (default 2)."),
        multiplier: z
          .number()
          .nullish()
          .describe("keltner_channels (default 2) and supertrend (default 3) only."),
        fast_period: z.number().int().nullish().describe("macd only (default 12)."),
        slow_period: z.number().int().nullish().describe("macd only (default 26)."),
        signal_period: z.number().int().nullish().describe("macd only (default 9)."),
        method: z.string().optional().describe("pivot_points only; 'classic' (the only method)."),
        output: z
          .string()
          .optional()
          .describe("'series' (default), 'latest', or 'last:N' — trims the response only."),
      },
      outputSchema: {
        symbol: z.string(),
        type: z.string(),
        interval: z.string(),
        bounds: z.string(),
        params: z.looseObject({}),
        series: z.array(z.looseObject({ begins_at: z.string() })),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        if (args.adjustment_type !== undefined && args.adjustment_type !== "split") {
          return textError(
            `adjustment_type "${args.adjustment_type}" is not available; omit it or pass "split".`,
          );
        }
        const keep = parseOutput(args.output);
        const params = resolveParams(args.type, {
          period: args.period ?? undefined,
          num_std: args.num_std ?? undefined,
          multiplier: args.multiplier ?? undefined,
          fast_period: args.fast_period ?? undefined,
          slow_period: args.slow_period ?? undefined,
          signal_period: args.signal_period ?? undefined,
          method: args.method,
        });
        const w = resolveWindow(args.start_time, args.end_time, args.interval);
        const bounds = args.bounds ?? "regular";
        const symbol = args.symbol.trim().toUpperCase();
        const rh = await getAuthenticatedRh();
        const [data] = await rh.getStockHistoricals([symbol], {
          interval: w.interval,
          span: w.span,
          bounds,
        });
        const bars: Bar[] = (data?.historicals ?? [])
          .filter((b) => Date.parse(b.begins_at) <= w.endMs && b.close_price != null)
          .map((b) => ({
            begins_at: b.begins_at,
            open: Number(b.open_price),
            high: Number(b.high_price),
            low: Number(b.low_price),
            close: Number(b.close_price),
            volume: b.volume ?? 0,
          }));
        const values = compute(args.type, bars, params);
        const series = bars
          .map((b, i) => ({
            begins_at: b.begins_at,
            ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v[i] ?? null])),
          }))
          .filter((p) => Date.parse(p.begins_at) >= w.startMs);
        return structured({
          symbol,
          type: args.type,
          interval: w.interval,
          bounds,
          params,
          series: keep === undefined ? series : series.slice(-keep),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_fundamentals",
    {
      title: "Get Equity Fundamentals",
      description:
        "Get company fundamentals for up to 10 stocks: float, shares outstanding, market cap, P/E and P/B ratios, dividend schedule, 52-week range, and company profile (sector, industry, CEO, description). Fundamentals only — no live quote; use robinhood_get_equity_quotes if you also need the current price.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).max(10).describe("Stock symbols, up to 10."),
        bounds: stringEnum(["regular", "trading", "extended", "24_5"])
          .optional()
          .describe("Only 'regular' (default) is served over this endpoint."),
      },
      // Keyed dynamically by uppercased symbol — see robinhood_get_equity_quotes
      // for why a loose empty object (not z.record()) is used here.
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async ({ symbols, bounds }) => {
      try {
        if (bounds !== undefined && bounds !== "regular") {
          return textError(`bounds "${bounds}" is not available; omit it or pass "regular".`);
        }
        const rh = await getAuthenticatedRh();
        const symbolList = upper(symbols);
        const fundamentals = await rh.getFundamentals(symbolList);

        const results: Record<string, unknown> = {};
        for (let i = 0; i < symbolList.length; i++) {
          const sym = symbolList[i] as string;
          results[sym] = fundamentals[i] ?? {};
        }
        return structured(results);
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_short_interest",
    {
      title: "Get Short Interest",
      description:
        "Get Robinhood's daily short-interest time series for a stock: modeled shares sold short and short interest as a percent of free float, each with upper/lower confidence bounds. NOTE: this is a modeled DAILY estimate (hence the bounds), NOT the official biweekly FINRA settlement figure. `pc_freefloat` is a percent (e.g. 8.23 = 8.23%). Omitting start_date returns the full available history (RH's series began ~mid-2025).",
      inputSchema: {
        symbol: z.string().describe('Stock ticker symbol (e.g. "AAPL").'),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
          .optional()
          .describe(
            "Earliest date (YYYY-MM-DD) to include; narrows the series. Omit for full history.",
          ),
      },
      outputSchema: {
        symbol: z.string(),
        short_interest: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, start_date }) => {
      try {
        const rh = await getAuthenticatedRh();
        const sym = symbol.trim().toUpperCase();
        const shortInterest = await rh.getShortInterest(sym, { startDate: start_date });
        return structured({ symbol: sym, short_interest: shortInterest });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_news",
    {
      title: "Get Equity News",
      description:
        "Get recent news for a stock symbol, plus its analyst ratings summary. Results are complete up to limit (next_cursor is always null).",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol."),
        limit: z.number().int().optional().describe("Max articles, 1-50 (capped at 50)."),
        cursor: z
          .string()
          .optional()
          .describe("Accepted for parity; results are complete, so next_cursor is always null."),
      },
      outputSchema: {
        news: z.unknown(),
        ratings: z.unknown(),
        next_cursor: z.null(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, limit }) => {
      try {
        const rh = await getAuthenticatedRh();
        const s = symbol.trim().toUpperCase();
        const [news, ratings] = await Promise.all([rh.getNews(s), rh.getRatings(s)]);
        const n = Math.min(Math.max(limit ?? 50, 1), 50);
        return structured({ news: news.slice(0, n), ratings, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_search",
    {
      title: "Search",
      description:
        'Search by name or ticker. asset_type "instrument" (default: US stocks/ETFs), "currency_pair" (crypto pairs such as BTC-USD), or "market_index" (SPX, NDX, …).',
      inputSchema: {
        query: z.string().describe('Company name, partial name, or ticker (e.g. "apple", "AAPL").'),
        asset_type: stringEnum(["instrument", "currency_pair", "market_index"])
          .optional()
          .describe('"instrument" (default), "currency_pair", or "market_index".'),
        limit: z.number().int().optional().describe("Max results (default 10, clamped to 20)."),
      },
      outputSchema: {
        query: z.string(),
        asset_type: z.string(),
        results: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ query, asset_type, limit }) => {
      try {
        const rh = await getAuthenticatedRh();
        const type = asset_type ?? "instrument";
        const n = Math.min(Math.max(limit ?? 10, 1), 20);
        const q = query.trim().toUpperCase();
        let results: unknown[];
        if (type === "instrument") {
          results = await rh.findInstruments(query);
        } else if (type === "currency_pair") {
          results = (await rh.getCurrencyPairs()).filter((p) =>
            [p.symbol, p.display_name, p.asset_currency?.code, p.asset_currency?.name].some((f) =>
              f?.toUpperCase().includes(q),
            ),
          );
        } else {
          results = (await rh.getIndexInstruments()).filter((i) =>
            [i.symbol, i.simple_name, i.description].some((f) => f?.toUpperCase().includes(q)),
          );
        }
        return structured({ query, asset_type: type, results: results.slice(0, n) });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_price_book",
    {
      title: "Get Equity Price Book",
      description:
        "Get the Level-2 price book (aggregated bid/ask depth) for up to 4 stocks. Depth is populated during market hours.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).max(4).describe("Stock symbols, up to 4."),
      },
      outputSchema: {
        price_books: z.array(z.object({ symbol: z.string(), price_book: z.unknown() })),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const price_books = [];
        for (const symbol of upper(symbols)) {
          price_books.push({ symbol, price_book: await rh.getPriceBook(symbol) });
        }
        return structured({ price_books });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_earnings_results",
    {
      title: "Get Earnings Results",
      description:
        "Get historical and upcoming earnings (EPS estimate vs. actual, report date/timing) for one symbol.",
      inputSchema: {
        symbol: z.string().describe("Stock ticker symbol."),
      },
      outputSchema: {
        symbol: z.string(),
        earnings: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol }) => {
      try {
        const rh = await getAuthenticatedRh();
        const earnings = await rh.getEarnings(symbol.trim().toUpperCase());
        return structured({ symbol: symbol.trim().toUpperCase(), earnings });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_earnings_calendar",
    {
      title: "Get Earnings Calendar",
      description:
        "Get the market-wide earnings calendar (all reporting companies) for a window of days anchored at start_date.",
      inputSchema: {
        days: z
          .number()
          .int()
          .optional()
          .describe(
            "Window length, -31..31, non-zero (default 7). Positive = start_date forward; negative = the days ending at start_date.",
          ),
        start_date: z
          .string()
          .optional()
          .describe("Window anchor, YYYY-MM-DD. Defaults to today (US/Eastern)."),
        filter: stringEnum(["high_market_cap"])
          .optional()
          .describe("'high_market_cap' keeps only names with market cap over $1B."),
      },
      outputSchema: {
        start_date: z.string(),
        end_date: z.string(),
        count: z.number(),
        calendar: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ days, start_date, filter }) => {
      try {
        const d = days ?? 7;
        if (d === 0 || d < -31 || d > 31) {
          return textError("days must be a non-zero integer between -31 and 31.");
        }
        const today = etToday();
        const anchor = start_date ?? today;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
          return textError("start_date must be YYYY-MM-DD.");
        }
        const [lo, hi] =
          d > 0 ? [anchor, addDays(anchor, d - 1)] : [addDays(anchor, d + 1), anchor];
        const rh = await getAuthenticatedRh();
        // The endpoint only takes a window relative to today: fetch the forward
        // and/or look-back ranges that cover [lo, hi], then filter by report date.
        const fetched = [];
        if (hi >= today) fetched.push(...(await rh.getEarningsCalendar(dayDiff(today, hi) + 1)));
        if (lo < today) fetched.push(...(await rh.getEarningsCalendar(-(dayDiff(lo, today) + 1))));
        const seen = new Set<string>();
        let calendar = fetched.filter((e) => {
          const date = e.report?.date;
          const key = `${e.symbol}|${date}`;
          if (!date || date < lo || date > hi || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (filter === "high_market_cap") {
          const symbols = [
            ...new Set(calendar.map((e) => e.symbol).filter((s) => !!s)),
          ] as string[];
          const large = new Set<string>();
          for (let i = 0; i < symbols.length; i += 50) {
            for (const f of await rh.getFundamentals(symbols.slice(i, i + 50))) {
              if (f?.symbol && Number(f.market_cap) > 1e9) large.add(f.symbol);
            }
          }
          calendar = calendar.filter((e) => e.symbol !== undefined && large.has(e.symbol));
        }
        return structured({ start_date: lo, end_date: hi, count: calendar.length, calendar });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_tradability",
    {
      title: "Get Equity Tradability",
      description:
        "Get tradability flags (tradeable, fractional, short-selling, all-day, per-account-type) for up to 10 symbols. The flags are instrument-level; account_number is echoed, not used to filter.",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number."),
        symbols: z.array(z.string()).min(1).max(10).describe("Stock symbols, up to 10."),
      },
      outputSchema: {
        account_number: z.string(),
        tradability: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ account_number, symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const tradability = await rh.getTradability(symbols);
        return structured({ account_number, tradability });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
