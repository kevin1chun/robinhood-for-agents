---
name: robinhood-options
description: Explore and analyze options chains from Robinhood. Use when user asks about options, calls, puts, or options strategies.
allowed-tools: mcp__robinhood-for-agents__*
---

# robinhood-options

Explore and analyze options chains.

## Triggers
- "show AAPL options"
- "find calls expiring next month"
- "options chain for TSLA"
- "covered call opportunities"
- "put options for SPY"
- "SPX calls"
- "0DTE SPX options"
- "index options for NDX"
- "VIX puts"

## Instructions

### Step 1: Fetch Options Data
Use `robinhood-for-agents:robinhood_get_options` with parameters:
- `symbol` (required): stock or index ticker
- `expiration_date` (optional): filter by date "YYYY-MM-DD"
- `strike_price` (optional): filter by strike
- `option_type` (optional): "call" or "put"
- `max_strikes` (optional): limit to N strikes nearest ATM — use this for large chains like SPX to reduce response size (e.g. `max_strikes: 10`)

The tool returns:
- **`chain_info`**: chain ID, available `expiration_dates`
- **`options`**: list of tradable option instruments with `strike_price`, `expiration_date`, `type`
- **`market_data`** (when all filters provided): greeks and pricing

### Common Workflows

#### View Available Expirations
Call `robinhood-for-agents:robinhood_get_options` with just `symbol`. The response's `chain_info.expiration_dates` lists all available dates.

#### Full Options Chain for a Date
Call `robinhood-for-agents:robinhood_get_options` with `symbol` + `expiration_date`. Returns all strikes for that expiration.

#### Specific Option with Greeks
Call `robinhood-for-agents:robinhood_get_options` with all four parameters (`symbol`, `expiration_date`, `strike_price`, `option_type`). The `market_data` field will include greeks.

#### Covered Call Screening
1. Get user's holdings via `robinhood-for-agents:robinhood_get_portfolio`
2. For each stock holding with 100+ shares, call `robinhood-for-agents:robinhood_get_options` filtering for OTM calls 30-45 DTE
3. Calculate annualized premium yield from the market data

#### Open Option Positions
Call `robinhood-for-agents:robinhood_get_orders` with `order_type: "option"`, `status: "open"`.

### Index Options (SPX, NDX, VIX, RUT, XSP)

Index options work the same as equity options — just pass the index symbol (e.g. `symbol: "SPX"`). The tool auto-detects index symbols and routes through the correct API.

**Chain selection**: Indexes like SPX have two chains:
- **SPXW** — daily expirations (0DTE, 1DTE, weeklies), PM-settled
- **SPX** — monthly expirations only (3rd Friday), AM-settled

The tool auto-selects the correct chain based on `expiration_date`. If no date is specified, SPXW (more expirations) is returned by default.

**Index value**: The response includes an `index_value` field with the current index level. You can also use `robinhood_get_stock_quote` with `symbols: "SPX"` to get the current index value.

**Key differences from equity options**: Index options are European-style (exercise at expiration only) and cash-settled (no stock delivery).

### Key Data Fields

**Option instrument**: `strike_price`, `expiration_date`, `type` (call/put), `state`, `tradability` (note: `state`/`tradability` values may differ outside market hours)

**Market data** (greeks): `adjusted_mark_price`, `delta`, `gamma`, `theta`, `vega`, `rho`, `implied_volatility`, `open_interest`, `volume`, `chance_of_profit_long`, `chance_of_profit_short`, `high_price`, `low_price`, `last_trade_price`

### Placing Option Orders
Before placing any option order, call `robinhood-for-agents:robinhood_get_accounts` to get the user's accounts. If multiple accounts exist, **ask the user which account to use** — never pick on their behalf. Pass the chosen `account_number` (required) to `robinhood-for-agents:robinhood_place_option_order`.

### Output Format
Present options data as a table:
- Strike | Type | Bid | Ask | Last | Delta | IV | Volume | OI | Prob Profit

## Programmatic Access
For TypeScript scripts using `robinhood-for-agents`, see [client-api.md](client-api.md).

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `robinhood-for-agents:robinhood_get_accounts` | Get account numbers (required for placing orders) |
| `robinhood-for-agents:robinhood_get_options` | Chain info, options list, greeks (equities + indexes) |
| `robinhood-for-agents:robinhood_get_stock_quote` | Current underlying price (also works for index values: SPX, NDX, etc.) |
| `robinhood-for-agents:robinhood_get_portfolio` | Holdings for covered call screening |
| `robinhood-for-agents:robinhood_get_orders` | View open option orders |
| `robinhood-for-agents:robinhood_place_option_order` | Place option trades |
