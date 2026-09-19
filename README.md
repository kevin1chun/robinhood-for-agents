# robinhood-for-agents

[![CI](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/kevin1chun/robinhood-for-agents/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/robinhood-for-agents)](https://www.npmjs.com/package/robinhood-for-agents)
[![ClawHub](https://img.shields.io/badge/ClawHub-robinhood--for--agents-blue)](https://clawhub.ai/kevin1chun/robinhood-for-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Robinhood for AI agents — MCP server with two modes + TypeScript client library.

- **MCP server in two modes** for any MCP-compatible AI agent: standard (59 tools on the web API) or agent (81 tools relayed to Robinhood's hosted MCP)
- **Unified trading skill** for guided workflows (Claude Code, OpenClaw, [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents))
- **TypeScript client library** (70+ async methods) for programmatic use
- **Pluggable token storage** — OS keychain (default) or encrypted file (Docker/headless)
- **Self-renewing sessions** — tokens refresh ahead of expiry and on 401, so continuous use never needs a re-login

Compatible with **Claude Code**, **Codex**, **OpenClaw**, and any MCP-compatible agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.3+
- Google Chrome for login (driven by `playwright-core` via `channel: "chrome"`, no bundled browser). Chrome must be installed — there's no Brave/Chromium fallback or `BROWSER_PATH` override yet.
- A Robinhood account

## Quick Start

### Guided setup (recommended)

```bash
# Requires Bun runtime — see Prerequisites
npx robinhood-for-agents onboard
```

The interactive setup detects your agent, registers the MCP server, installs skills (where supported), and walks you through Robinhood login. It handles both local and Docker deployments — just pick "This machine" or "Docker container / remote host" when prompted.

You can also specify your agent directly:

```bash
npx robinhood-for-agents onboard --agent claude-code
npx robinhood-for-agents onboard --agent codex
npx robinhood-for-agents onboard --agent openclaw
```

### From source

```bash
git clone https://github.com/kevin1chun/robinhood-for-agents.git
cd robinhood-for-agents
bun install
bun run onboard
```

### Manual setup

<details>
<summary>Claude Code</summary>

```bash
# Register MCP server (global — available in all projects)
claude mcp add -s user robinhood-for-agents -- bunx robinhood-for-agents

# Install skills (per-project, optional)
cd your-project
npx robinhood-for-agents install --skills
```

From a source checkout, register the server as `claude mcp add -s user robinhood-for-agents -- bun run /path/to/checkout/bin/robinhood-for-agents.ts` instead. For [agent mode](#modes), add a second entry: `claude mcp add -s user robinhood-agent -e ROBINHOOD_TOKEN_KEY=<base64 key> -- bunx robinhood-for-agents --mode agent` (or `npx robinhood-for-agents install --mode agent`).

Restart Claude Code to pick up the changes. Claude Code supports the unified trading skill in addition to the MCP tools — see [Skill](#skill).
</details>

<details>
<summary>Codex</summary>

```bash
codex mcp add robinhood-for-agents -- bunx robinhood-for-agents
```

From a source checkout, use `-- bun run /path/to/checkout/bin/robinhood-for-agents.ts` instead. For [agent mode](#modes): `codex mcp add robinhood-agent --env ROBINHOOD_TOKEN_KEY=<base64 key> -- bunx robinhood-for-agents --mode agent`.

Restart Codex to pick up the changes. Codex uses the MCP tools directly.
</details>

<details>
<summary>OpenClaw</summary>

**Via ClawHub (recommended):**
```bash
clawhub install robinhood-for-agents
```

**Via onboard CLI:**
```bash
robinhood-for-agents onboard --agent openclaw
```

Both install the unified `robinhood-for-agents` skill to `~/.openclaw/workspace/skills/`. No MCP server required — the skill uses the TypeScript client API directly via `bun`.

</details>

<details>
<summary>Other MCP clients (Claude Desktop, etc.)</summary>

Add to your MCP client's config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "robinhood-for-agents": {
      "command": "bunx",
      "args": ["robinhood-for-agents"]
    }
  }
}
```

From a source checkout, use `"command": "bun", "args": ["run", "/absolute/path/to/checkout/bin/robinhood-for-agents.ts"]` instead.
</details>

## Example

> "Buy 1 50-delta SPX call expiring tomorrow"

![SPX options chain with greeks and order summary](docs/images/spx-options-example.png)

## Authenticate

Start your agent and say "setup robinhood" (or call `robinhood_browser_login` directly). Your browser will open to the real Robinhood login page — log in with your credentials and MFA. The session is cached in your OS keychain and renews itself: the client refreshes the token a day before it expires, and again on any 401. Regular use keeps you logged in indefinitely — a browser re-login is only needed if the client sits unused long enough for the refresh chain to lapse. Ask your agent to run `robinhood_check_session` if you're unsure.

In agent mode, ask your agent to run `robinhood_official_login` instead: it opens your default browser to Robinhood's sign-in for its hosted MCP, and you approve there once.

## Modes

The server runs in one mode per process, chosen at launch: `--mode agent|standard`, else `ROBINHOOD_MODE`, else `standard`.

- **Standard** (59 tools): Robinhood's web API (`api.robinhood.com`) under the Chrome session from `robinhood_browser_login`. Serves every account.
- **Agent** (81 tools): the 80 official Robinhood Trading MCP tools, each relayed unchanged to Robinhood's hosted MCP (`agent.robinhood.com`), plus `robinhood_official_login`, a one-time browser sign-in for Robinhood's official credential. Until it has run, every tool answers an error naming it. Orders reach your Agentic account only; other accounts are read-only there. The credential is kept only in an AES-256-GCM file, never the OS keychain: `official-mcp.enc` beside `ROBINHOOD_TOKENS_FILE`, else `~/.robinhood-for-agents/official-mcp.enc`, encrypted under `ROBINHOOD_TOKEN_KEY` (32 random bytes, base64: `openssl rand -base64 32`), which must be set in the agent-mode server's environment.

To run both, register two entries, `robinhood-for-agents` (standard) and `robinhood-agent` (`--mode agent`; `install --mode agent` does this for Claude Code). Tool names are the same in both; your agent tells them apart by entry.

Tool names and input schemas are the official ones, prefixed `robinhood_` ([`docs/official-mcp-tools.md`](docs/official-mcp-tools.md#parity)). The official hosted server's measured rate limit is in [`docs/official-mcp-tools.md`](docs/official-mcp-tools.md#measured-rate-limit).

Mode `both`: the web API in standard mode, relayed in agent mode.

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
| `robinhood_cancel_advanced_order`, `robinhood_cancel_option_exercise`, `robinhood_create_alert`, `robinhood_create_scan`, `robinhood_delete_alert`, `robinhood_exercise_option`, `robinhood_get_advanced_orders`, `robinhood_get_alert_log`, `robinhood_get_alerts`, `robinhood_get_crypto_account_onboarding_info`, `robinhood_get_financials`, `robinhood_get_index_historicals`, `robinhood_get_limited_margin_upgrade_info`, `robinhood_get_option_level_upgrade_info`, `robinhood_get_politician_trades`, `robinhood_get_scanner_datapoints`, `robinhood_get_sec_filing`, `robinhood_get_sec_filing_facts`, `robinhood_get_sec_filing_facts_catalog`, `robinhood_get_sec_filing_index`, `robinhood_mark_alerts_read`, `robinhood_place_advanced_order`, `robinhood_preview_scan`, `robinhood_review_advanced_order`, `robinhood_run_scan`, `robinhood_update_alert`, `robinhood_update_scan_config`, `robinhood_update_scan_filters` | agent | No web endpoint: advanced (OCO) orders, option exercise, alerts, scanner writes and datapoints, financials, SEC filings, politician trades, index historicals, onboarding and upgrade info |

## Placing Orders

Every order goes through **review → confirm → place**. `robinhood_review_equity_order` simulates the order over read-only endpoints (live quote + a reproduction of Robinhood's price collar) and places nothing; show its result to the user, get an explicit confirmation, then call `robinhood_place_equity_order`.

**Side** — `buy`, `sell`, or `sell_short`:

| Intent | Side | Notes |
|---|---|---|
| Open / add to a long | `buy` | Fractional shares supported |
| Close a long | `sell` | Only sells shares you hold |
| **Open a short** | `sell_short` | Margin-enabled account, whole shares only |
| **Cover a short** | `buy` | No separate cover side exists |

`sell` closes a long position — it does **not** open a short. Selling stock the account doesn't hold is rejected by Robinhood with `Not enough shares to sell.` Use `sell_short` to open a short. Shorting carries unlimited loss potential, so confirm the user asked to open a *short* rather than to sell a holding.

Short sales additionally require a margin-enabled account, whole shares, `gfd` time-in-force, and either the regular or extended session — they are **not** available in the 24 Hour Market. Each constraint is checked client-side, so you get the reason rather than an opaque rejection.

**Trading session** — `market_hours` defaults to `regular_hours`, as in the official tool:

| Value | Window | Executes |
|---|---|---|
| `regular_hours` | 09:30–16:00 ET | All order types |
| `extended_hours` | Pre / post-market | Limit orders only |
| `all_day_hours` | 24 Hour Market (overnight) | Limit orders only |

An order tagged to the wrong session **silently queues for the next open instead of executing** — a failure that looks like success — so name the session when trading outside regular hours; `robinhood_get_market_hours` says which one is live. A short sell placed outside regular hours is rejected unless the session says so.

See [`examples/short-selling.ts`](examples/short-selling.ts) for a runnable walkthrough, and [`skills/robinhood-for-agents/trade.md`](skills/robinhood-for-agents/trade.md) for the full order flow.

## Skill

A single unified skill (`robinhood-for-agents`) provides guided workflows for auth, portfolio, research, trading, and options. Available on [ClawHub](https://clawhub.ai/kevin1chun/robinhood-for-agents) and supported by **Claude Code** and **OpenClaw**.

```bash
# Install via ClawHub
clawhub install robinhood-for-agents
```

| Domain | Example Triggers |
|--------|-----------------|
| Setup | "setup robinhood", "connect to robinhood" |
| Portfolio | "show my portfolio", "my holdings" |
| Research | "research AAPL", "analyze TSLA" |
| Trading | "buy 10 AAPL", "sell my position" |
| Options | "show AAPL options", "SPX calls" |

**Dual-mode:** The skill works with MCP tools (Claude Code) or standalone via the TypeScript client API and `bun` (OpenClaw, any agent with shell access). No MCP server required.

The skill uses progressive disclosure — `SKILL.md` is the compact router, with domain-specific files (`portfolio.md`, `trade.md`, etc.) and a full `client-api.md` reference loaded on demand.

## Agent Compatibility

| Feature | Claude Code | Codex | OpenClaw | Other MCP |
|---------|:-----------:|:-----:|:--------:|:---------:|
| MCP tools (both modes) | Yes | Yes | — | Yes |
| Trading skill | Yes | — | Yes | — |
| ClawHub install | — | — | Yes | — |
| `onboard` setup | Yes | Yes | Yes | — |
| Browser auth | Yes | Yes | Yes | Yes |

## Client Library (standalone)

```typescript
import { RobinhoodClient } from "robinhood-for-agents";

const client = new RobinhoodClient();
await client.restoreSession();

const quotes = await client.getQuotes("AAPL");
const portfolio = await client.buildHoldings();
```

## Docker / Headless Deployment

When deploying in Docker, headless servers, or cloud environments where no OS keychain is available, use the `EncryptedFileTokenStore`:

### Setup

The guided setup handles Docker — pick "Docker container / remote host" when prompted:

```bash
npx robinhood-for-agents onboard
```

This will:
1. Open Chrome for Robinhood login (on the host)
2. Encrypt tokens and export to `./tokens.enc`
3. Print the encryption key and env vars to set in your container

### Manual setup

```bash
# 1. Login on the host
npx robinhood-for-agents onboard

# 2. In your container, set env vars:
export ROBINHOOD_TOKENS_FILE=/path/to/tokens.enc
export ROBINHOOD_TOKEN_KEY=<base64-key-from-step-1>
export ROBINHOOD_MODE=standard   # or agent; its credential is official-mcp.enc beside ROBINHOOD_TOKENS_FILE, under the same key
```

```yaml
# docker-compose.yml
services:
  agent:
    image: your-agent-image
    volumes:
      - ./tokens.enc:/app/tokens.enc:rw
    environment:
      ROBINHOOD_TOKENS_FILE: "/app/tokens.enc"
      ROBINHOOD_TOKEN_KEY: "${ROBINHOOD_TOKEN_KEY}"
      ROBINHOOD_MODE: "standard"
```

Token refresh writes re-encrypted tokens back to the file automatically — keep the mount read-write. Refresh tokens are single-use: Robinhood kills the old one the instant a new one is issued, so a failed write leaves the only usable copy in memory and the container is stranded after restart. The client logs a `CRITICAL` message to stderr when a save fails — alert on it. See [docs/DOCKER.md](docs/DOCKER.md).

> **Security warning:** The encrypted file protects against casual disk access (image leaks, accidental exposure) but NOT against a malicious agent with shell access in the container — it can read the env var and decrypt. Only run agents you trust. See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

## Safety

- **Pluggable token storage** — `KeychainTokenStore` (OS keychain, default) or `EncryptedFileTokenStore` (AES-256-GCM, for Docker/headless). See [SECURITY.md](docs/SECURITY.md) for the threat model.
- Fund transfers and bank operations are **blocked** — never exposed
- Bulk cancel operations are **blocked**
- Order placements require the account, symbol, side, and order type explicitly. `time_in_force` and `market_hours` default to `gfd` and `regular_hours`, matching the official tools.
- Opening a short requires the explicit `sell_short` side; a plain `sell` can only close a long, so a mis-parsed "sell" can never open an unbounded-risk position
- Order writes resolve the symbol by exact match, never a fuzzy search, so an order cannot land on a same-prefix or relisted duplicate ticker
- Skills always confirm with the user before placing orders
- See [ACCESS_CONTROLS.md](docs/ACCESS_CONTROLS.md) for the full risk matrix
- For multi-agent deployments, see [AGENT-IDENTITY.md](docs/AGENT-IDENTITY.md) for agent identity verification and per-tool authorization patterns

## Authentication

**Login**: Call `robinhood_browser_login` (MCP) or say "setup robinhood" (skills) to open Chrome. Log in normally with your credentials and MFA. Playwright passively intercepts the OAuth token response — it never clicks buttons or fills forms.

**Token storage** uses pluggable `TokenStore` adapters:

| Store | When to use | Config |
|---|---|---|
| `KeychainTokenStore` (default) | Local dev, macOS/Linux with desktop | Nothing — works out of the box |
| `EncryptedFileTokenStore` | Docker, headless servers, CI, cloud | Set `ROBINHOOD_TOKENS_FILE` + `ROBINHOOD_TOKEN_KEY` env vars |
| Direct `accessToken` | Serverless, testing, short-lived scripts | Pass `accessToken` to constructor or set `ROBINHOOD_ACCESS_TOKEN` env var — no refresh; expiry raises `TokenExpiredError` |

**How it works**: `restoreSession()` loads tokens from the configured `TokenStore`, injects `Authorization: Bearer` headers directly into API requests, and registers both refresh paths — a pre-request hook that renews the token 24 hours ahead of expiry, and a 401 handler that refreshes and retries once. Sessions saved before token expiry was tracked are backfilled on load, so existing keychain logins get proactive renewal without re-authenticating.

**Session lifetime**: Access-token TTL varies (~6–8.5 days observed — never assume a fixed number). Robinhood rotates refresh tokens on every use: each refresh returns a new one and instantly invalidates the old, so it is the refresh *chain*, not the access token, that keeps you logged in. Regular use keeps the chain alive; a long idle gap lets it lapse.

**When a session expires**: API calls raise `TokenExpiredError` (a subclass of `AuthenticationError`) instead of a bare `HTTP 401`, and `robinhood_check_session` probes the API and reports:

| Status | Meaning |
|---|---|
| `logged_in` | Tokens loaded and a live API probe succeeded |
| `expired` | Tokens no longer work and could not be refreshed — run `robinhood_browser_login` |
| `unknown` | Probe failed for a transient/network reason; the session may still be fine |
| `not_authenticated` | No tokens in the store — run `robinhood-for-agents onboard` |

Recovery is always the same: re-run browser login (`robinhood_browser_login`, or say "setup robinhood").

**One writer per token store**: rotation is single-use, so two processes sharing one store can poison each other — the loser refreshes with a token the winner already spent. The client recovers by re-reading the store and adopting whatever the other process persisted, but there is no cross-process lock. Point a single process at a given store where you can.

```typescript
import { RobinhoodClient, EncryptedFileTokenStore } from "robinhood-for-agents";

// Default: KeychainTokenStore
const client = new RobinhoodClient();

// Docker/headless: EncryptedFileTokenStore (auto-detected from ROBINHOOD_TOKENS_FILE env)
const client = new RobinhoodClient({ tokenStore: new EncryptedFileTokenStore() });

// Direct token (no store, no refresh — expiry surfaces as TokenExpiredError)
const client = new RobinhoodClient({ accessToken: "..." });
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full auth flow and [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

## Development

```bash
bun install                    # Install deps
bun run typecheck              # tsc --noEmit
bun run check                  # Biome lint + format
npx vitest run                 # Run all tests
```

### Integration tests (verify local setup)

Integration tests hit the real Robinhood API (read-only). Use them to confirm your local dev environment is working end-to-end.

```bash
# 1. Login (opens Chrome — one-time)
npx robinhood-for-agents onboard

# 2. Run integration tests
bun run test:integration
```

These are excluded from CI and the default test commands since they require real credentials.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full system design, authentication flow, HTTP pipeline, and exception hierarchy.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for how to add new tools, create skills, and run tests.

## Disclaimer

This project is **not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.** "Robinhood" is a trademark of Robinhood Markets, Inc. This software interacts with Robinhood's services through publicly accessible interfaces but is an independent, third-party tool.

**USE AT YOUR OWN RISK.** This software enables AI agents to read data from and place orders on your Robinhood brokerage account. Automated and AI-assisted trading carries inherent risks, including but not limited to:

- Unintended order execution due to AI misinterpretation
- Financial losses from erroneous trades
- Stale or inaccurate market data
- Software bugs or unexpected behavior

You are solely responsible for all activity on your brokerage account, whether initiated manually or through this software. The authors and contributors assume no liability for any financial losses, damages, or other consequences arising from the use of this software. Review all AI-proposed actions before confirming, and never grant unsupervised trading authority to any automated system.

This software is provided "as is" without warranty of any kind. See [LICENSE](LICENSE) for full terms.

## License

MIT — see [LICENSE](LICENSE).
