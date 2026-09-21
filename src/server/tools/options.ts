/** Options data tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OptionInstrument } from "../../client/types.js";
import { resolveWindow } from "../../compute/historicals-window.js";
import {
  CURSOR_PARAM,
  csv,
  getAuthenticatedRh,
  parseUtc,
  stringEnum,
  structured,
  textError,
} from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;
const OPTION_INTERVALS = ["5minute", "10minute", "hour", "day", "week"] as const;

export function registerOptionsTools(server: McpServer): void {
  server.registerTool(
    "robinhood_get_option_chains",
    {
      title: "Get Option Chains",
      description:
        "Get option chains (id, expiration_dates, min ticks, underlying) by chain ids or by underlying ticker. An index such as SPX can have several chains (e.g. SPX monthlies and SPXW weeklies). Pass a chain id to robinhood_get_option_instruments to list contracts.",
      inputSchema: {
        ids: z.string().optional().describe("Comma-separated chain UUIDs."),
        underlying_symbol: z
          .string()
          .optional()
          .describe("Equity or index ticker (e.g. 'AAPL', 'SPX')."),
      },
      outputSchema: {
        chains: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ ids, underlying_symbol }) => {
      try {
        if (!ids && !underlying_symbol) return textError("Pass ids or underlying_symbol.");
        const rh = await getAuthenticatedRh();
        const chains = await rh.getOptionChains({
          ids: csv(ids),
          underlyingSymbol: underlying_symbol,
        });
        return structured({ chains });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_instruments",
    {
      title: "Get Option Instruments",
      description:
        "List option contracts (id, type, strike, expiration, state, tradability) by chain_id, chain_symbol (the underlying), or instrument ids, filtered by expiration dates, strike, type, state, and tradability. Results are complete (next_cursor is always null).",
      inputSchema: {
        chain_id: z.string().optional().describe("Chain UUID (from robinhood_get_option_chains)."),
        chain_symbol: z.string().optional().describe("Underlying ticker (e.g. 'AAPL', 'SPXW')."),
        ids: z.string().optional().describe("Comma-separated instrument UUIDs."),
        expiration_dates: z.string().optional().describe("Comma-separated YYYY-MM-DD expirations."),
        strike_price: z.string().optional().describe("Exact strike (e.g. '150.0000')."),
        type: stringEnum(["call", "put"]).optional().describe("'call' or 'put'."),
        state: stringEnum(["active", "expired", "inactive"])
          .optional()
          .describe("'active' (default), 'expired', or 'inactive'."),
        tradability: stringEnum(["tradable", "untradable"])
          .optional()
          .describe("'tradable' only; 'untradable' is rejected."),
        cursor: CURSOR_PARAM,
      },
      outputSchema: {
        instruments: z.array(z.unknown()),
        next_cursor: z.null(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        if (args.tradability === "untradable")
          return textError("tradability 'untradable' is not supported.");
        const ids = csv(args.ids);
        if (!args.chain_id && !args.chain_symbol && !ids) {
          return textError("Pass chain_id, chain_symbol, or ids.");
        }
        const rh = await getAuthenticatedRh();
        let instruments: OptionInstrument[] = [];
        if (ids) {
          for (const id of ids) instruments.push(await rh.getOptionInstrumentById(id));
        } else {
          let chainIds: string[];
          if (args.chain_id) {
            chainIds = [args.chain_id];
          } else {
            const sym = (args.chain_symbol as string).trim().toUpperCase();
            const chains = await rh.getOptionChains({ underlyingSymbol: sym });
            const exact = chains.filter((c) => c.symbol?.toUpperCase() === sym);
            chainIds = (exact.length ? exact : chains).map((c) => c.id);
          }
          for (const chainId of chainIds) {
            instruments.push(
              ...(await rh.getOptionInstruments({
                chainId,
                expirationDates: csv(args.expiration_dates),
                strikePrice: args.strike_price,
                type: args.type,
              })),
            );
          }
        }
        const state = args.state ?? "active";
        instruments = instruments.filter(
          (o) =>
            o.state === state &&
            (args.tradability === undefined || o.tradability === args.tradability),
        );
        return structured({ instruments, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_quotes",
    {
      title: "Get Option Quotes",
      description:
        "Get market data for option contracts by instrument id: bid/ask/mark/last, volume, open interest, implied volatility, and greeks.",
      inputSchema: {
        instrument_ids: z
          .array(z.string())
          .min(1)
          .describe("Option instrument UUIDs (from robinhood_get_option_instruments)."),
      },
      outputSchema: {
        quotes: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ instrument_ids }) => {
      try {
        const rh = await getAuthenticatedRh();
        return structured({ quotes: await rh.getOptionQuotes(instrument_ids) });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_positions",
    {
      title: "Get Option Positions",
      description:
        "Get per-leg option positions for one account, filtered by chain, contract, expiration, call/put, and long/short. Results are complete (next_cursor is always null).",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number."),
        nonzero: z
          .boolean()
          .optional()
          .describe("True for open positions only; omit/false to include closed ones."),
        chain_ids: z.string().optional().describe("Comma-separated chain UUIDs."),
        option_ids: z.string().optional().describe("Comma-separated instrument UUIDs."),
        expiration_date: z.string().optional().describe("Exact expiration (YYYY-MM-DD)."),
        expiration_date_gte: z.string().optional().describe("Expiration on or after (YYYY-MM-DD)."),
        expiration_date_lte: z
          .string()
          .optional()
          .describe("Expiration on or before (YYYY-MM-DD)."),
        option_type: stringEnum(["call", "put"]).optional().describe("'call' or 'put'."),
        type: stringEnum(["long", "short"]).optional().describe("'long' or 'short'."),
        cursor: CURSOR_PARAM,
      },
      outputSchema: {
        positions: z.array(z.unknown()),
        next_cursor: z.null(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        const rh = await getAuthenticatedRh();
        const chainIds = csv(args.chain_ids);
        const optionIds = csv(args.option_ids);
        let positions = (
          await rh.getOptionPositions({
            accountNumber: args.account_number,
            nonzero: args.nonzero ?? false,
          })
        ).filter((p) => {
          const exp = p.expiration_date ?? "";
          return (
            (!chainIds || chainIds.includes(p.chain_id ?? "")) &&
            (!optionIds || optionIds.includes(p.option_id ?? "")) &&
            (!args.type || p.type === args.type) &&
            (!args.expiration_date || exp === args.expiration_date) &&
            (!args.expiration_date_gte || exp >= args.expiration_date_gte) &&
            (!args.expiration_date_lte || exp <= args.expiration_date_lte)
          );
        });
        if (args.option_type) {
          // Call/put lives on the instrument, not the position.
          const kept = [];
          for (const p of positions) {
            if (!p.option_id) continue;
            const inst = await rh.getOptionInstrumentById(p.option_id);
            if (inst.type === args.option_type) kept.push(p);
          }
          positions = kept;
        }
        return structured({ positions, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_orders",
    {
      title: "Get Option Orders",
      description:
        "Get option order history for one account (filled, cancelled, and open multi-leg orders), filtered by order id, chain, state, source, underlying type, and creation time. Results are complete (next_cursor is always null).",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number."),
        order_id: z.string().optional().describe("One order UUID."),
        chain_ids: z.string().optional().describe("Comma-separated chain UUIDs."),
        state: z
          .string()
          .optional()
          .describe("One state, e.g. queued, confirmed, filled, cancelled."),
        placed_agent: z
          .string()
          .optional()
          .describe("One source, e.g. 'user', 'agentic', 'recurring'."),
        underlying_type: stringEnum(["equity", "index"])
          .optional()
          .describe("'equity' or 'index'."),
        created_at_gte: z
          .string()
          .optional()
          .describe("Created on or after (ISO 8601 or YYYY-MM-DD; naive = UTC)."),
        cursor: CURSOR_PARAM,
      },
      outputSchema: {
        orders: z.array(z.unknown()),
        next_cursor: z.null(),
      },
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        const rh = await getAuthenticatedRh();
        const all = args.order_id
          ? [await rh.getOptionOrder(args.order_id)]
          : await rh.getAllOptionOrders({ accountNumber: args.account_number });
        const chainIds = csv(args.chain_ids);
        const since = args.created_at_gte ? parseUtc(args.created_at_gte) : undefined;
        // An index order is one on an index's tradable chain.
        const indexChains = args.underlying_type
          ? new Set((await rh.getIndexInstruments()).flatMap((i) => i.tradable_chain_ids ?? []))
          : undefined;
        const orders = all.filter(
          (o) =>
            (o.account_number == null || o.account_number === args.account_number) &&
            (!chainIds || chainIds.includes(o.chain_id ?? "")) &&
            (!args.state || o.state === args.state) &&
            (!args.placed_agent || o.placed_agent === args.placed_agent) &&
            (!indexChains ||
              indexChains.has(o.chain_id ?? "") === (args.underlying_type === "index")) &&
            (since === undefined ||
              (o.created_at !== undefined && parseUtc(o.created_at) >= since)),
        );
        return structured({ orders, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_option_historicals",
    {
      title: "Get Option Historicals",
      description:
        "Get OHLC bars for up to 10 option contracts over [start_time, end_time], from Robinhood's REST chart endpoint (anchored at now; fetched over the smallest span reaching start_time, then trimmed). Intervals: 5minute, 10minute, hour, day, week; omit for the finest available. Regular-hours bounds only.",
      inputSchema: {
        instrument_ids: z
          .array(z.string())
          .min(1)
          .max(10)
          .describe("Option instrument UUIDs, up to 10."),
        start_time: z.string().describe("Range start, RFC3339 UTC."),
        end_time: z.string().optional().describe("Range end, RFC3339 UTC. Defaults to now."),
        interval: z
          .string()
          .optional()
          .describe("5minute, 10minute, hour, day, or week. Omit to auto-select."),
        bounds: stringEnum(["regular", "24_5", "24_7"])
          .optional()
          .describe("Only 'regular' (default) is served over this endpoint."),
      },
      outputSchema: {
        span: z.string(),
        interval: z.string(),
        historicals: z.array(z.unknown()),
      },
      annotations: READ_ONLY,
    },
    async ({ instrument_ids, start_time, end_time, interval, bounds }) => {
      try {
        if (bounds !== undefined && bounds !== "regular") {
          return textError(`bounds "${bounds}" is not available; omit it or pass "regular".`);
        }
        const w = resolveWindow(start_time, end_time, interval, { allowed: OPTION_INTERVALS });
        const rh = await getAuthenticatedRh();
        const historicals = [];
        for (const id of instrument_ids) {
          const h = await rh.getOptionHistoricalsById(id, { span: w.span, interval: w.interval });
          historicals.push({
            ...h,
            data_points: (h.data_points ?? []).filter((p) => {
              const t = Date.parse(p.begins_at ?? "");
              return t >= w.startMs && t <= w.endMs;
            }),
          });
        }
        return structured({ span: w.span, interval: w.interval, historicals });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
