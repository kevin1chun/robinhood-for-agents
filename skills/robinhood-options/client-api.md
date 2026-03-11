# Options — Client API

TypeScript methods from `robinhood-for-agents` for programmatic options analysis.

## Quick Start

```typescript
import { RobinhoodClient } from "robinhood-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

// Equity options
const chain = await client.getChains("AAPL");
console.log("Expirations:", chain.expiration_dates);

const options = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
  optionType: "call",
});

// Index options (SPX, NDX, VIX, RUT, XSP)
const spxChain = await client.getChains("SPX"); // returns SPXW (daily) chain by default
const spxOpts = await client.findTradableOptions("SPX", { expirationDate: "2026-03-11" });
const spxValue = await client.getIndexValue("SPX"); // { value: "5700.00", symbol: "SPX" }
```

## MCP Tool → Client Method Mapping

| MCP Tool | Client Method |
|----------|--------------|
| `robinhood_get_options` (chain) | `getChains(symbol, opts?)` |
| `robinhood_get_options` (instruments) | `findTradableOptions(symbol, opts?)` |
| `robinhood_get_options` (greeks) | `getOptionMarketData(symbol, expDate, strike, type)` |
| `robinhood_get_options` (index value) | `getIndexValue(symbol)` |
| `robinhood_get_orders` (options) | `getOpenOptionPositions(accountNumber?)` |
| `robinhood_place_option_order` | `orderOption(symbol, legs, price, quantity, direction, opts?)` |

## Methods

### `getChains(symbol, opts?): Promise<OptionChain>`

Returns chain metadata including all available expiration dates. Works for both equities and indexes (SPX, NDX, VIX, RUT, XSP).

For indexes with multiple chains (e.g. SPXW weeklies + SPX monthlies), pass `expirationDate` to select the correct chain. Defaults to the chain with the most expirations (SPXW).

```typescript
const chain = await client.getChains("AAPL");
// => { id, expiration_dates: ["2026-04-17", ...], ... }

const spxChain = await client.getChains("SPX", { expirationDate: "2026-03-11" });
// => SPXW chain (daily expirations, PM-settled)
```

### `findTradableOptions(symbol, opts?): Promise<OptionInstrument[]>`

Returns option instruments filtered by expiration, strike, and type. Performs client-side filtering for reliability. Works outside market hours — does not require `state: "active"` or `tradability: "tradable"`.

```typescript
// All options for an expiration
const options = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
});

// Specific strike + type
const calls = await client.findTradableOptions("AAPL", {
  expirationDate: "2026-04-17",
  strikePrice: 200,
  optionType: "call",
});
```

Options: `{ expirationDate?: string; strikePrice?: number; optionType?: "call" | "put" }`

### `getOptionMarketData(symbol, expirationDate, strikePrice, optionType): Promise<OptionMarketData[]>`

Returns greeks and pricing for a specific option. Requires all four parameters.

```typescript
const data = await client.getOptionMarketData("AAPL", "2026-04-17", 200, "call");
// => [{ adjusted_mark_price, delta, gamma, theta, vega, implied_volatility, open_interest, volume, ... }]
```

### `getIndexValue(symbol): Promise<IndexValue | null>`

Returns the current value of an index. Returns `null` for non-index symbols.

```typescript
const value = await client.getIndexValue("SPX");
// => { value: "5700.00", symbol: "SPX", instrument_id: "...", updated_at: "..." }

const notIndex = await client.getIndexValue("AAPL");
// => null
```

### `getOpenOptionPositions(accountNumber?): Promise<OptionPosition[]>`

```typescript
const positions = await client.getOpenOptionPositions();
```

### `orderOption(symbol, legs, price, quantity, direction, opts?): Promise<OptionOrder>`

```typescript
// Buy a single call
await client.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "buy", positionEffect: "open" }
], 3.50, 1, "debit");

// Sell to close
await client.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "sell", positionEffect: "close" }
], 4.00, 1, "credit");

// Bull call spread
await client.orderOption("AAPL", [
  { expirationDate: "2026-04-17", strike: 200, optionType: "call", side: "buy", positionEffect: "open" },
  { expirationDate: "2026-04-17", strike: 210, optionType: "call", side: "sell", positionEffect: "open" },
], 2.50, 1, "debit");
```
