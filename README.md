# robinhood-for-agents

[![CI](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/robinhood-for-agents)](https://www.npmjs.com/package/robinhood-for-agents)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/kevin1chun)

robinhood-for-agents connects an AI agent to your Robinhood account. It is one MCP server with two ways in. **Agent mode** relays Robinhood's official hosted Trading MCP, 82 tools, and is the recommended setup. **Standard mode** speaks the web API that robinhood.com itself uses: 59 tools, every brokerage account, unofficial. A TypeScript client library (82 async methods) and a trading skill for Claude Code and OpenClaw come in the same package. Works with Claude Code, Codex, OpenClaw, and any MCP client.

## Quick start

1. Generate the key the agent-mode credential is encrypted under — 32 random bytes, base64, kept as `ROBINHOOD_TOKEN_KEY`:

   ```bash
   openssl rand -base64 32
   ```

2. Register the server. Claude Code shown; other clients are under [Install](#install), and all of them need [Bun](https://bun.sh/) v1.3+.

   ```bash
   claude mcp add -s user robinhood-agent -e ROBINHOOD_TOKEN_KEY=<base64 key> -- bunx robinhood-for-agents --mode agent
   ```

3. Restart the client, ask your agent to run `robinhood_official_login`, and approve once in the browser. Then prompt it: "show my portfolio".

The binary still defaults to standard, so agent mode needs `--mode agent` or `ROBINHOOD_MODE=agent`; without `ROBINHOOD_TOKEN_KEY` every agent-mode tool answers an error saying so.

## Choosing a mode

Use agent mode unless you need something only standard mode has. It is the surface Robinhood supports for agents: this server registers the 81 official tools with Robinhood's own titles, descriptions, schemas, and annotations, and relays every call unchanged to `agent.robinhood.com/mcp/trading`, so your agent sees exactly what Robinhood publishes. Orders in agent mode reach your Agentic account only; other accounts are read-only there. Standard mode is the trade you make for reach: it calls the web API robinhood.com itself uses, so it serves every brokerage account and backs the TypeScript client library, but it is not a surface Robinhood sanctions for agents.

29 tools exist only in agent mode, 7 only in standard mode: the Mode column in [Tools](#tools) says which is which, and the full comparison is [docs/MODES.md](docs/MODES.md). Running both means two entries, `robinhood-for-agents` (standard) and `robinhood-agent` (agent); tool names are identical in both, so your agent tells them apart by entry, and the two credentials are separate.

## Install

Prerequisites: [Bun](https://bun.sh/) v1.3+ and a Robinhood account. Agent mode needs `ROBINHOOD_TOKEN_KEY` on the server entry, and its one-time sign-in opens your browser with the macOS `open` command. Standard mode needs Google Chrome for login (driven by `playwright-core` via `channel: "chrome"`, no bundled browser) — there is no Brave/Chromium fallback and no `BROWSER_PATH` override.

### Guided setup

```bash
npx robinhood-for-agents onboard
npx robinhood-for-agents onboard --agent claude-code   # or codex, openclaw
```

It asks for your agent and, for Claude Code and Codex, the mode; registers the MCP server; and installs skills where supported. In standard mode it also walks you through the Chrome login and asks whether the agent runs on this machine or in Docker. It does not set `ROBINHOOD_TOKEN_KEY`, so for agent mode register the entry with the key as under Manual setup. `npx robinhood-for-agents install --mode agent` has the same gap; if you used it, run `claude mcp remove robinhood-agent` and then the manual command.

### Manual setup

<details>
<summary>Claude Code</summary>

```bash
# Agent mode (recommended) — the entry carries the key
claude mcp add -s user robinhood-agent -e ROBINHOOD_TOKEN_KEY=<base64 key> -- bunx robinhood-for-agents --mode agent
# Standard mode, global (available in all projects)
claude mcp add -s user robinhood-for-agents -- bunx robinhood-for-agents
# Skills, per-project and optional
cd your-project && npx robinhood-for-agents install --skills
```

From a source checkout, use `-- bun run /path/to/checkout/bin/robinhood-for-agents.ts` (plus `--mode agent`) instead. Restart Claude Code to pick up the changes; it supports the unified trading skill in addition to the MCP tools — see [What you can do](#what-you-can-do).
</details>

<details>
<summary>Codex</summary>

```bash
# Agent mode (recommended) — the entry carries the key
codex mcp add robinhood-agent --env ROBINHOOD_TOKEN_KEY=<base64 key> -- bunx robinhood-for-agents --mode agent
# Standard mode
codex mcp add robinhood-for-agents -- bunx robinhood-for-agents
```

From a source checkout, use `-- bun run /path/to/checkout/bin/robinhood-for-agents.ts` instead. Restart Codex to pick up the changes; it uses the MCP tools directly.
</details>

<details>
<summary>OpenClaw</summary>

Standard mode only — the skill uses the client library, which is the web-API path; there is no OpenClaw path to the hosted MCP.

```bash
clawhub install robinhood-for-agents            # via ClawHub (recommended)
robinhood-for-agents onboard --agent openclaw   # via the onboard CLI
```

Both install the unified `robinhood-for-agents` skill to `~/.openclaw/workspace/skills/`. No MCP server required — the skill uses the TypeScript client API directly via `bun`.
</details>

<details>
<summary>Other MCP clients (Claude Desktop, etc.)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop), keeping only the entries for the modes you use:

```json
{
  "mcpServers": {
    "robinhood-agent": {
      "command": "bunx",
      "args": ["robinhood-for-agents", "--mode", "agent"],
      "env": { "ROBINHOOD_TOKEN_KEY": "<base64 key>" }
    },
    "robinhood-for-agents": {
      "command": "bunx",
      "args": ["robinhood-for-agents"]
    }
  }
}
```

From a source checkout, use `"command": "bun", "args": ["run", "/absolute/path/to/checkout/bin/robinhood-for-agents.ts"]` (plus `"--mode", "agent"`) instead.
</details>

### From source

```bash
git clone https://github.com/kevin1chun/robinhood-for-agents.git
cd robinhood-for-agents
bun install
bun run onboard
bun bin/robinhood-for-agents.ts --mode agent   # or without the flag for standard mode
```

**What each client gets:**

| Feature | Claude Code | Codex | OpenClaw | Other MCP |
|---------|:-----------:|:-----:|:--------:|:---------:|
| MCP tools (both modes) | Yes | Yes | — | Yes |
| Trading skill | Yes | — | Yes | — |
| ClawHub install | — | — | Yes | — |
| `onboard` setup | Yes | Yes | Yes | — |
| Browser auth | Yes | Yes | Yes | Yes |

## Sign in

- **Agent:** ask your agent to run `robinhood_official_login`. It opens your default browser (macOS `open`) to Robinhood's sign-in for its hosted MCP; approve once, and the browser must be able to reach the server's `127.0.0.1` callback. Until it has run, every agent-mode tool answers an error naming it. The credential is stored as `official-mcp.enc`, AES-256-GCM under `ROBINHOOD_TOKEN_KEY`, never the keychain.
- **Standard:** say "setup robinhood" or call `robinhood_browser_login`. Chrome opens the real Robinhood login for your credentials and MFA; the capture is passive — a network intercept that never touches the page. The session is cached in the OS keychain, or in the encrypted file named by `ROBINHOOD_TOKENS_FILE`, and renews itself a day before expiry and again on any 401. Regular use keeps you logged in; a long idle gap lapses the refresh chain and needs a new browser login. `robinhood_check_session` probes the API and answers `logged_in`, `expired`, `unknown`, or `not_authenticated`.
- How tokens are stored and rotated, and what can go wrong: [docs/SECURITY.md](docs/SECURITY.md); the mechanics: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#authentication).

## What you can do

> "Buy 1 50-delta SPX call expiring tomorrow"

![SPX options chain with greeks and order summary](docs/images/spx-options-example.png)

The `robinhood-for-agents` skill turns that into guided workflows for setup, portfolio, research, trading, and options, on Claude Code and OpenClaw, from [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents) (`clawhub install robinhood-for-agents`). With Claude Code it drives whichever MCP entry you registered; standalone it uses the client library, so standard mode only, and agent-only tools need the `robinhood-agent` entry.

| Domain | Example Triggers |
|--------|-----------------|
| Setup | "setup robinhood", "connect to robinhood" |
| Portfolio | "show my portfolio", "my holdings" |
| Research | "research AAPL", "analyze TSLA" |
| Trading | "buy 10 AAPL", "sell my position" |
| Options | "show AAPL options", "SPX calls" |

The skill loads progressively from `skills/robinhood-for-agents/`: `SKILL.md` is the compact router, with domain files (`portfolio.md`, `trade.md`, …) and the full `client-api.md` reference on demand. More of what people do with it: [docs/USE_CASES.md](docs/USE_CASES.md).

## Tools

Tool names and input schemas are the official ones, prefixed `robinhood_` ([parity table](docs/official-mcp-tools.md#parity)); in agent mode each tool also carries Robinhood's own title, description, output schema and annotations verbatim from [`docs/official-mcp-tools.json`](docs/official-mcp-tools.json), and the hosted server's measured rate limit is in [docs/official-mcp-tools.md](docs/official-mcp-tools.md#measured-rate-limit). The **Mode** column: `agent` = only in agent mode; `standard` = only in standard mode; `both` = the web API in standard mode, relayed in agent mode.

| Tool | Mode | Description |
|------|------|-------------|
| `robinhood_browser_login` | standard | Authenticate via Chrome browser |
| `robinhood_check_session` | standard | Probe the cached session: `logged_in` / `expired` / `unknown` / `not_authenticated` |
| `robinhood_get_accounts` | both | List all brokerage accounts |
| `robinhood_get_account` | standard | Account details and profile |
| `robinhood_get_portfolio` | both | Portfolio: positions, P&L, equity, cash, buying power |
| `robinhood_get_equity_positions` | both | Raw equity positions (shares, avg price) |
| `robinhood_get_equity_tax_lots` | both | Open tax lots for one equity holding (cost basis, term, open date) |
| `robinhood_get_equity_quotes` | both | Stock quotes and fundamentals |
| `robinhood_get_equity_fundamentals` | both | Fundamentals: float, shares outstanding, valuation, profile |
| `robinhood_get_equity_historicals` | both | OHLCV bars over a time range |
| `robinhood_get_equity_technical_indicators` | both | RSI, MACD, Bollinger, moving averages, ATR, VWAP, … (computed) |
| `robinhood_get_short_interest` | standard | Daily short-interest estimate (% of float, with bounds) |
| `robinhood_get_equity_price_book` | both | Level-2 price book (bid/ask depth) |
| `robinhood_get_equity_tradability` | both | Tradability flags (fractional, short-selling, per-account type) |
| `robinhood_get_equity_news` | both | News and analyst ratings |
| `robinhood_get_earnings_results` | both | Earnings for a symbol (EPS estimate vs. actual) |
| `robinhood_get_earnings_calendar` | both | Market-wide earnings calendar for a day window |
| `robinhood_search` | both | Search stocks/ETFs, crypto pairs, or indexes |
| `robinhood_get_movers` | standard | Market movers and popular stocks |
| `robinhood_get_market_hours` | standard | Market hours for a date: is it a trading day, when each session opens/closes |
| `robinhood_get_indexes` | both | Market index instruments (SPX, NDX, VIX, …) with ids |
| `robinhood_get_index_quotes` | both | Current values for index instrument ids |
| `robinhood_get_option_chains` | both | Option chains for an underlying (expirations, chain ids) |
| `robinhood_get_option_instruments` | both | Option contracts of a chain (filter by expiration, strike, type) |
| `robinhood_get_option_quotes` | both | Option market data with greeks |
| `robinhood_get_option_positions` | both | Per-leg option positions |
| `robinhood_get_option_orders` | both | Option order history |
| `robinhood_get_option_historicals` | both | OHLC bars for option contracts |
| `robinhood_get_crypto_quotes` | both | Crypto quotes |
| `robinhood_get_crypto_positions` | both | Crypto holdings |
| `robinhood_get_crypto_historicals` | standard | Crypto OHLCV history |
| `robinhood_get_currency_pairs` | both | Tradable crypto pairs |
| `robinhood_review_equity_order` | both | Simulate a stock order before placing (price-collar check, live quote) |
| `robinhood_review_option_order` | both | Simulate an option order before placing (per-leg data, collateral) |
| `robinhood_preview_crypto_order` | both | Preview a crypto order before placing (quote-based estimate) |
| `robinhood_place_equity_order` | both | Place stock orders (market/limit/stop_market/stop_limit, incl. `sell_short`) |
| `robinhood_place_option_order` | both | Place option orders (1–4 legs by option id) |
| `robinhood_place_crypto_order` | both | Place crypto orders |
| `robinhood_get_equity_orders` | both | Stock order history (filter by id, symbol, state) |
| `robinhood_get_crypto_orders` | both | Crypto order history (filter by id, symbol, state) |
| `robinhood_cancel_equity_order` | both | Cancel a stock order |
| `robinhood_cancel_option_order` | both | Cancel an option order |
| `robinhood_cancel_crypto_order` | both | Cancel a crypto order |
| `robinhood_get_watchlists` | both | List your own watchlists (with list ids) |
| `robinhood_get_watchlist_items` | both | Items of a watchlist (enriched with symbols) |
| `robinhood_get_popular_watchlists` | both | Robinhood-curated lists to follow |
| `robinhood_get_option_watchlist` | both | Your options watchlist — single-leg option contracts |
| `robinhood_create_watchlist` | both | Create a new watchlist (confirm first) |
| `robinhood_update_watchlist` | both | Rename / re-describe a watchlist (confirm first) |
| `robinhood_add_to_watchlist` | both | Add symbols / indexes / crypto to a list (confirm first) |
| `robinhood_remove_from_watchlist` | both | Remove items from a list (confirm first) |
| `robinhood_follow_watchlist` | both | Follow a Robinhood-curated list (confirm first) |
| `robinhood_unfollow_watchlist` | both | Unfollow a curated list (confirm first) |
| `robinhood_add_option_to_watchlist` | both | Add long single-leg option contracts to the options watchlist (confirm first) |
| `robinhood_remove_option_from_watchlist` | both | Remove single-leg option contracts from the options watchlist (confirm first) |
| `robinhood_get_scans` | both | List your saved scanners (screeners) |
| `robinhood_get_scanner_filter_specs` | both | Filter vocabulary for building scans (RSI/MACD/fundamentals/…) |
| `robinhood_get_realized_pnl` | both | Realized P&L over a window, bucketed (computed FIFO; equity + crypto) |
| `robinhood_get_pnl_trade_history` | both | Per-trade realized P&L (computed FIFO; equity + crypto) |
| `robinhood_official_login` | agent | Sign in to Robinhood's hosted MCP (browser) |
| `robinhood_cancel_advanced_order`, `robinhood_cancel_option_exercise`, `robinhood_create_alert`, `robinhood_create_scan`, `robinhood_delete_alert`, `robinhood_exercise_option`, `robinhood_get_advanced_orders`, `robinhood_get_alert_log`, `robinhood_get_alerts`, `robinhood_get_crypto_account_onboarding_info`, `robinhood_get_equity_analyst_ratings`, `robinhood_get_financials`, `robinhood_get_index_historicals`, `robinhood_get_limited_margin_upgrade_info`, `robinhood_get_option_level_upgrade_info`, `robinhood_get_politician_trades`, `robinhood_get_scanner_datapoints`, `robinhood_get_sec_filing`, `robinhood_get_sec_filing_facts`, `robinhood_get_sec_filing_facts_catalog`, `robinhood_get_sec_filing_index`, `robinhood_mark_alerts_read`, `robinhood_place_advanced_order`, `robinhood_preview_scan`, `robinhood_review_advanced_order`, `robinhood_run_scan`, `robinhood_update_alert`, `robinhood_update_scan_config`, `robinhood_update_scan_filters` | agent | No web endpoint: advanced (OCO) orders, option exercise, alerts, scanner writes and datapoints, financials, SEC filings, politician trades, index historicals, onboarding and upgrade info |

## Placing orders

Both modes run **review → confirm → place**: `robinhood_review_equity_order` simulates the order over read-only endpoints (live quote plus a reproduction of Robinhood's price collar) and places nothing; show its result to the user, get an explicit confirmation, then call `robinhood_place_equity_order`. The client-side constraint checks below run in standard mode only — agent mode relays the call unchanged for Robinhood to validate, and agent-mode orders reach the Agentic account only.

**Side** — `buy`, `sell`, or `sell_short`:

| Intent | Side | Notes |
|---|---|---|
| Open / add to a long | `buy` | Fractional shares supported |
| Close a long | `sell` | Only sells shares you hold |
| **Open a short** | `sell_short` | Margin-enabled account, whole shares only |
| **Cover a short** | `buy` | No separate cover side exists |

`sell` only closes a long, and selling shares the account does not hold is rejected with `Not enough shares to sell.` `sell_short` opens a short and carries unlimited loss, so confirm the user meant a short rather than selling a holding. Short sales also need a margin-enabled account, whole shares, `gfd` time-in-force, and either the regular or extended session — not the 24 Hour Market.

**Trading session** — `market_hours` defaults to `regular_hours`, as in the official tool:

| Value | Window | Executes |
|---|---|---|
| `regular_hours` | 09:30–16:00 ET | All order types |
| `extended_hours` | Pre / post-market | Limit orders only |
| `all_day_hours` | 24 Hour Market (overnight) | Limit orders only |

An order tagged to the wrong session queues for the next open instead of executing, which looks like success until it is not, so name the session when trading outside regular hours; `robinhood_get_market_hours` says which one is live. A runnable walkthrough is [`examples/short-selling.ts`](examples/short-selling.ts), the full order flow is [`skills/robinhood-for-agents/trade.md`](skills/robinhood-for-agents/trade.md), and the session rules are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#trading-sessions).

## Client library

```typescript
import { RobinhoodClient } from "robinhood-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

Standard mode only — the client library is the web-API path, and no client-library path to the hosted MCP exists. All 82 methods are async and every account-scoped method takes `accountNumber`; the reference, including `EncryptedFileTokenStore` and direct-`accessToken` construction, is [`skills/robinhood-for-agents/client-api.md`](skills/robinhood-for-agents/client-api.md).

## Docker and headless

With no OS keychain and no browser, both modes keep their credential in an encrypted file under `ROBINHOOD_TOKEN_KEY` and sign in on the host.

- **Agent:** `official-mcp.enc` lives in the directory of `ROBINHOOD_TOKENS_FILE`, so mount that directory, not a single file, and set `ROBINHOOD_MODE=agent` — [docs/DOCKER.md](docs/DOCKER.md#agent-mode).
- **Standard:** run `npx robinhood-for-agents onboard` on the host and pick "Docker container / remote host". It exports `./tokens.enc`, copies the key to the clipboard, and prints the env vars to set — [docs/DOCKER.md](docs/DOCKER.md#standard-mode).

Keep the mount read-write: refresh writes the rotated token back, refresh tokens are single-use, and a failed save logs `CRITICAL` to stderr and strands the container after restart. Run one process per token file. The encrypted file stops casual disk access, not an agent with shell access in the container that can read the env var and decrypt, so only run agents you trust; the threat model is in [docs/SECURITY.md](docs/SECURITY.md).

## Safety

- Fund transfers and bank operations are never exposed. Bulk cancel is never exposed. They are absent by design, not gated.
- Every order is confirmed with the user before it is placed; the skill enforces review → confirm → place.
- Orders take the account, symbol, side, and order type explicitly; `time_in_force` and `market_hours` default to `gfd` and `regular_hours`, as the official tools do.
- Opening a short needs the explicit `sell_short` side; a plain `sell` can only close a long, so a mis-parsed "sell" can never open an unbounded-risk position.
- Order writes resolve the symbol by exact match, never a fuzzy search, so an order cannot land on a same-prefix or relisted duplicate ticker.
- Agent mode: every order is relayed to Robinhood's hosted MCP and reaches the Agentic account only.
- Standard-mode tokens live in the OS keychain by default or an AES-256-GCM file; the agent-mode credential is an encrypted file only.
- No real PII anywhere in this repo: examples use placeholders like `"ACCOUNT_ID"`.
- Risk matrix: [docs/ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md). Threat model: [docs/SECURITY.md](docs/SECURITY.md). Multi-agent identity and gateway auth: [docs/AGENT-IDENTITY.md](docs/AGENT-IDENTITY.md), [docs/GATEWAY-AUTH.md](docs/GATEWAY-AUTH.md).

## Development

```bash
bun install
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # all tests — vitest, not `bun test`
```

Integration tests hit the real Robinhood API read-only and are excluded from CI: run `npx robinhood-for-agents onboard`, then `bun run test:integration`. Design and auth flow: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Adding tools and skills: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Disclaimer

This project is **not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.** "Robinhood" is a trademark of Robinhood Markets, Inc. This software interacts with Robinhood's services through publicly accessible interfaces but is an independent, third-party tool.

**USE AT YOUR OWN RISK.** This software enables AI agents to read data from and place orders on your Robinhood brokerage account. Automated and AI-assisted trading carries inherent risks, including but not limited to:

- Unintended order execution due to AI misinterpretation
- Financial losses from erroneous trades
- Stale or inaccurate market data
- Software bugs or unexpected behavior

You are solely responsible for all activity on your brokerage account, whether initiated manually or through this software. The authors and contributors assume no liability for any financial losses, damages, or other consequences arising from the use of this software. Review all AI-proposed actions before confirming, and never grant unsupervised trading authority to any automated system.

This software is provided "as is" without warranty of any kind. See [LICENSE](LICENSE) for full terms.

## A note from the maintainer

I'm a solo developer. I built this for myself and keep it current because I use it every day, and I share it so other people can get the same joy out of it. If it's useful to you, [a coffee](https://buymeacoffee.com/kevin1chun) helps keep it maintained. Issues and pull requests are always welcome.

## License

MIT — see [LICENSE](LICENSE).
