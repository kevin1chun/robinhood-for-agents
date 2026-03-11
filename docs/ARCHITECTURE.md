# robinhood-for-agents — Architecture & Design

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User / Claude                            │
│                                                                 │
│   "show my portfolio"          robinhood_get_portfolio(...)     │
│          │                              │                       │
│          ▼                              ▼                       │
│   ┌─────────────┐              ┌──────────────┐                 │
│   │   Skills    │              │  MCP Tools   │                 │
│   │ (SKILL.md)  │              │ (JSON-RPC)   │                 │
│   └──────┬──────┘              └──────┬───────┘                 │
│          │                            │                         │
│          │  RobinhoodClient()         │  getClient() singleton  │
│          │  .restoreSession()        │  getAuthenticatedRh()   │
│          │  .getPositions()           │                         │
│          ▼                            ▼                         │
│   ┌───────────────────────────────────────────┐                 │
│   │      src/client/                          │                 │
│   │      robinhood-for-agents                        │                 │
│   │  ┌─────────────────────────────────────┐  │                 │
│   │  │  session: RobinhoodSession (fetch)  │  │                 │
│   │  │  loggedIn: boolean                  │  │                 │
│   │  │                                     │  │                 │
│   │  │  auth.ts  ──► token-store (AES-GCM) │  │                 │
│   │  │  http.ts  ──► get/post/delete+paging│  │                 │
│   │  │  urls.ts  ──► pure endpoint builders│  │                 │
│   │  └─────────────────────────────────────┘  │                 │
│   └──────────────────┬────────────────────────┘                 │
│                      │                                          │
│                      ▼                                          │
│            api.robinhood.com                                    │
│            nummus.robinhood.com (crypto)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Single-package design.** `src/client/` is the standalone API client. `src/server/` is the MCP server that wraps it.

## Tech Stack

| Choice | Rationale |
|--------|-----------|
| **Bun** | Native TS execution, fast startup, built-in fetch |
| **ESM-only** | Bun is ESM-native, no CJS needed |
| **@modelcontextprotocol/sdk** | Official MCP SDK, StdioServerTransport for agent compatibility |
| **Zod v3.24** | Runtime validation of API responses + MCP tool parameter schemas |
| **Vitest** | Fast TS-native testing, correct module isolation via `vi.mock()` |
| **Biome v2** | All-in-one lint + format, 10-25x faster than ESLint |
| **Bun.secrets** | OS keychain access (macOS Keychain Services, Linux libsecret) |
| **playwright-core** | Browser auth via system Chrome, no bundled browser (~1MB) |

## File Map

```
src/client/                    <- robinhood-for-agents client library
├── index.ts                   <- Exports: RobinhoodClient, getClient(), login()
├── client.ts                  <- RobinhoodClient class (~50 async methods)
├── auth.ts                    <- Session restore + token refresh
├── token-store.ts             <- Token storage via OS keychain (Bun.secrets)
├── session.ts                 <- fetch wrapper (headers, timeouts, auth)
├── http.ts                    <- GET/POST/DELETE with pagination + error mapping
├── urls.ts                    <- Pure URL builders (api.robinhood.com, nummus.robinhood.com)
├── errors.ts                  <- Exception hierarchy
├── types.ts                   <- Zod schemas + inferred types
└── branded.ts                 <- AccountNumber, OrderId, etc. branded types

src/server/                    <- robinhood-for-agents MCP server
├── index.ts                   <- main() export, StdioServerTransport
├── server.ts                  <- McpServer creation + tool registration
├── browser-auth.ts            <- Playwright browser login capture
└── tools/
    ├── auth.ts               <- robinhood_browser_login, robinhood_check_session
    ├── portfolio.ts          <- robinhood_get_portfolio, _get_accounts, _get_account
    ├── stocks.ts             <- robinhood_get_stock_quote, _get_historicals, _get_news, _search
    ├── options.ts            <- robinhood_get_options
    ├── crypto.ts             <- robinhood_get_crypto
    ├── orders.ts             <- robinhood_place_stock_order, _option, _crypto, _cancel, _get_orders
    └── markets.ts            <- robinhood_get_movers

.claude/skills/
├── robinhood-setup/          <- Interactive login (SKILL.md)
├── robinhood-portfolio/      <- Multi-account portfolio display
├── robinhood-research/       <- Stock research report
├── robinhood-trade/          <- Order placement with confirmation
└── robinhood-options/        <- Options chain scanner
```

## Authentication

### Full Auth Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  robinhood_browser_login              restoreSession()                  │
│  (first-time / expired)               (every tool call)                │
│          │                                    │                         │
│          ▼                                    ▼                         │
│  ┌───────────────────┐               loadTokens()                      │
│  │ Playwright launches│               Bun.secrets.get() from           │
│  │ system Chrome      │               OS keychain                      │
│  │ (headless: false)  │               (macOS Keychain Services)        │
│  └────────┬──────────┘                        │                        │
│           │                                   │                         │
│           ▼                                   ▼                         │
│  ┌───────────────────┐               Set Authorization header          │
│  │ Navigate to        │               Validate: GET /positions/        │
│  │ robinhood.com/login│                       │                         │
│  └────────┬──────────┘                  ┌─────┴─────┐                  │
│           │                           Valid?      Invalid?             │
│           ▼                             │           │                   │
│  ┌───────────────────┐            return        ┌──┘                   │
│  │ User logs in       │           "cached"       │                      │
│  │ (email, password,  │                          ▼                      │
│  │  MFA push/SMS)     │              POST /oauth2/token/               │
│  └────────┬──────────┘              (grant_type: refresh_token,        │
│           │                          expires_in: 734000)               │
│           ▼                                 │                           │
│  ┌───────────────────────────┐       ┌──────┴──────┐                   │
│  │ Robinhood frontend calls   │    Success?      Failure?             │
│  │ POST /oauth2/token         │       │              │                  │
│  │                            │  saveTokens()     throw                │
│  │ Playwright intercepts:     │  return          AuthError             │
│  │  request  → device_token   │  "refreshed"     "Use browser_login"  │
│  │  response → access_token,  │                                        │
│  │             refresh_token   │                                        │
│  └────────┬──────────────────┘                                         │
│           │                                                             │
│           ▼                                                             │
│  saveTokens() ──► token-store.ts                                       │
│           │       Bun.secrets.set() → OS keychain                      │
│           │       (tokens never written to disk)                       │
│           │                                                            │
│           │                                                             │
│           ▼                                                             │
│  restoreSession() ──► client ready                                     │
│  getAccountProfile() → account_hint                                    │
│  Close browser                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The left path is the **initial login** (browser-based, user-interactive). The right path is the **session restore** (automatic, every tool call). When the cached access token is invalid, it attempts a silent refresh using the stored `refresh_token` (with `expires_in: 734000` ~8.5 days, matching pyrh). If refresh also fails, the user is directed back to browser login.

### Why Browser-Based Auth

The browser login is **purely passive** — Playwright never clicks buttons, fills forms, or predicts the login flow. It opens a real Chrome window, the user completes login entirely on their own (including whatever MFA Robinhood requires), and Playwright only intercepts the network traffic:

- `page.on("request")` captures `device_token` from POST body to `/oauth2/token`
- `page.on("response")` captures `access_token` + `refresh_token` from the 200 response

This design is resilient to Robinhood UI changes — it doesn't depend on any DOM selectors, page structure, or login step ordering. As long as the OAuth token endpoint exists, the interception works. `playwright-core` is used (not `playwright`) so no browser binary is bundled — it drives the user's system Chrome.

### Encrypted Token Storage

```
┌─ token-store.ts ──────────────────────────────────────────────────┐
│                                                                    │
│  SAVE                                                              │
│  ────                                                              │
│  TokenData (JSON):                                                 │
│  {access_token, refresh_token, token_type, device_token, saved_at} │
│         │                                                          │
│         ▼                                                          │
│  JSON.stringify()                                                  │
│         │                                                          │
│         ▼                                                          │
│  Bun.secrets.set("robinhood-for-agents", "session-tokens", json)         │
│  → OS encrypts and stores in keychain                              │
│  → No file written to disk                                         │
│                                                                    │
│                                                                    │
│  LOAD                                                              │
│  ────                                                              │
│  Bun.secrets.get("robinhood-for-agents", "session-tokens")               │
│         │                                                          │
│         ▼                                                          │
│  JSON.parse() → TokenData                                          │
│                                                                    │
│                                                                    │
│  STORAGE                                                           │
│  ───────                                                           │
│  Primary: OS Keychain via Bun.secrets                              │
│  ├── macOS: Keychain Services                                      │
│  ├── Linux: libsecret (GNOME Keyring, KWallet)                    │
│  └── Windows: Credential Manager                                   │
│  Tokens never touch the filesystem.                                │
│                                                                    │
│  Fallback: plaintext JSON (~/.robinhood-for-agents/session.json)          │
│  (CI environments, minimal installs without keychain)              │
└────────────────────────────────────────────────────────────────────┘
```

`Bun.secrets` stores tokens directly in the OS keychain — no intermediate encryption layer needed since the keychain itself provides encryption, access control, and tamper resistance. When `Bun.secrets` is unavailable (CI, headless servers), tokens fall back to a plaintext JSON file with a console warning.

## HTTP Layer

### Request Pipeline

```
client.get(url, { dataType: "pagination", params: {...} })
    │
    ▼
http.requestGet(session, url, { dataType, params })
    │
    ▼
session.get(url, params)                <- native fetch
    │
    ├── Headers: Accept, Content-Type, X-Robinhood-API-Version: 1.431.4
    ├── Auth: Bearer {access_token}
    ├── Timeout: AbortSignal.timeout(16000)
    │
    ▼
raiseForStatus(response)
    ├── 404 -> NotFoundError
    ├── 429 -> RateLimitError
    └── other non-2xx -> APIError(statusCode, responseBody)
    │
    ▼
dataType processing:
    ├── "regular"    -> return response.json()
    ├── "results"    -> return data.results
    ├── "indexzero"  -> return data.results[0]
    └── "pagination" -> follow data.next links, accumulate all results
```

### Exception Hierarchy

```
RobinhoodError
├── AuthenticationError
│   └── TokenExpiredError
├── NotLoggedInError
└── APIError  (.statusCode, .responseBody)
    ├── RateLimitError
    └── NotFoundError
```

Every error carries context. No silent `undefined` returns.

## Multi-Account

Standard Robinhood `/accounts/` only returns the default APEX account. We always pass:

```typescript
const MULTI_ACCOUNT_PARAMS = {
  default_to_all_accounts: "true",
  include_managed: "true",
  include_multiple_individual: "true",
};
```

Every account-scoped method accepts `accountNumber?: string`:
- `getPositions({ accountNumber })` — positions for specific account
- `orderStock(..., { accountNumber })` — place order on specific account
- `buildHoldings({ accountNumber })` — P&L for specific account
- Omitted → default account

## MCP Tools (18 total)

```
┌──────────────────────────────────────────────────────┐
│  MCP Tool                    Client Methods Wrapped  │
├──────────────────────────────────────────────────────┤
│  robinhood_browser_login     (Playwright browser)    │
│  robinhood_check_session     restoreSession()        │
│  robinhood_get_portfolio     buildHoldings()         │
│                              getAccountProfile()     │
│                              getPortfolioProfile()   │
│  robinhood_get_accounts      getAccounts()           │
│  robinhood_get_account       getAccountProfile()     │
│                              getUserProfile()        │
│                              getInvestmentProfile()  │
│  robinhood_get_stock_quote   getQuotes()             │
│                              getFundamentals()       │
│  robinhood_get_historicals   getStockHistoricals()   │
│  robinhood_get_news          getNews()               │
│  robinhood_search            findInstruments()       │
│  robinhood_get_options       getChains()             │
│                              findTradableOptions()   │
│                              getOptionMarketData()   │
│  robinhood_get_crypto        getCryptoQuote()        │
│                              getCryptoHistoricals()  │
│                              getCryptoPositions()    │
│  robinhood_get_orders        getAllStockOrders()      │
│                              getOpenStockOrders()    │
│                              (+ option, crypto)      │
│  robinhood_place_stock_order orderStock()            │
│  robinhood_place_option_order orderOption()          │
│  robinhood_place_crypto_order orderCrypto()          │
│  robinhood_cancel_order      cancelStockOrder()      │
│                              cancelOptionOrder()     │
│                              cancelCryptoOrder()     │
│  robinhood_get_order_status  getStockOrder()         │
│                              getOptionOrder()        │
│                              getCryptoOrder()        │
│  robinhood_get_movers        getTopMovers()          │
│                              getTopMoversSp500()     │
│                              getTop100()             │
└──────────────────────────────────────────────────────┘
```

Each tool accesses the client via `getClient()` singleton.

## Order Placement

### Order Type Resolution

`orderStock()` determines type from which price parameters are set:

```
Parameters present          -> (orderType, trigger)
─────────────────────────────────────────────────
trailAmount                 -> ("market", "stop")      trailing stop
stopPrice + limitPrice      -> ("limit",  "stop")      stop-limit
stopPrice only              -> ("market", "stop")      stop-loss
limitPrice only             -> ("limit",  "immediate") limit
none                        -> ("market", "immediate") market
```

Market buy orders include a 5% price collar (`preset_percent_limit: "0.05"`).

### Safety Model

```
┌─────────────┬──────────────────────────────────────────┐
│   Tier      │  Operations                              │
├─────────────┼──────────────────────────────────────────┤
│  Allowed    │  All read operations (quotes, positions, │
│             │  orders, historicals, news, options)      │
├─────────────┼──────────────────────────────────────────┤
│  Guarded    │  Order placement — requires explicit     │
│             │  parameters, no dangerous defaults.      │
│             │  Claude must confirm with user first.    │
├─────────────┼──────────────────────────────────────────┤
│  Blocked    │  Fund transfers, bank operations,        │
│             │  bulk cancel (cancelAll*)                 │
│             │  These functions do not exist in client. │
└─────────────┴──────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Why |
|---|---|
| **Bun + native fetch** | Zero deps for HTTP, native TS execution, fast startup |
| **Class-based over module globals** | Instance-scoped session prevents shared mutable state. Testable. |
| **Bun.secrets for token storage** | Tokens stored directly in OS keychain — no files on disk, no custom encryption layer. Zero deps. |
| **Plaintext fallback** | Graceful degradation for CI/headless environments without a keychain service |
| **No phoenix.robinhood.com** | TLS handshake fails. `api.robinhood.com` has equivalent data. |
| **Unified order methods** | `orderStock()` with optional params vs 10 separate `orderBuyMarket()` etc. |
| **Vitest over bun test** | Proper module isolation via worker processes. Critical for mocking. |
| **Zod schemas** | Runtime validation of all API responses — Python version lacked this. |
| **ESM-only** | Bun is ESM-native, no CJS compatibility needed. |
