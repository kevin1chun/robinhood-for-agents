# Access Controls

> **Scope:** both modes. Rows tagged "(agent mode)" exist only in agent mode; every other tool exists in both (per-tool split: [official-mcp-tools.md](official-mcp-tools.md#parity)). In agent mode every call is relayed to Robinhood's hosted MCP and orders reach the Agentic account only. Which mode: [MODES.md](MODES.md).

## Risk Levels

The **Skill** column references domain files of the unified `robinhood-for-agents` skill (e.g. `portfolio.md`, `trade.md` under `skills/robinhood-for-agents/`).

### Low Risk (Read Operations)
All data retrieval operations. No financial impact.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Portfolio/Holdings | `robinhood_get_portfolio` | `portfolio.md` |
| Account/Profile | `robinhood_get_account` | - |
| Stock Quotes/Data | `robinhood_get_equity_quotes`, `robinhood_get_equity_fundamentals` | `research.md` |
| Historical Data / Indicators | `robinhood_get_equity_historicals`, `robinhood_get_equity_technical_indicators` | `research.md` |
| News/Ratings | `robinhood_get_equity_news` | `research.md` |
| Options Data | `robinhood_get_option_chains`, `robinhood_get_option_instruments`, `robinhood_get_option_quotes` | `options.md` |
| Crypto Data | `robinhood_get_crypto_quotes`, `robinhood_get_crypto_positions`, `robinhood_get_crypto_historicals`, `robinhood_get_currency_pairs` | - |
| Market Movers | `robinhood_get_movers` | - |
| Search | `robinhood_search` | - |
| Order History / Status | `robinhood_get_equity_orders`, `robinhood_get_option_orders`, `robinhood_get_crypto_orders` | - |
| Session Check | `robinhood_check_session` | - |
| Dividends/Documents | - | via code |
| Watchlists (read) | `robinhood_get_watchlists`, `robinhood_get_watchlist_items`, `robinhood_get_popular_watchlists`, `robinhood_get_option_watchlist` | via skill |
| Scanners (read) | `robinhood_get_scans`, `robinhood_get_scanner_filter_specs` | via skill |
| Realized P&L (read, computed) | `robinhood_get_realized_pnl`, `robinhood_get_pnl_trade_history` | via skill |
| Tax Lots (read) | `robinhood_get_equity_tax_lots` | via skill |
| Order Review (read, simulation) | `robinhood_review_equity_order`, `robinhood_review_option_order`, `robinhood_preview_crypto_order` | `trade.md` |
| Agent-mode reads | `robinhood_get_advanced_orders`, `robinhood_review_advanced_order`, `robinhood_get_alerts`, `robinhood_get_alert_log`, `robinhood_get_scanner_datapoints`, `robinhood_preview_scan`, `robinhood_run_scan`, `robinhood_get_sec_filing`, `robinhood_get_sec_filing_facts`, `robinhood_get_sec_filing_facts_catalog`, `robinhood_get_sec_filing_index`, `robinhood_get_financials`, `robinhood_get_politician_trades`, `robinhood_get_index_historicals`, `robinhood_get_option_level_upgrade_info`, `robinhood_get_limited_margin_upgrade_info`, `robinhood_get_crypto_account_onboarding_info` | - |

### Medium Risk
Operations with limited financial impact or credential exposure. Includes **reversible, non-financial writes** (watchlist mutations): confirm-before-calling, single-target/single-operation, no order surface.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Authentication | `robinhood_browser_login`, `robinhood_official_login` | `setup.md` |
| Cancel Single Order | `robinhood_cancel_equity_order`, `robinhood_cancel_option_order`, `robinhood_cancel_crypto_order` | `trade.md` |
| Watchlist Add/Remove | `robinhood_add_to_watchlist`, `robinhood_remove_from_watchlist` | via skill |
| Watchlist Create/Update | `robinhood_create_watchlist`, `robinhood_update_watchlist` | via skill |
| Watchlist Follow/Unfollow | `robinhood_follow_watchlist`, `robinhood_unfollow_watchlist` | via skill |
| Options Watchlist Add/Remove | `robinhood_add_option_to_watchlist`, `robinhood_remove_option_from_watchlist` | via skill |
| Advanced Order / Exercise Cancel (agent mode) | `robinhood_cancel_advanced_order`, `robinhood_cancel_option_exercise` | - |
| Alerts (agent mode) | `robinhood_create_alert`, `robinhood_update_alert`, `robinhood_delete_alert`, `robinhood_mark_alerts_read` | - |
| Scanner Writes (agent mode) | `robinhood_create_scan`, `robinhood_update_scan_config`, `robinhood_update_scan_filters` | - |

### High Risk (Write Operations)
Order placement. Account, symbol (or legs), side, and order type are always explicit.

| Operation | MCP Tool | Skill |
|-----------|----------|-------|
| Stock Orders | `robinhood_place_equity_order` | `trade.md` |
| Short Sales | `robinhood_place_equity_order` (`side: "sell_short"`) | `trade.md` |
| Option Orders | `robinhood_place_option_order` | `trade.md` |
| Crypto Orders | `robinhood_place_crypto_order` | `trade.md` |
| OCO Orders (agent mode, Agentic account only) | `robinhood_place_advanced_order` | - |
| Option Exercise (agent mode, Agentic account only) | `robinhood_exercise_option` | - |

Short sales sit at the top of this tier: losses are theoretically unbounded, and "sell" in a user's request almost always means *close my position*. Opening a short therefore requires its own side value (`sell_short`) rather than being inferred from an account holding no shares, so a mis-parsed "sell" fails with `Not enough shares to sell.` instead of silently opening a short. The skill requires the confirmation to be labelled **SHORT SELL**.

### Blocked (Critical Risk)
These operations are **never exposed** through MCP tools or skills.

| Operation | Rationale |
|-----------|-----------|
| Fund Transfers (`withdrawl_funds_to_bank_account`) | Irreversible financial impact |
| Deposits (`deposit_funds_to_robinhood_account`) | Irreversible financial impact |
| Bank Unlinking | Could lock user out of transfers |
| Bulk Cancel (`cancel_all_stock_orders`, etc.) | Too destructive without per-order review |

## Safety Measures

### MCP Tools
- Order tools take the official Robinhood Trading MCP schemas: account, symbol (or option legs), side, and type are explicit; `time_in_force` defaults to `gfd` and `market_hours` to `regular_hours`, as in the official tools
- An order tagged to the wrong session silently queues for the next open instead of executing — name `market_hours` when trading outside regular hours, and use `robinhood_get_market_hours` to find out which session is live rather than guessing from the local clock. (`robinhood_place_option_order` accepts `regular_hours` only.)
- A parameter value the standard REST API cannot serve (e.g. `dollar_amount` on equity orders, `tax_lots`, crypto stop orders) is rejected with a reason, never approximated
- Cancels are single-order; the equity and option cancel tools first check that the order belongs to the given account
- Risky positions are never inferred: opening a short requires `side: "sell_short"`. A plain `sell` cannot open one even partially — an over-sized sell is rejected in full (`Not enough shares to sell.`) rather than closing the held portion and shorting the rest
- Order writes resolve symbols by exact match (never a fuzzy search), so a write cannot land on a same-prefix or relisted duplicate ticker; ambiguous tickers are refused rather than guessed
- Blocked operations return error messages explaining why

### Skills
- Trade skill always shows order preview and waits for user confirmation
- Scripts display current price and estimated cost before proceeding
- Blocked operations are documented as "never use" in reference files

### General
- Access-token lifetime varies (~6–8.5 days observed). Tokens renew automatically — proactively ~24h before expiry, and on a 401 as a fallback — so a session in regular use stays alive; one left idle past the refresh-token lifetime lapses and needs a new browser login
- Browser-based login only — no credentials pass through the tool layer
- No plaintext credential on disk: standard-mode session tokens live in the OS keychain via `Bun.secrets` (default) or an AES-256-GCM file; the agent-mode credential lives only in an AES-256-GCM file keyed by `ROBINHOOD_TOKEN_KEY`, never the keychain
- See [SECURITY.md](./SECURITY.md) for the full threat model and deployment tiers
