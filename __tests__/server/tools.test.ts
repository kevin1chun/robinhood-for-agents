import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/server.js";

// Mock ../../src/client/index.js so tools don't need real auth
vi.mock("../../src/client/index.js", () => {
  const mockClient = {
    restoreSession: vi.fn().mockResolvedValue({ status: "logged_in", method: "cached" }),
    isLoggedIn: true,
    getAccounts: vi.fn().mockResolvedValue([
      {
        url: "https://api.robinhood.com/accounts/ABC123/",
        account_number: "ABC123",
        type: "cash",
      },
    ]),
    getAccountProfile: vi.fn().mockResolvedValue({
      url: "https://api.robinhood.com/accounts/ABC123/",
      account_number: "ABC123",
      type: "cash",
      cash: "1000.00",
      buying_power: "2000.00",
      crypto_buying_power: "500.00",
      cash_available_for_withdrawal: "1000.00",
    }),
    getPortfolioProfile: vi.fn().mockResolvedValue({
      equity: "15000.00",
      market_value: "14000.00",
    }),
    getUserProfile: vi.fn().mockResolvedValue({ username: "testuser" }),
    getInvestmentProfile: vi.fn().mockResolvedValue({ risk_tolerance: "moderate" }),
    buildHoldings: vi.fn().mockResolvedValue({ AAPL: { quantity: "10" } }),
    getQuotes: vi.fn().mockResolvedValue([{ symbol: "AAPL", last_trade_price: "150.00" }]),
    getFundamentals: vi.fn().mockResolvedValue([{ pe_ratio: "25.5", float: "14669011375" }]),
    getShortInterest: vi.fn().mockResolvedValue({
      symbol: "AAPL",
      instrument_id: "inst1",
      daily_data: [{ date: "2026-07-13", shares_short: "141171395.64", pc_freefloat: "0.9628" }],
    }),
    getStockHistoricals: vi
      .fn()
      .mockResolvedValue([
        { symbol: "AAPL", historicals: [{ begins_at: "2024-01-01", close_price: "150.00" }] },
      ]),
    getNews: vi.fn().mockResolvedValue([{ title: "News" }]),
    getRatings: vi.fn().mockResolvedValue({}),
    getEarnings: vi.fn().mockResolvedValue([{ symbol: "AAPL", year: 2026, quarter: 2 }]),
    getIndexValue: vi.fn().mockResolvedValue(null),
    getChains: vi.fn().mockResolvedValue({ id: "chain1", expiration_dates: ["2025-01-17"] }),
    findTradableOptions: vi.fn().mockResolvedValue([
      {
        url: "https://...",
        id: "opt1",
        type: "call",
        strike_price: "150.00",
        expiration_date: "2025-01-17",
      },
    ]),
    getOptionMarketData: vi.fn().mockResolvedValue([{ implied_volatility: "0.3" }]),
    getCryptoPositions: vi.fn().mockResolvedValue([{ currency: { code: "BTC" } }]),
    getCryptoQuote: vi.fn().mockResolvedValue({ mark_price: "50000.00" }),
    getCryptoHistoricals: vi.fn().mockResolvedValue([{ close_price: "50000.00" }]),
    getAllStockOrders: vi.fn().mockResolvedValue([{ id: "o1" }]),
    getOpenStockOrders: vi.fn().mockResolvedValue([]),
    getAllOptionOrders: vi.fn().mockResolvedValue([]),
    getOpenOptionOrders: vi.fn().mockResolvedValue([]),
    getAllCryptoOrders: vi.fn().mockResolvedValue([]),
    getOpenCryptoOrders: vi.fn().mockResolvedValue([]),
    getStockOrder: vi.fn().mockResolvedValue({ id: "o1", state: "filled" }),
    getOptionOrder: vi.fn().mockResolvedValue({ id: "opt1", state: "filled" }),
    getCryptoOrder: vi.fn().mockResolvedValue({ id: "crypto1", state: "filled" }),
    orderStock: vi.fn().mockResolvedValue({ id: "order1", state: "queued" }),
    orderOption: vi.fn().mockResolvedValue({ id: "opt1" }),
    orderCrypto: vi.fn().mockResolvedValue({ id: "crypto1" }),
    cancelStockOrder: vi.fn().mockResolvedValue({}),
    cancelOptionOrder: vi.fn().mockResolvedValue({}),
    cancelCryptoOrder: vi.fn().mockResolvedValue({}),
    getTopMovers: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "TSLA" }]),
    getTopMoversSp500: vi.fn().mockResolvedValue([{ symbol: "NVDA" }]),
    getTop100: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    findInstruments: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    getAllStocksFromMarketTag: vi.fn().mockResolvedValue([{ url: "...", id: "1", symbol: "AAPL" }]),
    // Phase 1A
    getUnifiedPortfolio: vi.fn().mockResolvedValue({
      total_equity: { amount: "15000.00" },
      total_market_value: { amount: "14000.00" },
      portfolio_equity: { amount: "15000.00" },
      options_buying_power: { amount: "2000.00" },
      uninvested_cash: { amount: "1000.00" },
      withdrawable_cash: { amount: "1000.00" },
    }),
    getPortfolioLive: vi.fn().mockResolvedValue({
      equity_market_value: "14000.00",
      option_market_value: "0.00",
      futures_market_value: "0.00",
      event_contracts_market_value: "0.00",
      pending_deposits: "0.00",
      currency: "USD",
    }),
    getPositions: vi.fn().mockResolvedValue([{ instrument: "https://...", quantity: "10" }]),
    getOptionPositions: vi.fn().mockResolvedValue([{ chain_symbol: "AAPL", quantity: "1" }]),
    getOptionAggregatePositions: vi
      .fn()
      .mockResolvedValue([{ symbol: "AAPL", strategy: "long_call" }]),
    getPriceBook: vi.fn().mockResolvedValue({ instrument_id: "1", asks: [], bids: [] }),
    getEarningsCalendar: vi.fn().mockResolvedValue([{ symbol: "AAPL" }, { symbol: "MSFT" }]),
    getIndexInstruments: vi.fn().mockResolvedValue([{ id: "idx1", symbol: "SPX" }]),
    getIndexQuotes: vi.fn().mockResolvedValue([{ symbol: "SPX", value: "5000.00" }]),
    getOptionHistoricals: vi
      .fn()
      .mockResolvedValue([{ symbol: "AAPL", data_points: [{ begins_at: "2026-07-14" }] }]),
    getTradability: vi.fn().mockResolvedValue([{ symbol: "AAPL", tradeable: true }]),
    getMarketHours: vi.fn().mockResolvedValue({
      is_open: true,
      date: "2026-07-27",
      opens_at: "2026-07-27T13:30:00Z",
      closes_at: "2026-07-27T20:00:00Z",
      extended_opens_at: "2026-07-27T11:00:00Z",
      extended_closes_at: "2026-07-28T00:00:00Z",
    }),
    // Phase 1B — watchlists
    getWatchlists: vi
      .fn()
      .mockResolvedValue([
        { id: "11111111-1111-4111-8111-111111111111", display_name: "My List", item_count: 1 },
      ]),
    getWatchlistItems: vi
      .fn()
      .mockResolvedValue([
        { object_id: "inst-aapl", object_type: "instrument", symbol: "AAPL", name: "Apple" },
      ]),
    getPopularWatchlists: vi
      .fn()
      .mockResolvedValue([
        { id: "22222222-2222-4222-8222-222222222222", display_name: "100 Most Popular" },
      ]),
    getOptionWatchlist: vi.fn().mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      item_count: 0,
      allowed_object_types: ["option_strategy"],
    }),
    resolveInstrumentBySymbol: vi
      .fn()
      .mockResolvedValue({ id: "inst-aapl", symbol: "AAPL", url: "https://..." }),
    getCurrencyPairs: vi
      .fn()
      .mockResolvedValue([{ id: "cp-btc", asset_currency: { code: "BTC" } }]),
    updateWatchlistItems: vi.fn().mockResolvedValue({}),
    // Phase 4 — watchlist metadata writes
    createWatchlist: vi.fn().mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      display_name: "New List",
      display_description: "",
      item_count: 0,
    }),
    updateWatchlist: vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      display_name: "Renamed List",
      display_description: "updated",
    }),
    deleteWatchlist: vi.fn().mockResolvedValue(undefined),
    // Phase 1C — scanners
    getScannerFilterSpecs: vi.fn().mockResolvedValue([
      {
        filter_type: "FILTER_TYPE_RSI",
        display_name: "RSI",
        filter_group: "TECHNICAL",
        value_type: "DECIMAL",
        unit_type: "PLAIN",
        supported_predicates: [">", "<"],
        supported_lengths: [14],
        supported_intervals: ["1d"],
      },
    ]),
    getScans: vi.fn().mockResolvedValue([]),
    // Phase 2 — realized P&L (computed)
    getRealizedPnl: vi.fn().mockResolvedValue({
      trades: [
        {
          symbol: "AAA",
          side: "sell",
          quantity: 10,
          price: 110,
          realizedGain: 100,
          openedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-01-02T00:00:00Z",
          assetClass: "equity",
        },
        {
          symbol: "OVR",
          side: "sell",
          quantity: 5,
          price: 10,
          realizedGain: 5,
          openedAt: "2026-01-01T00:00:00Z",
          closedAt: "2026-01-03T00:00:00Z",
          assetClass: "equity",
        },
        {
          symbol: "BTC",
          side: "sell",
          quantity: 1,
          price: 50000,
          realizedGain: 200,
          openedAt: null,
          closedAt: "2026-01-04T00:00:00Z",
          assetClass: "crypto",
        },
      ],
      overrunSymbols: ["OVR"],
      totalRealizedGain: 305,
    }),
    // Phase 3 — order review (pre-trade simulation)
    reviewEquityOrder: vi.fn().mockResolvedValue({
      symbol: "AAA",
      side: "buy",
      type: "limit",
      quantity: 10,
      limit_price: 130,
      stop_price: null,
      order_checks: {
        alert_type: "EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE",
        details: {
          entered_price: { amount: "130", currency: "USD" },
          last_trade_price: { amount: "100", currency: "USD" },
          bid_price: { amount: "99.9", currency: "USD" },
          ask_price: { amount: "100.1", currency: "USD" },
          side: "buy",
        },
      },
      evaluated_checks: ["limit_vs_last_trade_marketable", "limit_vs_touch_marketable"],
      not_evaluated_checks: [],
      quote: { symbol: "AAA", last_trade_price: "100", updated_at: "2026-07-14T00:00:00Z" },
      quote_timestamp: "2026-07-14T00:00:00Z",
    }),
    reviewOptionOrder: vi.fn().mockResolvedValue({
      symbol: "AAA",
      direction: "debit",
      price: 1.5,
      quantity: 1,
      legs: [
        {
          expiration_date: "2026-08-21",
          strike: 100,
          option_type: "call",
          side: "buy",
          position_effect: "open",
          ratio_quantity: 1,
          market_data: null,
        },
      ],
      collateral: { collateral: { cash: { amount: "0.00", currency: "USD" } } },
      order_checks: {},
      evaluated_checks: [],
      not_evaluated_checks: ["price_collar (option limit-price collar is not reproduced …)"],
      quote_timestamp: null,
    }),
    // Phase 5 — long-tail writes + tax lots
    getEquityTaxLots: vi.fn().mockResolvedValue([
      {
        account_number: "ABC123",
        instrument_id: "inst-aapl",
        open_lot_id: "lot-1",
        order_id: "ord-1",
        open_tran_type: "buy",
        quantity: "10.00000000",
        quantity_available: "10.00000000",
        book_cost_basis: "1500.0000",
        tax_cost_basis: "1500.0000",
        book_proceeds: "0.0000",
        open_date: "2026-01-02",
        term: "short_term",
        is_selectable: true,
        cost_per_share: null,
      },
    ]),
    followWatchlist: vi.fn().mockResolvedValue(undefined),
    unfollowWatchlist: vi.fn().mockResolvedValue(undefined),
    getOptionWatchlistContracts: vi.fn().mockResolvedValue([
      {
        id: "item-1",
        object_id: "strat-1",
        object_type: "option_strategy",
        strategy_code: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_L1",
        strategy: "long_call",
        chain_symbol: "AAPL",
        name: "AAPL $150 Call",
      },
    ]),
    getOptionInstrumentById: vi
      .fn()
      .mockResolvedValue({ id: "opt1", chain_symbol: "AAPL", type: "call", state: "active" }),
    getOptionChains: vi.fn().mockResolvedValue([{ id: "chain1", symbol: "AAPL" }]),
    getOptionInstruments: vi.fn().mockResolvedValue([
      { id: "opt1", type: "call", state: "active", tradability: "tradable" },
      { id: "opt2", type: "call", state: "expired", tradability: "untradable" },
    ]),
    getOptionQuotes: vi.fn().mockResolvedValue([{ implied_volatility: "0.3" }]),
    getOptionHistoricalsById: vi.fn().mockResolvedValue({
      data_points: [{ begins_at: "2000-01-01T00:00:00Z" }, { begins_at: new Date().toISOString() }],
    }),
    getIndexValues: vi.fn().mockResolvedValue([{ symbol: "SPX", value: "5000.00" }]),
    quickAddOption: vi.fn().mockResolvedValue({}),
  };

  return {
    getClient: () => mockClient,
    AuthenticationError: class extends Error {},
    saveTokens: vi.fn(),
    loadTokens: vi.fn(),
    deleteTokens: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock browser-auth so auth tool tests don't launch a real browser
vi.mock("../../src/server/browser-auth.js", () => ({
  browserLogin: vi.fn().mockResolvedValue({
    status: "logged_in",
    account_hint: "...4521",
  }),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function captureMockServer(): { server: McpServer; tools: Record<string, ToolHandler> } {
  const tools: Record<string, ToolHandler> = {};
  const server = {
    // registerTool(name, config, handler) — the modern config-object API.
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      tools[name] = handler;
    },
  } as unknown as McpServer;
  return { server, tools };
}

function parseToolResult(result: unknown) {
  const r = result as { content: Array<{ type: string; text: string }> };
  expect(r.content).toBeInstanceOf(Array);
  expect(r.content[0]?.type).toBe("text");
  return JSON.parse(r.content[0]?.text ?? "{}");
}

async function callTool(
  tools: Record<string, ToolHandler>,
  name: string,
  args: Record<string, unknown> = {},
) {
  const handler = tools[name] as ToolHandler;
  expect(handler).toBeDefined();
  return parseToolResult(await handler(args));
}

describe("MCP Server", () => {
  it("creates server with correct name", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("registers all 40 tools without throwing", () => {
    createServer();
    expect(true).toBe(true);
  });

  it("registers exactly 59 uniquely-named tools", async () => {
    const [
      auth,
      portfolio,
      stocks,
      options,
      crypto,
      orders,
      markets,
      watchlists,
      scanners,
      pnl,
      review,
      taxlots,
    ] = await Promise.all([
      import("../../src/server/tools/auth.js"),
      import("../../src/server/tools/portfolio.js"),
      import("../../src/server/tools/stocks.js"),
      import("../../src/server/tools/options.js"),
      import("../../src/server/tools/crypto.js"),
      import("../../src/server/tools/orders.js"),
      import("../../src/server/tools/markets.js"),
      import("../../src/server/tools/watchlists.js"),
      import("../../src/server/tools/scanners.js"),
      import("../../src/server/tools/pnl.js"),
      import("../../src/server/tools/review.js"),
      import("../../src/server/tools/tax-lots.js"),
    ]);
    const { server, tools } = captureMockServer();
    auth.registerAuthTools(server);
    portfolio.registerPortfolioTools(server);
    stocks.registerStockTools(server);
    options.registerOptionsTools(server);
    crypto.registerCryptoTools(server);
    orders.registerOrderTools(server);
    markets.registerMarketTools(server);
    watchlists.registerWatchlistTools(server);
    scanners.registerScannerTools(server);
    pnl.registerPnlTools(server);
    review.registerReviewTools(server);
    taxlots.registerTaxLotTools(server);

    const names = Object.keys(tools);
    expect(names).toHaveLength(59);
    expect(new Set(names).size).toBe(59); // no duplicate names
    expect(names.every((n) => n.startsWith("robinhood_"))).toBe(true);
  });
});

describe("Tool handlers return MCP content format", () => {
  it("registerPortfolioTools handlers work", async () => {
    const { registerPortfolioTools } = await import("../../src/server/tools/portfolio.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    expect(tools.robinhood_get_portfolio).toBeDefined();
    expect(tools.robinhood_get_accounts).toBeDefined();
    expect(tools.robinhood_get_account).toBeDefined();

    const accountsData = await callTool(tools, "robinhood_get_accounts");
    // url is a redundant copy of account_number (same identifier, URL-wrapped) and
    // is stripped by scrubRedundantAccountFields; account_number itself is kept —
    // callers need it to select an account in later tool calls.
    expect(accountsData.accounts).toEqual([
      {
        account_number: "ABC123",
        type: "cash",
      },
    ]);

    const accountData = await callTool(tools, "robinhood_get_account", { info_type: "user" });
    expect(accountData.user).toEqual({ username: "testuser" });
  });

  it("registerOrderTools handlers work", async () => {
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const ordersData = await callTool(tools, "robinhood_get_equity_orders", {
      account_number: "ABC123",
    });
    expect(ordersData.orders).toEqual([{ id: "o1" }]);
    expect(ordersData.next_cursor).toBeNull();
  });

  it("get_equity_orders filters by state and order_id", async () => {
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const none = await callTool(tools, "robinhood_get_equity_orders", {
      account_number: "ABC123",
      state: "cancelled",
    });
    expect(none.orders).toEqual([]);

    const one = await callTool(tools, "robinhood_get_equity_orders", {
      account_number: "ABC123",
      order_id: "o1",
    });
    expect(one.orders).toEqual([{ id: "o1", state: "filled" }]);
  });

  it("cancel tools refuse an order of another account", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getStockOrder as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "o1",
      state: "queued",
      account: "https://api.robinhood.com/accounts/OTHER/",
    });
    const cancel = rh.cancelStockOrder as ReturnType<typeof vi.fn>;
    cancel.mockClear();
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const refused = (await (tools.robinhood_cancel_equity_order as ToolHandler)({
      account_number: "ABC123",
      order_id: "o1",
    })) as { isError?: boolean };
    expect(refused.isError).toBe(true);
    expect(cancel).not.toHaveBeenCalled();

    const ok = await callTool(tools, "robinhood_cancel_crypto_order", {
      rhs_account_number: "ABC123",
      order_id: "c1",
    });
    expect(ok).toEqual({ status: "cancelled", order_id: "c1" });
  });
  it("registerMarketTools handlers work", async () => {
    const { registerMarketTools } = await import("../../src/server/tools/markets.js");
    const { server, tools } = captureMockServer();
    registerMarketTools(server);

    const moversData = await callTool(tools, "robinhood_get_movers", {
      category: "top_movers",
    });
    expect(moversData.movers).toEqual([{ url: "...", id: "1", symbol: "TSLA" }]);
  });

  it("registerStockTools handlers work", async () => {
    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const quoteData = await callTool(tools, "robinhood_get_equity_quotes", {
      symbols: ["AAPL"],
    });
    expect(quoteData.AAPL).toBeDefined();
    expect(quoteData.AAPL.quote).toEqual({ symbol: "AAPL", last_trade_price: "150.00" });

    const fundamentalsData = await callTool(tools, "robinhood_get_equity_fundamentals", {
      symbols: ["AAPL"],
    });
    expect(fundamentalsData.AAPL).toEqual({ pe_ratio: "25.5", float: "14669011375" });

    const shortData = await callTool(tools, "robinhood_get_short_interest", {
      symbol: "AAPL",
    });
    expect(shortData.symbol).toBe("AAPL");
    expect(shortData.short_interest.daily_data).toHaveLength(1);
    expect(shortData.short_interest.daily_data[0].pc_freefloat).toBe("0.9628");
  });

  it("registerAuthTools handlers work", async () => {
    const { registerAuthTools } = await import("../../src/server/tools/auth.js");
    const { server, tools } = captureMockServer();
    registerAuthTools(server);

    expect(tools.robinhood_browser_login).toBeDefined();
    expect(tools.robinhood_check_session).toBeDefined();

    const loginData = await callTool(tools, "robinhood_browser_login");
    expect(loginData.status).toBe("logged_in");
    expect(loginData.account_hint).toBe("...4521");
  });

  it("option chain / instrument / quote tools", async () => {
    const { registerOptionsTools } = await import("../../src/server/tools/options.js");
    const { server, tools } = captureMockServer();
    registerOptionsTools(server);

    const chains = await callTool(tools, "robinhood_get_option_chains", {
      underlying_symbol: "AAPL",
    });
    expect(chains.chains[0].id).toBe("chain1");

    // Defaults to active; tradability filters client-side.
    const inst = await callTool(tools, "robinhood_get_option_instruments", {
      chain_symbol: "AAPL",
    });
    expect(inst.instruments.map((i: { id: string }) => i.id)).toEqual(["opt1"]);
    const expired = await callTool(tools, "robinhood_get_option_instruments", {
      chain_id: "chain1",
      state: "expired",
    });
    expect(expired.instruments.map((i: { id: string }) => i.id)).toEqual(["opt2"]);

    const quotes = await callTool(tools, "robinhood_get_option_quotes", {
      instrument_ids: ["opt1"],
    });
    expect(quotes.quotes).toEqual([{ implied_volatility: "0.3" }]);
  });
  it("get_option_instruments needs a chain, symbol, or ids", async () => {
    const { registerOptionsTools } = await import("../../src/server/tools/options.js");
    const { server, tools } = captureMockServer();
    registerOptionsTools(server);
    const r = (await (tools.robinhood_get_option_instruments as ToolHandler)({})) as {
      isError?: boolean;
    };
    expect(r.isError).toBe(true);
  });
  it("registerCryptoTools quote handler", async () => {
    const { registerCryptoTools } = await import("../../src/server/tools/crypto.js");
    const { server, tools } = captureMockServer();
    registerCryptoTools(server);

    const data = await callTool(tools, "robinhood_get_crypto_quotes", {
      symbols: ["BTC-USD", "NOPE"],
    });
    expect(data.quotes[0].quote).toEqual({ mark_price: "50000.00" });
    expect(data.quotes[1].error).toContain("Unknown");
  });
  it("registerCryptoTools positions and currency pairs", async () => {
    const { registerCryptoTools } = await import("../../src/server/tools/crypto.js");
    const { server, tools } = captureMockServer();
    registerCryptoTools(server);

    const data = await callTool(tools, "robinhood_get_crypto_positions", {
      rhs_account_number: "ABC123",
    });
    expect(data.positions).toEqual([{ currency: { code: "BTC" } }]);

    const pairs = await callTool(tools, "robinhood_get_currency_pairs", { limit: 1 });
    expect(pairs.pairs).toHaveLength(1);
    expect(pairs.next_cursor).toBeNull();
  });
});

describe("Phase 1A parity tools", () => {
  it("get_portfolio includes unified + live parity summary", async () => {
    const { registerPortfolioTools } = await import("../../src/server/tools/portfolio.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    const data = await callTool(tools, "robinhood_get_portfolio", { account_number: "ABC123" });
    expect(data.summary.total_equity).toBe("15000.00");
    expect(data.summary.equity_market_value).toBe("14000.00");
    expect(data.summary.currency).toBe("USD");
    expect(data.unified).toBeDefined();
    expect(data.live).toBeDefined();
  });

  it("get_equity_positions returns positions", async () => {
    const { registerPortfolioTools } = await import("../../src/server/tools/portfolio.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    const data = await callTool(tools, "robinhood_get_equity_positions", {
      account_number: "ABC123",
    });
    expect(data.positions).toHaveLength(1);
    expect(data.next_cursor).toBeNull();
  });

  it("an account_number selected from get_accounts flows unredacted into get_portfolio (regression guard for #14)", async () => {
    const { registerPortfolioTools } = await import("../../src/server/tools/portfolio.js");
    const { getClient } = await import("../../src/client/index.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    const rh = getClient();
    const getAccounts = rh.getAccounts as ReturnType<typeof vi.fn>;
    const getAccountProfile = rh.getAccountProfile as ReturnType<typeof vi.fn>;
    const buildHoldings = rh.buildHoldings as ReturnType<typeof vi.fn>;
    getAccounts.mockResolvedValueOnce([
      { url: "https://api.robinhood.com/accounts/ABC123/", account_number: "ABC123", type: "cash" },
      { url: "https://api.robinhood.com/accounts/XYZ999/", account_number: "XYZ999", type: "ira" },
    ]);
    getAccountProfile.mockClear();
    buildHoldings.mockClear();

    // Step 1 (issue #14 repro): list accounts, as an agent would to let the user pick one.
    const accountsData = await callTool(tools, "robinhood_get_accounts");
    const ira = accountsData.accounts.find((a: { type: string }) => a.type === "ira");
    expect(ira.account_number).toBe("XYZ999"); // real id, never "[REDACTED]"

    // Step 2 (issue #14 repro): feed the selected account back into an account-scoped tool.
    await callTool(tools, "robinhood_get_portfolio", { account_number: ira.account_number });
    expect(buildHoldings).toHaveBeenCalledWith(
      expect.objectContaining({ accountNumber: "XYZ999" }),
    );
    expect(getAccountProfile).toHaveBeenCalledWith("XYZ999");
  });

  it("option tools return positions / orders / historicals", async () => {
    const { registerOptionsTools } = await import("../../src/server/tools/options.js");
    const { server, tools } = captureMockServer();
    registerOptionsTools(server);

    const legs = await callTool(tools, "robinhood_get_option_positions", {
      account_number: "ABC123",
    });
    expect(legs.positions).toHaveLength(1);
    const shorts = await callTool(tools, "robinhood_get_option_positions", {
      account_number: "ABC123",
      type: "short",
    });
    expect(shorts.positions).toHaveLength(0);

    const orders = await callTool(tools, "robinhood_get_option_orders", {
      account_number: "ABC123",
    });
    expect(orders.orders).toEqual([]);

    // The bar from 2000 falls outside [start_time, now] and is trimmed.
    const hist = await callTool(tools, "robinhood_get_option_historicals", {
      instrument_ids: ["opt1"],
      start_time: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(hist.span).toBe("day");
    expect(hist.interval).toBe("5minute");
    expect(hist.historicals[0].data_points).toHaveLength(1);
  });
  it("stock parity tools return price book / earnings / tradability", async () => {
    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const pb = await callTool(tools, "robinhood_get_equity_price_book", { symbols: ["AAPL"] });
    expect(pb.price_books[0].price_book.instrument_id).toBe("1");

    const er = await callTool(tools, "robinhood_get_earnings_results", { symbol: "AAPL" });
    expect(er.earnings).toHaveLength(1);

    const tr = await callTool(tools, "robinhood_get_equity_tradability", {
      account_number: "ABC123",
      symbols: ["AAPL"],
    });
    expect(tr.tradability[0].tradeable).toBe(true);
  });

  it("earnings calendar keeps reports inside the window", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    (rh.getEarningsCalendar as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { symbol: "AAPL", report: { date: today } },
      { symbol: "OLD", report: { date: "2000-01-01" } },
    ]);
    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const ec = await callTool(tools, "robinhood_get_earnings_calendar", {});
    expect(ec.start_date).toBe(today);
    expect(ec.calendar.map((e: { symbol: string }) => e.symbol)).toEqual(["AAPL"]);

    const bad = (await (tools.robinhood_get_earnings_calendar as ToolHandler)({ days: 40 })) as {
      isError?: boolean;
    };
    expect(bad.isError).toBe(true);
  });

  it("historicals and indicators trim to the requested range", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const now = Date.now();
    const bars = [3, 2, 1, 0].map((d) => ({
      begins_at: new Date(now - d * 86_400_000).toISOString(),
      open_price: "10",
      high_price: "11",
      low_price: "9",
      close_price: String(10 + d),
      volume: 100,
    }));
    const hist = rh.getStockHistoricals as ReturnType<typeof vi.fn>;
    hist.mockResolvedValue([{ symbol: "AAPL", historicals: bars }]);
    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const start = new Date(now - 1.5 * 86_400_000).toISOString();
    const h = await callTool(tools, "robinhood_get_equity_historicals", {
      symbols: ["AAPL"],
      start_time: start,
      interval: "day",
    });
    expect(h.span).toBe("month");
    expect(h.historicals[0].historicals).toHaveLength(2);

    // SMA(2) uses the pre-range bar as warm-up; output=latest keeps one point.
    const ind = await callTool(tools, "robinhood_get_equity_technical_indicators", {
      symbol: "AAPL",
      type: "sma",
      period: 2,
      interval: "day",
      start_time: start,
      output: "latest",
    });
    expect(ind.series).toEqual([{ begins_at: bars[3]?.begins_at, value: 10.5 }]);

    const rejected = (await (tools.robinhood_get_equity_technical_indicators as ToolHandler)({
      symbol: "AAPL",
      type: "sma",
      num_std: 2,
      interval: "day",
      start_time: start,
    })) as { isError?: boolean };
    expect(rejected.isError).toBe(true);
    hist.mockReset();
  });
  it("index tools return indexes / quotes", async () => {
    const { registerMarketTools } = await import("../../src/server/tools/markets.js");
    const { server, tools } = captureMockServer();
    registerMarketTools(server);

    const idx = await callTool(tools, "robinhood_get_indexes", { symbols: "SPX,NDX" });
    expect(idx.indexes[0].symbol).toBe("SPX");

    const q = await callTool(tools, "robinhood_get_index_quotes", { instrument_ids: ["idx1"] });
    expect(q.quotes[0].value).toBe("5000.00");
  });
});

describe("Phase 1B watchlist tools", () => {
  const LIST_ID = "11111111-1111-4111-8111-111111111111";

  async function watchlistTools() {
    const { registerWatchlistTools } = await import("../../src/server/tools/watchlists.js");
    const { server, tools } = captureMockServer();
    registerWatchlistTools(server);
    return tools;
  }

  it("get_watchlists / get_popular_watchlists return metadata", async () => {
    const tools = await watchlistTools();
    const own = await callTool(tools, "robinhood_get_watchlists");
    expect(own.count).toBe(1);
    expect(own.watchlists[0].id).toBe(LIST_ID);

    const pop = await callTool(tools, "robinhood_get_popular_watchlists");
    expect(pop.count).toBe(1);
    expect(pop.watchlists[0].display_name).toContain("Popular");
  });

  it("get_watchlist_items returns enriched items", async () => {
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_get_watchlist_items", { list_id: LIST_ID });
    expect(data.count).toBe(1);
    expect(data.items[0].symbol).toBe("AAPL");
    expect(data.items[0].object_type).toBe("instrument");
  });

  it("get_option_watchlist returns single-leg contracts with a derived option_id", async () => {
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_get_option_watchlist");
    expect(data.count).toBe(1);
    const c = data.contracts[0];
    expect(c.object_id).toBe("strat-1");
    expect(c.option_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); // derived from strategy_code
    expect(c.position_type).toBe("long");
    expect(c.single_leg).toBe(true);
    expect(c.chain_symbol).toBe("AAPL");
    expect(data.note).toBeDefined();
  });

  it("add_to_watchlist resolves symbols and writes a create", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const update = rh.updateWatchlistItems as ReturnType<typeof vi.fn>;
    update.mockClear();

    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_add_to_watchlist", {
      list_id: LIST_ID,
      symbols: ["AAPL"],
    });
    expect(data.operation).toBe("add");
    expect(data.ensured_present[0].symbol).toBe("AAPL");
    // single-list, single-operation "create"
    expect(update).toHaveBeenCalledWith(LIST_ID, "create", [
      { object_type: "instrument", object_id: "inst-aapl" },
    ]);
  });

  it("add_to_watchlist rejects zero or multiple asset kinds (mutual exclusivity)", async () => {
    const tools = await watchlistTools();
    const none = (await (tools.robinhood_add_to_watchlist as ToolHandler)({
      list_id: LIST_ID,
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(none.isError).toBe(true);
    expect(JSON.parse(none.content[0]?.text ?? "{}").error).toContain("exactly one");

    const both = (await (tools.robinhood_add_to_watchlist as ToolHandler)({
      list_id: LIST_ID,
      symbols: ["AAPL"],
      index_ids: ["44444444-4444-4444-8444-444444444444"],
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(both.isError).toBe(true);
  });

  it("add_to_watchlist rejects an index id not in the catalog (trap #5)", async () => {
    const tools = await watchlistTools();
    const res = (await (tools.robinhood_add_to_watchlist as ToolHandler)({
      list_id: LIST_ID,
      index_ids: ["44444444-4444-4444-8444-444444444444"],
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]?.text ?? "{}").error).toContain("index");
  });

  it("remove_from_watchlist reports removed vs not_present and deletes only present", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const update = rh.updateWatchlistItems as ReturnType<typeof vi.fn>;
    update.mockClear();

    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_remove_from_watchlist", {
      list_id: LIST_ID,
      symbols: ["AAPL", "ZZZZ"],
    });
    expect(data.removed[0].symbol).toBe("AAPL");
    expect(data.removed[0].object_id).toBe("inst-aapl");
    expect(data.not_present[0].symbol).toBe("ZZZZ");
    // deletes the actual listed object_id, once
    expect(update).toHaveBeenCalledWith(LIST_ID, "delete", [
      { object_type: "instrument", object_id: "inst-aapl" },
    ]);
  });

  it("remove_from_watchlist issues no write when nothing matches", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const update = rh.updateWatchlistItems as ReturnType<typeof vi.fn>;
    update.mockClear();

    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_remove_from_watchlist", {
      list_id: LIST_ID,
      symbols: ["ZZZZ"],
    });
    expect(data.not_present).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });

  // Phase 4 — watchlist metadata writes (create/update)
  it("create_watchlist creates a list and returns its new id", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const spy = rh.createWatchlist as ReturnType<typeof vi.fn>;
    spy.mockClear();

    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_create_watchlist", {
      display_name: "New List",
      display_description: "desc",
    });
    expect(data.operation).toBe("created");
    expect(data.list.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(spy).toHaveBeenCalledWith("New List", {
      displayDescription: "desc",
      iconEmoji: undefined,
    });
  });

  it("update_watchlist patches only the provided metadata fields", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const spy = rh.updateWatchlist as ReturnType<typeof vi.fn>;
    spy.mockClear();

    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_update_watchlist", {
      list_id: LIST_ID,
      display_name: "Renamed List",
    });
    expect(data.operation).toBe("updated");
    expect(data.list_id).toBe(LIST_ID);
    expect(spy).toHaveBeenCalledWith(LIST_ID, {
      displayName: "Renamed List",
      displayDescription: undefined,
      iconEmoji: undefined,
    });
  });

  it("update_watchlist and create_watchlist carry honest write annotations", async () => {
    const { registerWatchlistTools } = await import("../../src/server/tools/watchlists.js");
    const meta: Record<string, { readOnlyHint?: boolean }> = {};
    const server = {
      registerTool: (
        name: string,
        config: { annotations?: { readOnlyHint?: boolean } },
        _handler: unknown,
      ) => {
        meta[name] = config.annotations ?? {};
      },
    } as unknown as McpServer;
    registerWatchlistTools(server);
    // Writes must NOT claim to be read-only (drives the host permission prompt).
    expect(meta.robinhood_create_watchlist?.readOnlyHint).toBe(false);
    expect(meta.robinhood_update_watchlist?.readOnlyHint).toBe(false);
  });
});

describe("Phase 1C scanner tools", () => {
  async function scannerTools() {
    const { registerScannerTools } = await import("../../src/server/tools/scanners.js");
    const { server, tools } = captureMockServer();
    registerScannerTools(server);
    return tools;
  }

  it("get_scanner_filter_specs returns the catalog with count + provenance note", async () => {
    const tools = await scannerTools();
    const data = await callTool(tools, "robinhood_get_scanner_filter_specs");
    expect(data.count).toBe(1);
    expect(data.filter_specs[0].filter_type).toBe("FILTER_TYPE_RSI");
    expect(data.note).toMatch(/static catalog/i);
    // Provenance lives in the envelope note, never inside the spec objects
    // (the DTO stays byte-parity with the official tool).
    expect(data.filter_specs[0].note).toBeUndefined();
  });

  it("get_scans returns empty with a note when there are no saved scans", async () => {
    const tools = await scannerTools();
    const data = await callTool(tools, "robinhood_get_scans");
    expect(data.count).toBe(0);
    expect(data.scans).toEqual([]);
    expect(data.note).toBeDefined();
  });

  it("get_scans derives safe fields, nulls the unreproducible ones, and preserves raw", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getScans as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        scanId: "scan-1",
        title: "High RSI",
        columnCount: 3,
        activeScanConfiguration: {
          columns: ["a", "b", "c", "d"],
          filters: [{ filterType: "FILTER_TYPE_RSI" }],
          sortingColumnId: "col-vol",
          sortingDirection: "desc",
        },
      },
    ]);
    const tools = await scannerTools();
    const data = await callTool(tools, "robinhood_get_scans");
    expect(data.count).toBe(1);
    const s = data.scans[0];
    expect(s.scan_id).toBe("scan-1");
    expect(s.title).toBe("High RSI");
    // Prefers the wire columnCount over columns.length.
    expect(s.column_count).toBe(3);
    // The three official fields we cannot faithfully reproduce are explicitly null.
    expect(s.filter_summary).toBeNull();
    expect(s.cortex_managed).toBeNull();
    expect(s.sorting).toBeNull();
    // Full raw beacon object preserved for fidelity — the sort/filter data the
    // nulled official fields would summarize lives here under activeScanConfiguration.
    expect(s.raw.activeScanConfiguration.sortingColumnId).toBe("col-vol");
    expect(s.raw.activeScanConfiguration.filters).toHaveLength(1);
  });

  it("get_scans falls back to columns.length and id when columnCount/scanId are absent", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getScans as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "legacy-id", activeScanConfiguration: { columns: ["a", "b"] } },
    ]);
    const tools = await scannerTools();
    const data = await callTool(tools, "robinhood_get_scans");
    const s = data.scans[0];
    expect(s.scan_id).toBe("legacy-id");
    expect(s.column_count).toBe(2);
    expect(s.title).toBeNull();
  });
});

describe("Phase 2 realized-P&L tools", () => {
  async function pnlTools() {
    const { registerPnlTools } = await import("../../src/server/tools/pnl.js");
    const { server, tools } = captureMockServer();
    registerPnlTools(server);
    return tools;
  }

  it("get_realized_pnl returns a bucketed DTO with null rates and an honest note", async () => {
    const tools = await pnlTools();
    const data = await callTool(tools, "robinhood_get_realized_pnl", {
      account_number: "ACCT",
      span: "all",
    });
    expect(data.account_number).toBe("ACCT");
    expect(data.display_currency).toBe("USD");
    expect(Array.isArray(data.data_points)).toBe(true);
    // Rate fields are null (unreproducible denominator) — never invented.
    expect(data.total_rate_of_return).toBeNull();
    for (const dp of data.data_points) {
      expect(dp.rate_of_realized_gain).toBeNull();
      expect(dp).toHaveProperty("start_time");
      expect(dp).toHaveProperty("end_time");
      expect(dp).toHaveProperty("number_of_trades");
    }
    // Invariant: bucket realized_gain sums to total_returns.
    const sum = data.data_points.reduce(
      (a: number, b: { realized_gain: number }) => a + b.realized_gain,
      0,
    );
    expect(sum).toBeCloseTo(data.total_returns, 6);
    expect(data.total_returns).toBeCloseTo(305, 6);
    // Honest caveats live in the note, never inside the DTO objects.
    expect(data.note).toMatch(/COMPUTED/);
    expect(data.note).toMatch(/Options realized P&L is NOT included/i);
    expect(data.note).toMatch(/OVR/); // overrun symbol flagged
    expect(data.data_points[0]?.note).toBeUndefined();
  });

  it("omits the options note when asset_classes excludes option", async () => {
    const tools = await pnlTools();
    const data = await callTool(tools, "robinhood_get_realized_pnl", {
      account_number: "ACCT",
      span: "all",
      asset_classes: ["equity", "crypto"],
    });
    expect(data.note).not.toMatch(/Options realized P&L is NOT included/i);
  });

  it("get_pnl_trade_history returns per-trade rows, next_cursor null, exact official shape", async () => {
    const tools = await pnlTools();
    const data = await callTool(tools, "robinhood_get_pnl_trade_history", {
      account_number: "ACCT",
      span: "all",
    });
    expect(data.next_cursor).toBeNull();
    expect(data.trades).toHaveLength(3);
    expect(Object.keys(data.trades[0]).sort()).toEqual([
      "price",
      "quantity",
      "realized_gain",
      "side",
      "symbol",
    ]);
    expect(data.note).toMatch(/next_cursor is always null/);
  });

  it("get_pnl_trade_history filters to a single symbol (case-insensitive)", async () => {
    const tools = await pnlTools();
    const data = await callTool(tools, "robinhood_get_pnl_trade_history", {
      account_number: "ACCT",
      span: "all",
      symbol: "btc",
    });
    expect(data.trades).toHaveLength(1);
    expect(data.trades[0].symbol).toBe("BTC");
  });
});

describe("Phase 3 order-review tools", () => {
  async function reviewTools() {
    const { registerReviewTools } = await import("../../src/server/tools/review.js");
    const { server, tools } = captureMockServer();
    registerReviewTools(server);
    return tools;
  }

  it("review_equity_order returns the official DTO fields, echoes the caller account, and never invents market_data_disclosure", async () => {
    const tools = await reviewTools();
    const data = await callTool(tools, "robinhood_review_equity_order", {
      symbol: "AAA",
      side: "buy",
      type: "limit",
      quantity: "10",
      limit_price: "130",
      account_number: "ACCT",
    });
    // Official DTO surface.
    for (const k of [
      "symbol",
      "side",
      "type",
      "quantity",
      "limit_price",
      "order_checks",
      "quote_data",
    ]) {
      expect(data).toHaveProperty(k);
    }
    // Not reproducible from a standard token → null, never fabricated.
    expect(data.market_data_disclosure).toBeNull();
    // Only the caller-supplied account number is echoed.
    expect(data.account_number).toBe("ACCT");
    // The reproduced collar alert is surfaced.
    expect(data.order_checks.alert_type).toBe("EQUITY_EXTREMELY_MARKETABLE_LIMIT_PRICE");
    // Honest-fidelity: the note explains the {} semantics + names the un-run checks.
    expect(data.note).toMatch(/SIMULATION ONLY/);
    expect(data.note).toMatch(/priceband|not reproduced|NOT reproduced/i);
    expect(Array.isArray(data.evaluated_checks)).toBe(true);
    expect(Array.isArray(data.not_evaluated_checks)).toBe(true);
  });

  it("review_option_order echoes the caller account, includes collateral + legs, and keeps a thin check set", async () => {
    const tools = await reviewTools();
    const data = await callTool(tools, "robinhood_review_option_order", {
      legs: [{ option_id: "opt1", side: "buy", position_effect: "open" }],
      price: "1.5",
      quantity: "1",
      account_number: "ACCT",
    });
    expect(data.account_number).toBe("ACCT");
    expect(data.collateral).toBeDefined();
    expect(Array.isArray(data.legs)).toBe(true);
    // Thin, honest option check set — the {} must not read as a clearance.
    expect(data.order_checks).toEqual({});
    expect(data.not_evaluated_checks.length).toBeGreaterThan(0);
    expect(data.note).toMatch(/SIMULATION ONLY/);
  });

  it("passes the collar price params through to the client method", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const spy = rh.reviewEquityOrder as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const tools = await reviewTools();
    await callTool(tools, "robinhood_review_equity_order", {
      symbol: "aaa",
      side: "sell",
      type: "stop_limit",
      quantity: "3",
      limit_price: "12.5",
      stop_price: "11",
      account_number: "ACCT",
    });
    expect(spy).toHaveBeenCalledWith({
      symbol: "aaa",
      side: "sell",
      quantity: 3,
      limitPrice: 12.5,
      stopPrice: 11,
      accountNumber: "ACCT",
    });
  });

  it("review_option_order derives direction for one leg and needs it for several", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().reviewOptionOrder as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const tools = await reviewTools();
    await callTool(tools, "robinhood_review_option_order", {
      legs: [{ option_id: "opt1", side: "sell", position_effect: "open" }],
      price: "1.5",
      quantity: "1",
      account_number: "ACCT",
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ direction: "credit" }));

    const r = (await (tools.robinhood_review_option_order as ToolHandler)({
      legs: [
        { option_id: "opt1", side: "buy", position_effect: "open" },
        { option_id: "opt2", side: "sell", position_effect: "open" },
      ],
      price: "1.5",
      quantity: "1",
      account_number: "ACCT",
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("direction is required");
  });

  it("preview_crypto_order estimates quantity from a dollar amount and places nothing", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getCryptoQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ask_price: "50000",
      bid_price: "49900",
    });
    const order = rh.orderCrypto as ReturnType<typeof vi.fn>;
    order.mockClear();
    const tools = await reviewTools();
    const data = await callTool(tools, "robinhood_preview_crypto_order", {
      rhs_account_number: "ABC123",
      symbol: "BTC-USD",
      side: "buy",
      type: "market",
      dollar_amount: "100",
    });
    expect(data.currency_pair_id).toBe("cp-btc");
    expect(data.estimated_quantity).toBeCloseTo(0.002, 9);
    expect(data.estimated_notional).toBe(100);
    expect(order).not.toHaveBeenCalled();
  });
});

describe("Phase 5 long-tail writes + tax lots", () => {
  const PRESENT_OPTION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // matches the mock strategy_code
  const NEW_OPTION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const CURATED_LIST = "22222222-2222-4222-8222-222222222222";

  async function watchlistTools() {
    const { registerWatchlistTools } = await import("../../src/server/tools/watchlists.js");
    const { server, tools } = captureMockServer();
    registerWatchlistTools(server);
    return tools;
  }
  async function taxLotTools() {
    const { registerTaxLotTools } = await import("../../src/server/tools/tax-lots.js");
    const { server, tools } = captureMockServer();
    registerTaxLotTools(server);
    return tools;
  }

  it("get_equity_tax_lots echoes the caller's account, scrubs per-lot account_number, next_cursor null", async () => {
    const tools = await taxLotTools();
    const data = await callTool(tools, "robinhood_get_equity_tax_lots", {
      account_number: "ACCT-XYZ",
      symbol: "aapl",
    });
    expect(data.account_number).toBe("ACCT-XYZ"); // caller-supplied, echoed once
    expect(data.symbol).toBe("AAPL");
    expect(data.count).toBe(1);
    expect(data.tax_lots[0].open_lot_id).toBe("lot-1");
    expect(data.tax_lots[0].account_number).toBeUndefined(); // scrubbed from lot body
    expect(data.tax_lots[0].cost_per_share).toBeNull();
    expect(data.next_cursor).toBeNull();
  });

  it("follow_watchlist reports followed:true and calls the client with the list id", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().followWatchlist as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_follow_watchlist", { list_id: CURATED_LIST });
    expect(data.followed).toBe(true);
    expect(data.operation).toBe("follow");
    expect(spy).toHaveBeenCalledWith(CURATED_LIST);
  });

  it("unfollow_watchlist reports followed:false", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().unfollowWatchlist as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_unfollow_watchlist", { list_id: CURATED_LIST });
    expect(data.followed).toBe(false);
    expect(spy).toHaveBeenCalledWith(CURATED_LIST);
  });

  it("add_option_to_watchlist adds a new contract and dedupes an already-present one", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const add = rh.quickAddOption as ReturnType<typeof vi.fn>;
    add.mockClear();
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_add_option_to_watchlist", {
      option_ids: [NEW_OPTION, PRESENT_OPTION],
    });
    const byId = Object.fromEntries(
      (data.results as Array<{ option_id: string; status: string }>).map((r) => [
        r.option_id,
        r.status,
      ]),
    );
    expect(byId[NEW_OPTION]).toBe("ensured_present");
    expect(byId[PRESENT_OPTION]).toBe("already_present");
    expect(data.summary.ensured_present).toBe(1);
    expect(data.summary.already_present).toBe(1);
    // only the NEW id is minted; the present one is skipped (no duplicate)
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(NEW_OPTION, "long");
  });

  it("add_option_to_watchlist rejects position_type short", async () => {
    const tools = await watchlistTools();
    const res = (await (tools.robinhood_add_option_to_watchlist as ToolHandler)({
      option_ids: [NEW_OPTION],
      position_type: "short",
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0]?.text ?? "{}").error).toContain("long");
  });

  it("remove_option_from_watchlist removes an exact strategy_code match, reports not_present otherwise", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const update = rh.updateWatchlistItems as ReturnType<typeof vi.fn>;
    update.mockClear();
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_remove_option_from_watchlist", {
      option_ids: [PRESENT_OPTION, NEW_OPTION],
    });
    expect(data.removed[0].option_id).toBe(PRESENT_OPTION);
    expect(data.removed[0].object_id).toBe("strat-1"); // the minted strategy id, not the option_id
    expect(data.not_present[0].option_id).toBe(NEW_OPTION);
    expect(update).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", "delete", [
      { object_type: "option_strategy", object_id: "strat-1" },
    ]);
  });

  it("remove_option_from_watchlist writes nothing when nothing matches", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const update = rh.updateWatchlistItems as ReturnType<typeof vi.fn>;
    update.mockClear();
    const tools = await watchlistTools();
    const data = await callTool(tools, "robinhood_remove_option_from_watchlist", {
      option_ids: [NEW_OPTION],
    });
    expect(data.not_present).toHaveLength(1);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("Tool error handling", () => {
  it("returns isError when client method throws", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.getQuotes as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("API failure"));

    const { registerStockTools } = await import("../../src/server/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const handler = tools.robinhood_get_equity_quotes as ToolHandler;
    const result = (await handler({ symbols: ["AAPL"] })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.error).toContain("API failure");
  });

  it("returns isError when order placement throws", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    (rh.orderStock as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Insufficient funds"),
    );

    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const handler = tools.robinhood_place_equity_order as ToolHandler;
    const result = (await handler({
      symbol: "AAPL",
      side: "buy",
      type: "market",
      quantity: "100",
      time_in_force: "gtc",
      market_hours: "regular_hours",
    })) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]?.text ?? "{}");
    expect(parsed.error).toContain("Insufficient funds");
  });

  it("forwards market_hours to the client and defaults it to regular_hours", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const spy = rh.orderStock as ReturnType<typeof vi.fn>;
    spy.mockClear();

    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const handler = tools.robinhood_place_equity_order as ToolHandler;
    await handler({
      symbol: "AAPL",
      side: "buy",
      type: "limit",
      quantity: "1",
      limit_price: "150",
      market_hours: "all_day_hours",
      account_number: "ACCT",
      ref_id: "ref-1",
    });
    expect(spy).toHaveBeenCalledWith(
      "AAPL",
      "buy",
      1,
      expect.objectContaining({ marketHours: "all_day_hours", timeInForce: "gfd", refId: "ref-1" }),
    );

    await handler({ symbol: "AAPL", side: "buy", type: "market", quantity: "1" });
    expect(spy).toHaveBeenLastCalledWith(
      "AAPL",
      "buy",
      1,
      expect.objectContaining({ marketHours: "regular_hours" }),
    );
  });

  it("place_equity_order rejects a type/price mismatch and dollar_amount before any call", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().orderStock as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);
    const handler = tools.robinhood_place_equity_order as ToolHandler;

    for (const args of [
      { type: "limit", quantity: "1" },
      { type: "market", quantity: "1", limit_price: "1" },
      { type: "market", dollar_amount: "100" },
    ]) {
      const r = (await handler({ symbol: "AAPL", side: "buy", ...args })) as { isError?: boolean };
      expect(r.isError).toBe(true);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("place_option_order sends option_id legs and rejects market types", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().orderOption as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);
    const handler = tools.robinhood_place_option_order as ToolHandler;

    await handler({
      account_number: "ACCT",
      legs: [{ option_id: "opt1", side: "buy", position_effect: "open" }],
      quantity: "2",
      price: "1.25",
    });
    expect(spy).toHaveBeenCalledWith(
      "",
      [{ optionId: "opt1", side: "buy", positionEffect: "open", ratioQuantity: 1 }],
      1.25,
      2,
      "debit",
      expect.objectContaining({ timeInForce: "gfd", accountNumber: "ACCT" }),
    );

    const r = (await handler({
      account_number: "ACCT",
      legs: [{ option_id: "opt1", side: "buy", position_effect: "open" }],
      quantity: "1",
      type: "market",
    })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("place_crypto_order maps dollar_amount and rejects stop types", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const spy = getClient().orderCrypto as ReturnType<typeof vi.fn>;
    spy.mockClear();
    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);
    const handler = tools.robinhood_place_crypto_order as ToolHandler;

    await handler({
      rhs_account_number: "ABC123",
      symbol: "BTC",
      side: "buy",
      type: "market",
      dollar_amount: "100",
    });
    expect(spy).toHaveBeenCalledWith(
      "BTC",
      "buy",
      100,
      expect.objectContaining({ amountIn: "price", orderType: "market" }),
    );

    const r = (await handler({
      rhs_account_number: "ABC123",
      symbol: "BTC",
      side: "sell",
      type: "stop_loss",
      quantity: "1",
      stop_price: "1",
    })) as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("forwards sell_short through the place tool", async () => {
    const { getClient } = await import("../../src/client/index.js");
    const rh = getClient();
    const spy = rh.orderStock as ReturnType<typeof vi.fn>;
    spy.mockClear();

    const { registerOrderTools } = await import("../../src/server/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const handler = tools.robinhood_place_equity_order as ToolHandler;
    await handler({
      symbol: "AAPL",
      side: "sell_short",
      type: "limit",
      quantity: "10",
      limit_price: "150",
      time_in_force: "gfd",
      market_hours: "regular_hours",
      account_number: "ACCT",
    });

    expect(spy).toHaveBeenCalledWith(
      "AAPL",
      "sell_short",
      10,
      expect.objectContaining({ marketHours: "regular_hours" }),
    );
  });

  it("robinhood_get_market_hours returns the session windows", async () => {
    const { registerMarketTools } = await import("../../src/server/tools/markets.js");
    const { server, tools } = captureMockServer();
    registerMarketTools(server);

    const result = await callTool(tools, "robinhood_get_market_hours", {});
    expect(result.is_open).toBe(true);
    expect(result.opens_at).toBe("2026-07-27T13:30:00Z");
    expect(typeof result.note).toBe("string");
  });
});
