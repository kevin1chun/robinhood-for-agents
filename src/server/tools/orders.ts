/** Order placement, history, and cancel tools for Robinhood. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CRYPTO_ORDER_PARAMS,
  CURSOR_PARAM,
  EQUITY_ORDER_PARAMS,
  findPair,
  getAuthenticatedRh,
  OPTION_ORDER_PARAMS,
  parseCryptoOrder,
  parseEquityOrder,
  parseOptionOrder,
  parseUtc,
  RHS_ACCOUNT_PARAM,
  stringEnum,
  structured,
  textError,
} from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;
const PLACE_ORDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
} as const;
const CANCEL_ORDER_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
} as const;

const REF_ID = z
  .string()
  .optional()
  .describe("Idempotency key (UUID); re-send the same value on retry. Omit for a fresh one.");

const ORDER_PAGE = {
  orders: z.array(z.unknown()),
  next_cursor: z.null(),
};

/** True when a created/updated timestamp is at or after `gte` (absent filter → true). */
function since(ts: string | null | undefined, gte: string | undefined): boolean {
  if (gte === undefined) return true;
  return ts != null && parseUtc(ts) >= parseUtc(gte);
}

/** A stock order's `account` is the account URL `…/accounts/{number}/`. */
function ownedBy(accountUrl: string | undefined, accountNumber: string): boolean {
  return accountUrl === undefined || accountUrl.endsWith(`/accounts/${accountNumber}/`);
}

const CRYPTO_OPEN = new Set(["unconfirmed", "queued", "confirmed", "partially_filled"]);

export function registerOrderTools(server: McpServer): void {
  server.registerTool(
    "robinhood_place_equity_order",
    {
      title: "Place Equity Order",
      description:
        "Place a stock order. Always confirm with the user before calling (review it first with robinhood_review_equity_order). Short selling: side 'sell_short' opens a short (NOT 'sell', which only closes a long and is rejected with 'Not enough shares to sell.'); close a short with 'buy'. Only limit orders execute outside regular_hours.",
      inputSchema: { ...EQUITY_ORDER_PARAMS, ref_id: REF_ID },
      outputSchema: {
        status: z.string(),
        order: z.unknown(),
      },
      annotations: PLACE_ORDER_ANNOTATIONS,
    },
    async (args) => {
      try {
        const o = parseEquityOrder(args);
        const rh = await getAuthenticatedRh();
        const order = await rh.orderStock(args.symbol, args.side, o.quantity, {
          limitPrice: o.limitPrice,
          stopPrice: o.stopPrice,
          timeInForce: o.timeInForce,
          marketHours: o.marketHours,
          accountNumber: args.account_number,
          refId: args.ref_id,
        });
        return structured({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_place_option_order",
    {
      title: "Place Option Order",
      description:
        "Place a single-leg or multi-leg (up to 4 legs: verticals, condors, straddles, …) limit or stop-limit option order, legs named by option_id. Always confirm with the user before calling (review it first with robinhood_review_option_order).",
      inputSchema: { ...OPTION_ORDER_PARAMS, ref_id: REF_ID },
      outputSchema: {
        status: z.string(),
        order: z.unknown(),
      },
      annotations: PLACE_ORDER_ANNOTATIONS,
    },
    async (args) => {
      try {
        const o = parseOptionOrder(args);
        const rh = await getAuthenticatedRh();
        const order = await rh.orderOption("", o.legs, o.price, o.quantity, o.direction, {
          stopPrice: o.stopPrice,
          timeInForce: o.timeInForce,
          accountNumber: args.account_number,
          refId: args.ref_id,
        });
        return structured({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_place_crypto_order",
    {
      title: "Place Crypto Order",
      description:
        "Place a market or limit crypto order by quantity or dollar_amount. Always confirm with the user before calling (preview it first with robinhood_preview_crypto_order).",
      inputSchema: { ...CRYPTO_ORDER_PARAMS, ref_id: REF_ID },
      outputSchema: {
        status: z.string(),
        order: z.unknown(),
      },
      annotations: PLACE_ORDER_ANNOTATIONS,
    },
    async (args) => {
      try {
        const o = parseCryptoOrder(args);
        const rh = await getAuthenticatedRh();
        const order = await rh.orderCrypto(args.symbol, args.side, o.amount, {
          amountIn: o.amountIn,
          orderType: o.orderType,
          limitPrice: o.limitPrice,
          refId: args.ref_id,
        });
        return structured({ status: "submitted", order });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_equity_orders",
    {
      title: "Get Equity Orders",
      description:
        "Get stock order history for one account, filtered by order id, symbol, state, source, and creation time. Results are complete (next_cursor is always null).",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number."),
        order_id: z.string().optional().describe("One order UUID."),
        symbol: z.string().optional().describe("One stock symbol."),
        state: z
          .string()
          .optional()
          .describe("One state, e.g. queued, confirmed, filled, cancelled."),
        placed_agent: z
          .string()
          .optional()
          .describe("One source, e.g. 'user', 'agentic', 'recurring'."),
        created_at_gte: z
          .string()
          .optional()
          .describe("Created on or after (ISO 8601 or YYYY-MM-DD; naive = UTC)."),
        cursor: CURSOR_PARAM,
      },
      outputSchema: ORDER_PAGE,
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        const rh = await getAuthenticatedRh();
        const all = args.order_id
          ? [await rh.getStockOrder(args.order_id)]
          : await rh.getAllStockOrders({ accountNumber: args.account_number });
        const instrumentId = args.symbol
          ? (await rh.resolveInstrumentBySymbol(args.symbol)).id
          : undefined;
        const orders = all.filter(
          (o) =>
            ownedBy(o.account, args.account_number) &&
            (!instrumentId || o.instrument_id === instrumentId) &&
            (!args.state || o.state === args.state) &&
            (!args.placed_agent || o.placed_agent === args.placed_agent) &&
            since(o.created_at, args.created_at_gte),
        );
        return structured({ orders, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_get_crypto_orders",
    {
      title: "Get Crypto Orders",
      description:
        "Get crypto order history, filtered by order id, symbol, side, state or state_group (open/closed), and created/updated time. Results are complete (next_cursor is always null).",
      inputSchema: {
        rhs_account_number: RHS_ACCOUNT_PARAM,
        order_id: z.string().optional().describe("One order UUID."),
        symbol: z.string().optional().describe("Crypto symbol ('BTC' or 'BTC-USD')."),
        side: stringEnum(["buy", "sell"]).optional().describe("'buy' or 'sell'."),
        state: z
          .string()
          .optional()
          .describe("One state, e.g. queued, confirmed, filled, canceled."),
        state_group: stringEnum(["open", "closed"])
          .optional()
          .describe("'open' or 'closed'. Mutually exclusive with state."),
        created_at_gte: z
          .string()
          .optional()
          .describe("Created on or after (ISO 8601; naive = UTC)."),
        updated_at_gte: z
          .string()
          .optional()
          .describe("Updated on or after (ISO 8601; naive = UTC)."),
        cursor: CURSOR_PARAM,
      },
      outputSchema: ORDER_PAGE,
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        if (args.state && args.state_group) {
          return textError("state and state_group are mutually exclusive.");
        }
        const rh = await getAuthenticatedRh();
        let pairId: string | undefined;
        if (args.symbol) {
          const pair = findPair(await rh.getCurrencyPairs(), args.symbol);
          if (!pair) return textError(`Unknown crypto pair: ${args.symbol}`);
          pairId = pair.id;
        }
        const all = args.order_id
          ? [await rh.getCryptoOrder(args.order_id)]
          : await rh.getAllCryptoOrders();
        const orders = all.filter(
          (o) =>
            (!pairId || o.currency_pair_id === pairId) &&
            (!args.side || o.side === args.side) &&
            (!args.state || o.state === args.state) &&
            (!args.state_group || CRYPTO_OPEN.has(o.state) === (args.state_group === "open")) &&
            since(o.created_at, args.created_at_gte) &&
            since(o.updated_at, args.updated_at_gte),
        );
        return structured({ orders, next_cursor: null });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_cancel_equity_order",
    {
      title: "Cancel Equity Order",
      description:
        "Cancel one pending stock order. The order must belong to account_number. Always confirm with the user before calling.",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number the order belongs to."),
        order_id: z.string().describe("Order UUID (from robinhood_get_equity_orders)."),
      },
      outputSchema: { status: z.string(), order_id: z.string() },
      annotations: CANCEL_ORDER_ANNOTATIONS,
    },
    async ({ account_number, order_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        const order = await rh.getStockOrder(order_id);
        if (!ownedBy(order.account, account_number)) {
          return textError(`Order ${order_id} does not belong to account ${account_number}.`);
        }
        await rh.cancelStockOrder(order_id);
        return structured({ status: "cancelled", order_id });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_cancel_option_order",
    {
      title: "Cancel Option Order",
      description:
        "Cancel one pending option order. The order must belong to account_number. Always confirm with the user before calling.",
      inputSchema: {
        account_number: z.string().describe("Brokerage account number the order belongs to."),
        order_id: z.string().describe("Order UUID (from robinhood_get_option_orders)."),
      },
      outputSchema: { status: z.string(), order_id: z.string() },
      annotations: CANCEL_ORDER_ANNOTATIONS,
    },
    async ({ account_number, order_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        const order = await rh.getOptionOrder(order_id);
        if (order.account_number != null && order.account_number !== account_number) {
          return textError(`Order ${order_id} does not belong to account ${account_number}.`);
        }
        await rh.cancelOptionOrder(order_id);
        return structured({ status: "cancelled", order_id });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.registerTool(
    "robinhood_cancel_crypto_order",
    {
      title: "Cancel Crypto Order",
      description: "Cancel one pending crypto order. Always confirm with the user before calling.",
      inputSchema: {
        rhs_account_number: RHS_ACCOUNT_PARAM,
        order_id: z.string().describe("Order UUID (from robinhood_get_crypto_orders)."),
      },
      outputSchema: { status: z.string(), order_id: z.string() },
      annotations: CANCEL_ORDER_ANNOTATIONS,
    },
    async ({ order_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        await rh.cancelCryptoOrder(order_id);
        return structured({ status: "cancelled", order_id });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
