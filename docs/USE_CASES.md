# Use Cases

## Interactive (Skills via Claude Code)

### Morning Portfolio Check
**User**: "How's my portfolio doing?"
**Claude**: Writes script calling `build_holdings()`, computes daily P&L, formats table.
**Output**: "Portfolio: $45,230 (+1.2% today). Top gainer: NVDA +3.4%. Top loser: META -1.1%."

### Stock Research Before Buying
**User**: "Research PLTR before I decide to buy"
**Claude**: Writes script pulling fundamentals, news, ratings, earnings, 1-year price history. Computes 52-week range position, PE context. Outputs structured research report.

### Options Screening
**User**: "Find covered call opportunities on my holdings"
**Claude**: Gets holdings, fetches options chains for each, filters OTM calls 30-45 DTE, calculates annualized premium yield, sorts by yield.

### Dividend Income Tracking
**User**: "Show me my dividend history"
**Claude**: Writes script calling `get_dividends()`, groups by instrument, calculates totals by quarter.

### Order Management
**User**: "Cancel my open TSLA order"
**Claude**: Gets open orders, finds TSLA, confirms with user, cancels.

## Programmatic (MCP via External Agents)

### Automated Rebalancing
1. Agent calls `robinhood_get_portfolio()` → gets current allocation
2. Compares to target allocation
3. Calls `robinhood_get_stock_quote()` for current prices
4. Determines trades needed
5. Calls `robinhood_place_stock_order()` for each trade

### Multi-Agent Trading System
1. **Research agent** calls MCP tools to gather market data
2. Passes analysis to **decision agent**
3. Decision agent calls MCP order tools
4. **Monitoring agent** polls open orders via MCP

### Price Alert System
1. Agent periodically calls `robinhood_get_stock_quote()` for watchlist
2. Compares to threshold prices
3. Triggers notifications or orders when conditions met

### Portfolio Reporting
1. Agent calls `robinhood_get_portfolio()` daily
2. Stores snapshots for historical tracking
3. Generates performance reports with trends

## End-to-End with Taji

### Onboarding
1. Agent calls `robinhood_get_portfolio()` + `robinhood_get_orders()` via MCP
2. Agent transforms data to Taji schema (strip PII, normalize positions)
3. Agent runs `taji onboarding submit --positions '[...]' --demographics '{...}' --message '...'`
4. Agent relays Taji's Q&A questions to human, runs `taji onboarding answer "..."`

### Trade Execution (Taji-coordinated)
1. `taji ask "Should I buy NVDA?"` → gets trade proposal with `trade_intent_id`
2. `taji trade approve <id>` → human-approved
3. `taji trade validate <id> --params '{...}' --artifact '{...}'` → Taji verifies params match proposal
4. `robinhood_place_stock_order` (MCP) → executes on brokerage
5. `robinhood_get_order_status` (MCP) → monitors fill
6. `taji trade fill <id> --fill '{...}' --artifact '{...}'` → reports fill to Taji, portfolio updated
