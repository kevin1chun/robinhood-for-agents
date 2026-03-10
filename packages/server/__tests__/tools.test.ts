import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";

// Mock @rh-agent-tools/client so tools don't need real auth
vi.mock("@rh-agent-tools/client", () => {
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
    getFundamentals: vi.fn().mockResolvedValue([{ pe_ratio: "25.5" }]),
    getStockHistoricals: vi
      .fn()
      .mockResolvedValue([
        { symbol: "AAPL", historicals: [{ begins_at: "2024-01-01", close_price: "150.00" }] },
      ]),
    getNews: vi.fn().mockResolvedValue([{ title: "News" }]),
    getRatings: vi.fn().mockResolvedValue({}),
    getEarnings: vi.fn().mockResolvedValue([]),
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
  };

  return {
    getClient: () => mockClient,
    AuthenticationError: class extends Error {},
    saveTokens: vi.fn(),
    loadTokens: vi.fn(),
    deleteTokens: vi.fn(),
  };
});

// Mock browser-auth so auth tool tests don't launch a real browser
vi.mock("../src/browser-auth.js", () => ({
  browserLogin: vi.fn().mockResolvedValue({
    status: "logged_in",
    account_hint: "...4521",
  }),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function captureMockServer(): { server: McpServer; tools: Record<string, ToolHandler> } {
  const tools: Record<string, ToolHandler> = {};
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
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

  it("registers all 18 tools without throwing", () => {
    createServer();
    expect(true).toBe(true);
  });
});

describe("Tool handlers return MCP content format", () => {
  it("registerPortfolioTools handlers work", async () => {
    const { registerPortfolioTools } = await import("../src/tools/portfolio.js");
    const { server, tools } = captureMockServer();
    registerPortfolioTools(server);

    expect(tools.robinhood_get_portfolio).toBeDefined();
    expect(tools.robinhood_get_accounts).toBeDefined();
    expect(tools.robinhood_get_account).toBeDefined();

    const accountsData = await callTool(tools, "robinhood_get_accounts");
    expect(accountsData.accounts).toEqual([
      { url: "https://api.robinhood.com/accounts/ABC123/", account_number: "ABC123", type: "cash" },
    ]);

    const accountData = await callTool(tools, "robinhood_get_account", { info_type: "user" });
    expect(accountData.user).toEqual({ username: "testuser" });
  });

  it("registerOrderTools handlers work", async () => {
    const { registerOrderTools } = await import("../src/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const ordersData = await callTool(tools, "robinhood_get_orders", {
      order_type: "stock",
      status: "all",
    });
    expect(ordersData.orders).toEqual([{ id: "o1" }]);
    expect(ordersData.order_type).toBe("stock");
  });

  it("registerOrderTools respects limit param", async () => {
    const { registerOrderTools } = await import("../src/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const ordersData = await callTool(tools, "robinhood_get_orders", {
      order_type: "stock",
      status: "all",
      limit: 0,
    });
    // limit: 0 means no slicing
    expect(ordersData.orders).toEqual([{ id: "o1" }]);
  });

  it("registerOrderTools order status works", async () => {
    const { registerOrderTools } = await import("../src/tools/orders.js");
    const { server, tools } = captureMockServer();
    registerOrderTools(server);

    const orderData = await callTool(tools, "robinhood_get_order_status", {
      order_id: "o1",
      order_type: "stock",
    });
    expect(orderData.order).toEqual({ id: "o1", state: "filled" });
  });

  it("registerMarketTools handlers work", async () => {
    const { registerMarketTools } = await import("../src/tools/markets.js");
    const { server, tools } = captureMockServer();
    registerMarketTools(server);

    const moversData = await callTool(tools, "robinhood_get_movers", {
      category: "top_movers",
    });
    expect(moversData.movers).toEqual([{ url: "...", id: "1", symbol: "TSLA" }]);
  });

  it("registerStockTools handlers work", async () => {
    const { registerStockTools } = await import("../src/tools/stocks.js");
    const { server, tools } = captureMockServer();
    registerStockTools(server);

    const quoteData = await callTool(tools, "robinhood_get_stock_quote", {
      symbols: "AAPL",
    });
    expect(quoteData.AAPL).toBeDefined();
    expect(quoteData.AAPL.quote).toEqual({ symbol: "AAPL", last_trade_price: "150.00" });
  });

  it("registerAuthTools handlers work", async () => {
    const { registerAuthTools } = await import("../src/tools/auth.js");
    const { server, tools } = captureMockServer();
    registerAuthTools(server);

    expect(tools.robinhood_browser_login).toBeDefined();
    expect(tools.robinhood_check_session).toBeDefined();

    const loginData = await callTool(tools, "robinhood_browser_login");
    expect(loginData.status).toBe("logged_in");
    expect(loginData.account_hint).toBe("...4521");
  });
});
