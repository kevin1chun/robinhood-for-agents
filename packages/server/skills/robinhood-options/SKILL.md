---
name: robinhood-options
description: Explore and analyze options chains from Robinhood. Use when user asks about options, calls, puts, or options strategies.
allowed-tools: mcp__rh-agent-tools__*
---

# robinhood-options

Explore and analyze options chains.

## Triggers
- "show AAPL options"
- "find calls expiring next month"
- "options chain for TSLA"
- "covered call opportunities"
- "put options for SPY"

## Instructions

### Step 1: Fetch Options Data
Use `rh-agent-tools:robinhood_get_options` with parameters:
- `symbol` (required): stock ticker
- `expiration_date` (optional): filter by date "YYYY-MM-DD"
- `strike_price` (optional): filter by strike
- `option_type` (optional): "call" or "put"

The tool returns:
- **`chain_info`**: chain ID, available `expiration_dates`
- **`options`**: list of tradable option instruments with `strike_price`, `expiration_date`, `type`
- **`market_data`** (when all filters provided): greeks and pricing

### Common Workflows

#### View Available Expirations
Call `rh-agent-tools:robinhood_get_options` with just `symbol`. The response's `chain_info.expiration_dates` lists all available dates.

#### Full Options Chain for a Date
Call `rh-agent-tools:robinhood_get_options` with `symbol` + `expiration_date`. Returns all strikes for that expiration.

#### Specific Option with Greeks
Call `rh-agent-tools:robinhood_get_options` with all four parameters (`symbol`, `expiration_date`, `strike_price`, `option_type`). The `market_data` field will include greeks.

#### Covered Call Screening
1. Get user's holdings via `rh-agent-tools:robinhood_get_portfolio`
2. For each stock holding with 100+ shares, call `rh-agent-tools:robinhood_get_options` filtering for OTM calls 30-45 DTE
3. Calculate annualized premium yield from the market data

#### Open Option Positions
Call `rh-agent-tools:robinhood_get_orders` with `order_type: "option"`, `status: "open"`.

### Key Data Fields

**Option instrument**: `strike_price`, `expiration_date`, `type` (call/put), `state`, `tradability`

**Market data** (greeks): `adjusted_mark_price`, `delta`, `gamma`, `theta`, `vega`, `rho`, `implied_volatility`, `open_interest`, `volume`, `chance_of_profit_long`, `chance_of_profit_short`, `high_price`, `low_price`, `last_trade_price`

### Output Format
Present options data as a table:
- Strike | Type | Bid | Ask | Last | Delta | IV | Volume | OI | Prob Profit

## Programmatic Access
For TypeScript scripts using `@rh-agent-tools/client`, see [client-api.md](client-api.md).

## MCP Tools Used
| Tool | Purpose |
|------|---------|
| `rh-agent-tools:robinhood_get_options` | Chain info, options list, greeks |
| `rh-agent-tools:robinhood_get_stock_quote` | Current underlying price |
| `rh-agent-tools:robinhood_get_portfolio` | Holdings for covered call screening |
| `rh-agent-tools:robinhood_get_orders` | View open option orders |
| `rh-agent-tools:robinhood_place_option_order` | Place option trades |
