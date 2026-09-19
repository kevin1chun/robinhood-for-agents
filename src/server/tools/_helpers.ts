/** Shared helpers for MCP tool handlers. */

import { z } from "zod";
import { getClient } from "../../client/index.js";
import { redactTokens, scrubRedundantAccountFields } from "../../redact.js";

/**
 * Success-path result helper for tools with an `outputSchema`. Serializes +
 * redacts `data` exactly like `text()` (same text block, so existing
 * content[0].text assertions keep passing), then round-trips the redacted
 * JSON string back through JSON.parse to build `structuredContent`. The
 * round-trip matters: redaction must apply to structuredContent too, not
 * just the text block, and re-parsing the already-redacted string is the only
 * way to guarantee that (rather than redacting the text and structured copies
 * independently, which could drift).
 */
export function structured(data: unknown) {
  const redactedJson = redactTokens(JSON.stringify(scrubRedundantAccountFields(data)));
  return {
    content: [{ type: "text" as const, text: redactedJson }],
    structuredContent: JSON.parse(redactedJson) as Record<string, unknown>,
  };
}

export function textError(msg: string) {
  return {
    content: [{ type: "text" as const, text: redactTokens(JSON.stringify({ error: msg })) }],
    isError: true as const,
  };
}

export function getRh() {
  return getClient();
}

export async function getAuthenticatedRh() {
  const rh = getClient();
  if (!rh.isLoggedIn) {
    await rh.restoreSession();
  }
  return rh;
}

/**
 * A string validated against `values` at call time. The official MCP publishes
 * these parameters as plain strings (no JSON-schema `enum`), so this keeps the
 * listed schema identical while still rejecting unknown values.
 */
export function stringEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.string().pipe(z.enum(values));
}

export const CURSOR_PARAM = z
  .string()
  .optional()
  .describe("Accepted for parity; results are complete, so next_cursor is always null.");

/** Parse an ISO 8601 instant or YYYY-MM-DD; a value without a zone is read as UTC. */
export function parseUtc(value: string): number {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
  const ms = Date.parse(hasZone ? value : `${value}Z`);
  if (Number.isNaN(ms)) throw new Error(`Not an ISO 8601 time: "${value}"`);
  return ms;
}

/** Split "a, b,c" into trimmed non-empty parts. */
export function csv(value: string | undefined): string[] | undefined {
  const parts = value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts?.length ? parts : undefined;
}

/**
 * Find a crypto pair by "BTC", "BTC-USD" or "BTCUSD". Nummus orders and
 * holdings are user-scoped, so crypto tools accept `rhs_account_number` for
 * parity but do not route by it.
 */
export function findPair<T extends { symbol?: string; asset_currency?: { code?: string } }>(
  pairs: readonly T[],
  symbol: string,
): T | undefined {
  const s = symbol.trim().toUpperCase().replace("-", "");
  const code = s.length > 3 && s.endsWith("USD") ? s.slice(0, -3) : s;
  return pairs.find((p) => p.asset_currency?.code?.toUpperCase() === code);
}

export const RHS_ACCOUNT_PARAM = z
  .string()
  .describe(
    "Brokerage account number, accepted for parity; crypto is user-scoped over this API, so it is not used to route.",
  );

function positive(value: string, name: string): number {
  const n = Number(value);
  if (!(n > 0) || !Number.isFinite(n))
    throw new Error(`${name} must be a positive number, got "${value}"`);
  return n;
}

const TAX_LOT = z.object({
  open_lot_id: z.string().describe("open_lot_id of the lot to sell."),
  quantity: z.string().describe("Quantity to sell from this lot."),
});

/** Official equity order parameters, shared by review and place. */
export const EQUITY_ORDER_PARAMS = {
  account_number: z.string().describe("Brokerage account number (from robinhood_get_accounts)."),
  symbol: z.string().describe("Stock symbol."),
  side: stringEnum(["buy", "sell", "sell_short"]).describe(
    "'buy' or 'sell'. 'sell_short' opens a short (margin account, whole shares); cover with 'buy'.",
  ),
  type: stringEnum(["market", "limit", "stop_market", "stop_limit"]).describe(
    "'market', 'limit', 'stop_market', or 'stop_limit'.",
  ),
  quantity: z.string().optional().describe("Shares. Fractional only for market + regular_hours."),
  dollar_amount: z
    .string()
    .optional()
    .describe("Not supported over this API — pass quantity instead."),
  limit_price: z.string().optional().describe("Required for limit and stop_limit."),
  stop_price: z.string().optional().describe("Required for stop_market and stop_limit."),
  time_in_force: stringEnum(["gfd", "gtc"]).optional().describe("'gfd' (default) or 'gtc'."),
  market_hours: stringEnum(["regular_hours", "extended_hours", "all_day_hours"])
    .optional()
    .describe(
      "'regular_hours' (default), 'extended_hours', or 'all_day_hours' (24 Hour Market). Outside regular hours only limit orders execute.",
    ),
  tax_lots: z
    .array(TAX_LOT)
    .nullish()
    .describe("Not supported over this API — sells use the account's default lot relief."),
};

export interface EquityOrderArgs {
  symbol: string;
  side: "buy" | "sell" | "sell_short";
  type: "market" | "limit" | "stop_market" | "stop_limit";
  quantity?: string;
  dollar_amount?: string;
  limit_price?: string;
  stop_price?: string;
  time_in_force?: "gfd" | "gtc";
  market_hours?: "regular_hours" | "extended_hours" | "all_day_hours";
  tax_lots?: unknown[] | null;
}

/** Validate an equity order against its declared type; numbers come back parsed. */
export function parseEquityOrder(a: EquityOrderArgs) {
  if (a.dollar_amount !== undefined) {
    throw new Error("dollar_amount is not supported over this API; pass quantity.");
  }
  if (a.tax_lots?.length) throw new Error("tax_lots is not supported over this API.");
  if (a.quantity === undefined) throw new Error("quantity is required.");
  const wantsLimit = a.type === "limit" || a.type === "stop_limit";
  const wantsStop = a.type === "stop_market" || a.type === "stop_limit";
  if (wantsLimit !== (a.limit_price !== undefined)) {
    throw new Error(
      `limit_price is ${wantsLimit ? "required" : "not allowed"} for type ${a.type}.`,
    );
  }
  if (wantsStop !== (a.stop_price !== undefined)) {
    throw new Error(`stop_price is ${wantsStop ? "required" : "not allowed"} for type ${a.type}.`);
  }
  return {
    quantity: positive(a.quantity, "quantity"),
    limitPrice: a.limit_price === undefined ? undefined : positive(a.limit_price, "limit_price"),
    stopPrice: a.stop_price === undefined ? undefined : positive(a.stop_price, "stop_price"),
    timeInForce: a.time_in_force ?? "gfd",
    marketHours: a.market_hours ?? "regular_hours",
  };
}

const OPTION_LEG = z.object({
  option_id: z.string().describe("Option instrument UUID (from robinhood_get_option_instruments)."),
  side: stringEnum(["buy", "sell"]).describe("'buy' or 'sell'."),
  position_effect: stringEnum(["open", "close"]).describe("'open' or 'close'."),
  ratio_quantity: z
    .number()
    .int()
    .optional()
    .describe("Contracts per unit of quantity (default 1)."),
});

/** Official option order parameters, shared by review and place. */
export const OPTION_ORDER_PARAMS = {
  account_number: z.string().describe("Brokerage account number (from robinhood_get_accounts)."),
  legs: z.array(OPTION_LEG).min(1).max(4).describe("1 to 4 legs, each a different contract."),
  quantity: z.string().describe("Positive integer contract (or strategy) count."),
  price: z
    .string()
    .optional()
    .describe("Limit price; net premium per unit for multi-leg. Required."),
  direction: stringEnum(["debit", "credit"])
    .optional()
    .describe("'debit' or 'credit'. Required with 2+ legs; derived from the side for one leg."),
  type: stringEnum(["limit", "market", "stop_limit", "stop_market"])
    .optional()
    .describe("'limit' (default) or 'stop_limit'; market types are not supported over this API."),
  stop_price: z.string().optional().describe("Stop trigger per contract; stop_limit only."),
  time_in_force: stringEnum(["gfd", "gtc"]).optional().describe("'gfd' (default) or 'gtc'."),
  market_hours: stringEnum(["regular_hours", "regular_curb_hours", "regular_curb_overnight_hours"])
    .optional()
    .describe("Only 'regular_hours' (default) is supported over this API."),
};

export interface OptionOrderArgs {
  legs: Array<{
    option_id: string;
    side: "buy" | "sell";
    position_effect: "open" | "close";
    ratio_quantity?: number;
  }>;
  quantity: string;
  price?: string;
  direction?: "debit" | "credit";
  type?: "limit" | "market" | "stop_limit" | "stop_market";
  stop_price?: string;
  time_in_force?: "gfd" | "gtc";
  market_hours?: string;
}

export function parseOptionOrder(a: OptionOrderArgs) {
  const type = a.type ?? "limit";
  if (type === "market" || type === "stop_market") {
    throw new Error(`type ${type} is not supported over this API; use limit or stop_limit.`);
  }
  if ((a.market_hours ?? "regular_hours") !== "regular_hours") {
    throw new Error("Only market_hours 'regular_hours' is supported over this API.");
  }
  if (new Set(a.legs.map((l) => l.option_id)).size !== a.legs.length) {
    throw new Error("Each leg must be a different contract.");
  }
  if (type === "stop_limit" && a.stop_price === undefined) {
    throw new Error("stop_price is required for stop_limit.");
  }
  if (type === "limit" && a.stop_price !== undefined) {
    throw new Error("stop_price is not allowed for limit.");
  }
  if (a.price === undefined) throw new Error(`price is required for ${type}.`);
  const quantity = positive(a.quantity, "quantity");
  if (!Number.isInteger(quantity)) throw new Error("quantity must be a whole number of contracts.");
  const first = a.legs[0] as OptionOrderArgs["legs"][number];
  let direction = a.direction;
  if (a.legs.length > 1 && direction === undefined) {
    throw new Error("direction is required with 2 or more legs.");
  }
  direction ??= first.side === "buy" ? "debit" : "credit";
  if (a.legs.length === 1 && (first.ratio_quantity ?? 1) !== 1) {
    throw new Error("ratio_quantity must be 1 on a single-leg order.");
  }
  return {
    legs: a.legs.map((l) => ({
      optionId: l.option_id,
      side: l.side,
      positionEffect: l.position_effect,
      ratioQuantity: l.ratio_quantity ?? 1,
    })),
    price: positive(a.price, "price"),
    quantity,
    direction,
    stopPrice: a.stop_price === undefined ? undefined : positive(a.stop_price, "stop_price"),
    timeInForce: a.time_in_force ?? "gfd",
  };
}

/** Official crypto order parameters, shared by preview and place. */
export const CRYPTO_ORDER_PARAMS = {
  rhs_account_number: RHS_ACCOUNT_PARAM,
  symbol: z.string().describe("Crypto symbol ('BTC', 'BTC-USD', or 'BTCUSD')."),
  side: stringEnum(["buy", "sell"]).describe("'buy' or 'sell'."),
  type: stringEnum(["market", "limit", "stop_loss", "stop_limit"]).describe(
    "'market' or 'limit'; stop_loss and stop_limit are not supported over this API.",
  ),
  quantity: z
    .string()
    .optional()
    .describe("Asset quantity. Exactly one of quantity or dollar_amount."),
  dollar_amount: z
    .string()
    .optional()
    .describe("USD notional. Exactly one of quantity or dollar_amount."),
  limit_price: z.string().optional().describe("Required for limit."),
  stop_price: z.string().optional().describe("Not supported over this API."),
  time_in_force: z.string().optional().describe("'gtc' only (the default)."),
  tax_lots: z.array(TAX_LOT).nullish().describe("Not supported over this API."),
};

export interface CryptoOrderArgs {
  side: "buy" | "sell";
  type: "market" | "limit" | "stop_loss" | "stop_limit";
  quantity?: string;
  dollar_amount?: string;
  limit_price?: string;
  stop_price?: string;
  time_in_force?: string;
  tax_lots?: unknown[] | null;
}

export function parseCryptoOrder(a: CryptoOrderArgs) {
  if (a.type === "stop_loss" || a.type === "stop_limit") {
    throw new Error(`type ${a.type} is not supported over this API; use market or limit.`);
  }
  if (a.stop_price !== undefined) throw new Error("stop_price is not supported over this API.");
  if (a.tax_lots?.length) throw new Error("tax_lots is not supported over this API.");
  if ((a.time_in_force ?? "gtc") !== "gtc") throw new Error("time_in_force must be 'gtc'.");
  if ((a.quantity === undefined) === (a.dollar_amount === undefined)) {
    throw new Error("Provide exactly one of quantity or dollar_amount.");
  }
  if ((a.type === "limit") !== (a.limit_price !== undefined)) {
    throw new Error(
      `limit_price is ${a.type === "limit" ? "required" : "not allowed"} for ${a.type}.`,
    );
  }
  return {
    amount:
      a.quantity !== undefined
        ? positive(a.quantity, "quantity")
        : positive(a.dollar_amount as string, "dollar_amount"),
    amountIn: (a.quantity !== undefined ? "quantity" : "price") as "quantity" | "price",
    orderType: a.type,
    limitPrice: a.limit_price === undefined ? undefined : positive(a.limit_price, "limit_price"),
  };
}
