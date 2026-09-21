/** Crypto data tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CURSOR_PARAM,
  findPair,
  getAuthenticatedRh,
  RHS_ACCOUNT_PARAM,
  structured,
  textError,
} from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerCryptoTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_crypto_quotes",
    {
      title: "Get Crypto Quotes",
      description:
        "Get live quotes (mark, bid, ask, open, high, low, volume) for crypto pairs. Symbols may be 'BTC', 'BTC-USD', or 'BTCUSD'; an unknown symbol returns an error entry. Timestamps are UTC.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).describe("Crypto pair symbols, e.g. ['BTC-USD']."),
        rhs_account_number: RHS_ACCOUNT_PARAM.optional(),
        timezone: z.string().optional().describe("Accepted for parity; timestamps stay UTC."),
      },
      outputSchema: {
        quotes: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ symbols }) => {
      try {
        const rh = await getAuthenticatedRh();
        const pairs = await rh.getCurrencyPairs();
        const quotes = [];
        for (const symbol of symbols) {
          const pair = findPair(pairs, symbol);
          quotes.push(
            pair
              ? {
                  symbol: pair.symbol,
                  quote: await rh.getCryptoQuote(pair.asset_currency?.code ?? ""),
                }
              : { symbol, error: "Unknown crypto pair" },
          );
        }
        return structured({ quotes });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_crypto_positions",
    {
      title: "Get Crypto Positions",
      description:
        "Get crypto holdings (quantity, cost bases) for the user. Results are complete (next_cursor is always null).",
      inputSchema: {
        rhs_account_number: RHS_ACCOUNT_PARAM,
        cursor: CURSOR_PARAM,
      },
      outputSchema: {
        positions: z.array(z.unknown()),
        next_cursor: z.null(),
      },
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        return structured({ positions: await rh.getCryptoPositions(), next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_currency_pairs",
    {
      title: "Get Currency Pairs",
      description:
        "List tradable crypto currency pairs (id, symbol, asset currency, tradability). Paged: pass next_cursor back as cursor for the next page.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .optional()
          .describe("Pairs per page, clamped to [1, 700] (default 25)."),
        cursor: z.string().optional().describe("next_cursor from the previous page."),
      },
      outputSchema: {
        pairs: z.array(z.unknown()),
        next_cursor: z.string().nullable(),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, cursor }) => {
      try {
        const offset = cursor === undefined ? 0 : Number(cursor);
        if (!Number.isInteger(offset) || offset < 0) return textError("Invalid cursor.");
        const n = Math.min(Math.max(limit ?? 25, 1), 700);
        const rh = await getAuthenticatedRh();
        const all = await rh.getCurrencyPairs();
        const end = offset + n;
        return structured({
          pairs: all.slice(offset, end),
          next_cursor: end < all.length ? String(end) : null,
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_crypto_historicals",
    {
      title: "Get Crypto Historicals",
      description: "Get OHLCV price history for a crypto symbol (24/7 bounds).",
      inputSchema: {
        symbol: z.string().describe('Crypto symbol (e.g. "BTC", "ETH").'),
        interval: z
          .enum(["15second", "5minute", "10minute", "hour", "day", "week"])
          .default("day")
          .describe("Candle interval."),
        span: z
          .enum(["hour", "day", "week", "month", "3month", "year", "5year"])
          .default("month")
          .describe("Time span."),
      },
      outputSchema: {
        historicals: z.unknown(),
      },
      annotations: READ_ONLY,
    },
    async ({ symbol, interval, span }) => {
      try {
        const rh = await getAuthenticatedRh();
        const historicals = await rh.getCryptoHistoricals(symbol.trim().toUpperCase(), {
          interval,
          span,
          bounds: "24_7",
        });
        return structured({ historicals });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
