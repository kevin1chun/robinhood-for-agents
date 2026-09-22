# Two integrations: standard mode and web mode

This package ships two separate Robinhood integrations, and a server process runs exactly one of them. The mode is chosen at launch: `--mode standard|web`, else `ROBINHOOD_MODE`, else `standard`. Registered as MCP entries they are `robinhood-for-agents` (standard mode) and `robinhood-web` (web mode).

## Which should I use

**Use standard mode unless you need something only web mode has.** It is Robinhood's official, supported MCP surface: this server registers the 81 official tools with Robinhood's own title, description, schemas and annotations verbatim, and relays every call unchanged to `agent.robinhood.com/mcp/trading`, so what your agent sees is exactly what Robinhood publishes. It is the recommended setup and the default, so it needs no flag.

**Choose web mode deliberately** when you need one of:

- Orders on any brokerage account — standard mode trades the Agentic account only, and reads the others.
- The TypeScript client library — its 82 async methods are the web-API path; no client-library path to the hosted MCP exists.
- One of the seven web-only tools: `robinhood_browser_login`, `robinhood_check_session`, `robinhood_get_account`, `robinhood_get_short_interest`, `robinhood_get_movers`, `robinhood_get_market_hours`, `robinhood_get_crypto_historicals`.

What you give up: web mode is unofficial — it calls the web API that robinhood.com itself uses, not a surface Robinhood supports for agents — and the 29 standard-only tools are unavailable (advanced/OCO orders, option exercise, alerts, scanner writes and datapoints, financials, SEC filings, politician trades, index historicals, onboarding and upgrade info).

**Both at once:** register two entries, `robinhood-for-agents` and `robinhood-web`. Tool names are identical in both, so your agent tells them apart by entry, and the two credentials are separate.

## Side by side

| | Standard mode | Web mode |
|---|---|---|
| Surface | Robinhood's hosted Trading MCP, `agent.robinhood.com/mcp/trading` — official, relayed unchanged | Robinhood's web API (`api.robinhood.com` and siblings) — unofficial |
| Tools | 82: the 81 official tools plus `robinhood_official_login` (`src/server/official/forward.ts`) | 59 (`src/server/tools/*.ts`) |
| Transport | Every call forwarded to the hosted MCP; no web-API code path | Direct HTTPS to the web API through `src/client/` |
| Credential + login tool | Robinhood's official OAuth credential, minted by `robinhood_official_login` (PKCE browser sign-in, own DCR client) | The Chrome session, minted by `robinhood_browser_login` (passive Playwright intercept of `/oauth2/token`) |
| Credential storage | `official-mcp.enc` only (AES-256-GCM) — beside `ROBINHOOD_TOKENS_FILE`, else `~/.robinhood-for-agents/official-mcp.enc`; key from `ROBINHOOD_TOKEN_KEY` only, and a missing key is an error; never the OS keychain | OS keychain by default, or an AES-256-GCM file when `ROBINHOOD_TOKENS_FILE` is set |
| Accounts | Orders reach the Agentic account only; other accounts are read-only | Every brokerage account |
| Tool metadata | Robinhood's own title, description, schemas and annotations, verbatim from `docs/official-mcp-tools.json` | This package's schemas, which take the official names and input schemas |
| Only here | The 29 standard-only tools | The seven web-only tools above; the TypeScript client library; the computed tools (technical indicators, realized P&L) |
| Docs | [DOCKER.md](DOCKER.md#standard-mode), [SECURITY.md](SECURITY.md#standard-mode-credential) | [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md) |

Which mode serves each individual tool: [Parity table](official-mcp-tools.md#parity).

## Setup, per mode

**Standard mode:** [Install](../README.md#install) → [Sign in](../README.md#sign-in) → [Docker](DOCKER.md#standard-mode) → [credential threat model](SECURITY.md#standard-mode-credential).

**Web mode:** [Install](../README.md#install) → [Sign in](../README.md#sign-in) → [Authentication](ARCHITECTURE.md#authentication) → [Docker](DOCKER.md#web-mode) → [threat model](SECURITY.md).

## Where each is documented

| Doc | Scope |
|---|---|
| [README.md](../README.md) | Both modes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Both; the diagrams and the auth, HTTP, multi-account and order sections are web mode |
| [SECURITY.md](SECURITY.md) | Both — web-mode session tokens and the standard-mode credential |
| [DOCKER.md](DOCKER.md) | Both; a section each |
| [ACCESS_CONTROLS.md](ACCESS_CONTROLS.md) | Both |
| [USE_CASES.md](USE_CASES.md) | Both unless noted |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Web mode |
| [AGENT-IDENTITY.md](AGENT-IDENTITY.md), [GATEWAY-AUTH.md](GATEWAY-AUTH.md) | Mode-independent |
| [official-mcp-tools.md](official-mcp-tools.md) | Both — the parity split and the hosted server's rate limit |
| `official-mcp-tools.json` | Standard mode — generated, never edited by hand |
