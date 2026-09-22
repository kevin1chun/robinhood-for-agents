Official Robinhood Trading MCP (https://agent.robinhood.com/mcp/trading): its measured rate limit and the fork's parity with its 81 tools. The tools themselves, every field the server's `tools/list` answers, are [`official-mcp-tools.json`](official-mcp-tools.json), rewritten by `bun run refresh-official-tools` after `robinhood_official_login`. Source of truth for parity.

> **Scope:** both modes — the Parity table says which tools each mode serves; the rate limit is the hosted server's, so it applies to standard mode. Which mode: [MODES.md](MODES.md).

## Measured rate limit

This is the limit of the official hosted server (agent.robinhood.com), not of the REST API this package calls. Robinhood publishes no limit.
It was measured by an operator-run probe: one session, sequential calls with one in flight. `get_equity_historicals` on AAPL daily bars on 2026-09-18; `get_equity_quotes` and `get_equity_price_book` on 2026-09-19, same probe and method.
- **Sustained:** 4 calls/s (240/min) ran with no throttling on all three tools.
- **First `RATE_LIMITED`:** only in the 8/s phase — 92 to 124 calls into that phase, 531 to 561 calls into the run. A retry 5 s later always succeeded.
- **Latency:** p50 about 150 ms (267 ms in two phases of the quotes run), p95 about 300–370 ms.
- **One limit, probably account-wide:** three tools hit the same ceiling. That is a reading of the three runs, not a measured fact.
- **Not measured:** the throttle window and the exact ceiling.

`get_equity_historicals`:

```text
rate 0.5/s  sent 31  ok 31  throttled 0  p50 148  p95 320
rate 1/s  sent 61  ok 61  throttled 0  p50 152  p95 288
rate 2/s  sent 121  ok 121  throttled 0  p50 158  p95 298
rate 4/s  sent 224  ok 224  throttled 0  p50 160  p95 352
RATE_LIMITED at rate 8/s, call 561 (phase call 124), 26.6 s into the phase
rate 8/s  sent 124  ok 123  throttled 1  p50 165  p95 347
recovered after 5 s
```

`get_equity_quotes`:

```text
rate 0.5/s  sent 31  ok 31  throttled 0  p50 154  p95 345
rate 1/s  sent 61  ok 61  throttled 0  p50 151  p95 338
rate 2/s  sent 121  ok 121  throttled 0  p50 267  p95 366
rate 4/s  sent 215  ok 215  throttled 0  p50 269  p95 361
RATE_LIMITED at rate 8/s, call 551 (phase call 123), 22.8 s into the phase
rate 8/s  sent 123  ok 122  throttled 1  p50 148  p95 335
recovered after 5 s
```

`get_equity_price_book`:

```text
rate 0.5/s  sent 31  ok 31  throttled 0  p50 154  p95 325
rate 1/s  sent 61  ok 61  throttled 0  p50 158  p95 347
rate 2/s  sent 121  ok 121  throttled 0  p50 158  p95 316
rate 4/s  sent 226  ok 226  throttled 0  p50 160  p95 349
RATE_LIMITED at rate 8/s, call 531 (phase call 92), 16.0 s into the phase
rate 8/s  sent 92  ok 91  throttled 1  p50 154  p95 330
recovered after 5 s
```

## Parity

Fork tool per official tool. `same`, `renamed` and `new` are served by the web API in web mode: `same`: the fork already had `robinhood_<tool>`; `renamed`: served under another name before 3.0.0 (old names in `CHANGELOG.md` 3.0.0); `new`: added in 3.0.0. `standard-only`: no evidenced web endpoint, so served only in standard mode. In standard mode every row is relayed to the hosted MCP under the `robinhood_official_login` credential. `__tests__/server/official-parity.test.ts` checks every tool against `official-mcp-tools.json`: in web mode its input schema; in standard mode its title, description, input and output schemas and annotations, verbatim.

| Official tool | Fork tool | Status | Notes |
|---|---|---|---|
| `add_option_to_watchlist` | `robinhood_add_option_to_watchlist` | same | Long only; `position_type: "short"` is rejected (short-leg write unverified). |
| `add_to_watchlist` | `robinhood_add_to_watchlist` | same |  |
| `cancel_advanced_order` | `robinhood_cancel_advanced_order` | standard-only |  |
| `cancel_crypto_order` | `robinhood_cancel_crypto_order` | renamed |  |
| `cancel_equity_order` | `robinhood_cancel_equity_order` | renamed | Checks the order's account first. |
| `cancel_option_exercise` | `robinhood_cancel_option_exercise` | standard-only |  |
| `cancel_option_order` | `robinhood_cancel_option_order` | renamed | Checks the order's account first. |
| `create_alert` | `robinhood_create_alert` | standard-only |  |
| `create_scan` | `robinhood_create_scan` | standard-only |  |
| `create_watchlist` | `robinhood_create_watchlist` | same |  |
| `delete_alert` | `robinhood_delete_alert` | standard-only |  |
| `exercise_option` | `robinhood_exercise_option` | standard-only |  |
| `follow_watchlist` | `robinhood_follow_watchlist` | same |  |
| `get_accounts` | `robinhood_get_accounts` | same | `rhs_account_number` is scrubbed from the result. |
| `get_advanced_orders` | `robinhood_get_advanced_orders` | standard-only |  |
| `get_alert_log` | `robinhood_get_alert_log` | standard-only |  |
| `get_alerts` | `robinhood_get_alerts` | standard-only |  |
| `get_crypto_account_onboarding_info` | `robinhood_get_crypto_account_onboarding_info` | standard-only |  |
| `get_crypto_orders` | `robinhood_get_crypto_orders` | renamed |  |
| `get_crypto_positions` | `robinhood_get_crypto_positions` | renamed |  |
| `get_crypto_quotes` | `robinhood_get_crypto_quotes` | renamed | `timezone` accepted, timestamps UTC. |
| `get_currency_pairs` | `robinhood_get_currency_pairs` | new |  |
| `get_earnings_calendar` | `robinhood_get_earnings_calendar` | same | Built from `range=Nday` windows relative to today, filtered by report date. |
| `get_earnings_results` | `robinhood_get_earnings_results` | same |  |
| `get_equity_analyst_ratings` | `robinhood_get_equity_analyst_ratings` | standard-only |  |
| `get_equity_fundamentals` | `robinhood_get_equity_fundamentals` | renamed | `bounds` regular only. |
| `get_equity_historicals` | `robinhood_get_equity_historicals` | renamed | [start, end] mapped onto the REST span grid; `adjustment_type` split only. |
| `get_equity_news` | `robinhood_get_equity_news` | renamed | Also returns analyst ratings. |
| `get_equity_orders` | `robinhood_get_equity_orders` | renamed |  |
| `get_equity_positions` | `robinhood_get_equity_positions` | same | Non-zero positions; complete, `next_cursor` null. |
| `get_equity_price_book` | `robinhood_get_equity_price_book` | same |  |
| `get_equity_quotes` | `robinhood_get_equity_quotes` | renamed |  |
| `get_equity_tax_lots` | `robinhood_get_equity_tax_lots` | same |  |
| `get_equity_technical_indicators` | `robinhood_get_equity_technical_indicators` | new | Computed by this server from REST bars. |
| `get_equity_tradability` | `robinhood_get_equity_tradability` | same | Flags are instrument-level; `account_number` is echoed. |
| `get_financials` | `robinhood_get_financials` | standard-only |  |
| `get_index_historicals` | `robinhood_get_index_historicals` | standard-only |  |
| `get_index_quotes` | `robinhood_get_index_quotes` | same |  |
| `get_indexes` | `robinhood_get_indexes` | same |  |
| `get_limited_margin_upgrade_info` | `robinhood_get_limited_margin_upgrade_info` | standard-only |  |
| `get_option_chains` | `robinhood_get_option_chains` | renamed |  |
| `get_option_historicals` | `robinhood_get_option_historicals` | same | Intervals 5minute–week; `bounds` regular only. |
| `get_option_instruments` | `robinhood_get_option_instruments` | renamed |  |
| `get_option_level_upgrade_info` | `robinhood_get_option_level_upgrade_info` | standard-only |  |
| `get_option_orders` | `robinhood_get_option_orders` | same | Filters applied client-side; complete, `next_cursor` null. |
| `get_option_positions` | `robinhood_get_option_positions` | same | Filters applied client-side; complete, `next_cursor` null. |
| `get_option_quotes` | `robinhood_get_option_quotes` | renamed |  |
| `get_option_watchlist` | `robinhood_get_option_watchlist` | same |  |
| `get_pnl_trade_history` | `robinhood_get_pnl_trade_history` | same | Computed from order history (equity FIFO, crypto native); options excluded. |
| `get_politician_trades` | `robinhood_get_politician_trades` | standard-only |  |
| `get_popular_watchlists` | `robinhood_get_popular_watchlists` | same |  |
| `get_portfolio` | `robinhood_get_portfolio` | same |  |
| `get_realized_pnl` | `robinhood_get_realized_pnl` | same | Computed; `timezone` accepted, buckets on UTC days. |
| `get_scanner_datapoints` | `robinhood_get_scanner_datapoints` | standard-only |  |
| `get_scanner_filter_specs` | `robinhood_get_scanner_filter_specs` | same |  |
| `get_scans` | `robinhood_get_scans` | same |  |
| `get_sec_filing` | `robinhood_get_sec_filing` | standard-only | Robinhood's server fetches EDGAR; no Robinhood token leaves the fork.|
| `get_sec_filing_facts` | `robinhood_get_sec_filing_facts` | standard-only | Robinhood's server fetches EDGAR; no Robinhood token leaves the fork.|
| `get_sec_filing_facts_catalog` | `robinhood_get_sec_filing_facts_catalog` | standard-only | Robinhood's server fetches EDGAR; no Robinhood token leaves the fork.|
| `get_sec_filing_index` | `robinhood_get_sec_filing_index` | standard-only | Robinhood's server fetches EDGAR; no Robinhood token leaves the fork.|
| `get_watchlist_items` | `robinhood_get_watchlist_items` | same |  |
| `get_watchlists` | `robinhood_get_watchlists` | same |  |
| `mark_alerts_read` | `robinhood_mark_alerts_read` | standard-only |  |
| `place_advanced_order` | `robinhood_place_advanced_order` | standard-only |  |
| `place_crypto_order` | `robinhood_place_crypto_order` | same | market and limit only; `stop_loss`, `stop_limit`, `tax_lots` rejected. |
| `place_equity_order` | `robinhood_place_equity_order` | renamed | `dollar_amount` and `tax_lots` rejected. |
| `place_option_order` | `robinhood_place_option_order` | same | limit and stop_limit, regular_hours only; market types rejected. |
| `preview_crypto_order` | `robinhood_preview_crypto_order` | new | Read-only: validation plus quote-based estimates. |
| `preview_scan` | `robinhood_preview_scan` | standard-only |  |
| `remove_from_watchlist` | `robinhood_remove_from_watchlist` | same |  |
| `remove_option_from_watchlist` | `robinhood_remove_option_from_watchlist` | same | Long only. |
| `review_advanced_order` | `robinhood_review_advanced_order` | standard-only |  |
| `review_equity_order` | `robinhood_review_equity_order` | same | Reproduces the price collar only; `dollar_amount` and `tax_lots` rejected. |
| `review_option_order` | `robinhood_review_option_order` | same | Per-leg market data + chain collateral; thin check set. |
| `run_scan` | `robinhood_run_scan` | standard-only |  |
| `search` | `robinhood_search` | same |  |
| `unfollow_watchlist` | `robinhood_unfollow_watchlist` | same |  |
| `update_alert` | `robinhood_update_alert` | standard-only |  |
| `update_scan_config` | `robinhood_update_scan_config` | standard-only |  |
| `update_scan_filters` | `robinhood_update_scan_filters` | standard-only |  |
| `update_watchlist` | `robinhood_update_watchlist` | same |  |
