/**
 * The 3.0.0 client methods over a stubbed global `fetch`: the real URL, method,
 * and body each one sends. No network — every request hits the stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RobinhoodClient } from "../../src/client/client.js";

interface Sent {
  url: URL;
  method: string;
  body: unknown;
}

let sent: Sent[];

/** Stub fetch; `reply` maps a request to its JSON body. */
function stubFetch(reply: (url: URL, method: string) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      const raw = init?.body;
      sent.push({ url, method, body: typeof raw === "string" ? JSON.parse(raw) : raw });
      return new Response(JSON.stringify(reply(url, method)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

let rh: RobinhoodClient;

beforeEach(() => {
  sent = [];
  rh = new RobinhoodClient({ accessToken: "xxx-token" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("option reads", () => {
  it("getOptionChains by ids", async () => {
    stubFetch(() => ({ results: [{ id: "c1" }] }));
    expect(await rh.getOptionChains({ ids: ["c1", "c2"] })).toEqual([{ id: "c1" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("GET");
    expect(`${sent[0]?.url.origin}${sent[0]?.url.pathname}`).toBe(
      "https://api.robinhood.com/options/chains/",
    );
    expect(sent[0]?.url.searchParams.get("ids")).toBe("c1,c2");
  });

  it("getOptionChains for an index underlying uses its tradable chain ids", async () => {
    stubFetch((url) =>
      url.pathname === "/indexes/"
        ? { results: [{ id: "i1", symbol: "SPX", tradable_chain_ids: ["c1", "c2"] }] }
        : { results: [{ id: "c1" }, { id: "c2" }] },
    );
    const chains = await rh.getOptionChains({ underlyingSymbol: "spx" });
    expect(chains).toHaveLength(2);
    expect(sent.map((s) => s.url.pathname)).toEqual(["/indexes/", "/options/chains/"]);
    expect(sent[1]?.url.searchParams.get("ids")).toBe("c1,c2");
  });

  it("getOptionChains for an equity underlying queries by instrument id", async () => {
    stubFetch((url) =>
      url.pathname === "/indexes/"
        ? { results: [] }
        : url.pathname === "/instruments/"
          ? { results: [{ id: "inst1", symbol: "AAPL" }] }
          : { results: [{ id: "c1" }] },
    );
    await rh.getOptionChains({ underlyingSymbol: "AAPL" });
    const chains = sent.at(-1);
    expect(chains?.url.pathname).toBe("/options/chains/");
    expect(chains?.url.searchParams.get("equity_instrument_ids")).toBe("inst1");
    expect(chains?.url.searchParams.get("state")).toBe("active");
  });

  it("getOptionInstruments sends the chain filters and re-applies them", async () => {
    stubFetch(() => ({
      results: [
        { id: "o1", type: "call", strike_price: "150.0000", expiration_date: "2026-10-16" },
        { id: "o2", type: "put", strike_price: "150.0000", expiration_date: "2026-10-16" },
      ],
      next: null,
    }));
    const out = await rh.getOptionInstruments({
      chainId: "c1",
      expirationDates: ["2026-10-16"],
      strikePrice: "150",
      type: "call",
    });
    expect(out.map((o) => o.id)).toEqual(["o1"]);
    const p = sent[0]?.url.searchParams;
    expect(sent[0]?.url.pathname).toBe("/options/instruments/");
    expect(Object.fromEntries(p ?? [])).toEqual({
      chain_id: "c1",
      expiration_dates: "2026-10-16",
      strike_price: "150",
      type: "call",
    });
  });

  it("getOptionQuotes fetches market data per id", async () => {
    stubFetch((url) => ({ instrument_id: url.pathname.split("/")[3] }));
    const quotes = await rh.getOptionQuotes(["o1", "o2"]);
    expect(quotes).toEqual([{ instrument_id: "o1" }, { instrument_id: "o2" }]);
    expect(sent.map((s) => `${s.method} ${s.url.pathname}`)).toEqual([
      "GET /marketdata/options/o1/",
      "GET /marketdata/options/o2/",
    ]);
  });

  it("getOptionHistoricalsById sends span/interval/bounds", async () => {
    stubFetch(() => ({ data_points: [] }));
    await rh.getOptionHistoricalsById("o1", { span: "week", interval: "hour", bounds: "regular" });
    expect(sent[0]?.url.pathname).toBe("/marketdata/options/historicals/o1/");
    expect(Object.fromEntries(sent[0]?.url.searchParams ?? [])).toEqual({
      span: "week",
      interval: "hour",
      bounds: "regular",
    });
  });

  it("getIndexValues requests one id at a time and skips missing values", async () => {
    stubFetch((url) =>
      url.searchParams.get("ids") === "i1" ? { data: [{ data: { value: "5000" } }] } : { data: [] },
    );
    expect(await rh.getIndexValues(["i1", "i2"])).toEqual([{ value: "5000" }]);
    expect(sent.map((s) => s.url.pathname)).toEqual([
      "/marketdata/indexes/values/v1/",
      "/marketdata/indexes/values/v1/",
    ]);
  });
});

describe("order ref_id and option_id legs", () => {
  it("orderStock sends the caller's ref_id", async () => {
    stubFetch((_url, method) =>
      method === "POST"
        ? { id: "ord1" }
        : {
            results: [
              { id: "inst1", symbol: "AAPL", url: "https://api.robinhood.com/instruments/inst1/" },
            ],
          },
    );
    await rh.orderStock("AAPL", "buy", 1, {
      timeInForce: "gfd",
      marketHours: "regular_hours",
      accountNumber: "ACCOUNT_ID",
      refId: "ref-1",
    });
    const post = sent.find((s) => s.method === "POST");
    expect(post?.url.href).toBe("https://api.robinhood.com/orders/");
    expect(post?.body).toMatchObject({
      account: "https://api.robinhood.com/accounts/ACCOUNT_ID/",
      symbol: "AAPL",
      side: "buy",
      quantity: "1",
      type: "market",
      market_hours: "regular_hours",
      ref_id: "ref-1",
    });
  });

  it("orderOption takes option_id legs without resolving a symbol", async () => {
    stubFetch(() => ({ id: "ord1" }));
    await rh.orderOption(
      "",
      [
        { optionId: "o1", side: "buy", positionEffect: "open" },
        { optionId: "o2", side: "sell", positionEffect: "open", ratioQuantity: 1 },
      ],
      1.25,
      2,
      "debit",
      { timeInForce: "gfd", accountNumber: "ACCOUNT_ID", refId: "ref-2" },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.url.href).toBe("https://api.robinhood.com/options/orders/");
    expect(sent[0]?.body).toMatchObject({
      account: "https://api.robinhood.com/accounts/ACCOUNT_ID/",
      direction: "debit",
      legs: [
        { option_id: "o1", side: "buy", position_effect: "open", ratio_quantity: 1 },
        { option_id: "o2", side: "sell", position_effect: "open", ratio_quantity: 1 },
      ],
      price: "1.25",
      quantity: "2",
      type: "limit",
      trigger: "immediate",
      time_in_force: "gfd",
      ref_id: "ref-2",
    });
  });

  it("orderCrypto sends the caller's ref_id", async () => {
    stubFetch((_url, method) =>
      method === "POST"
        ? { id: "ord1" }
        : { results: [{ id: "cp1", asset_currency: { code: "BTC" } }] },
    );
    await rh.orderCrypto("btc", "buy", 0.5, { orderType: "market", refId: "ref-3" });
    const post = sent.find((s) => s.method === "POST");
    expect(post?.url.href).toBe("https://nummus.robinhood.com/orders/");
    expect(post?.body).toMatchObject({
      currency_pair_id: "cp1",
      side: "buy",
      type: "market",
      quantity: "0.5",
      ref_id: "ref-3",
    });
  });

  it("reviewOptionOrder resolves option_id legs to their chain for collateral", async () => {
    stubFetch((url) => {
      if (url.pathname === "/options/instruments/o1/") {
        return {
          id: "o1",
          chain_id: "c1",
          chain_symbol: "AAPL",
          type: "call",
          strike_price: "150.0000",
          expiration_date: "2026-10-16",
        };
      }
      if (url.pathname === "/marketdata/options/o1/") return { mark_price: "1.20" };
      return { collateral: {} };
    });
    const review = await rh.reviewOptionOrder({
      legs: [{ optionId: "o1", side: "buy", positionEffect: "open" }],
      price: 1.25,
      quantity: 1,
      direction: "debit",
      accountNumber: "ACCOUNT_ID",
    });
    expect(review.symbol).toBe("AAPL");
    expect(review.legs[0]).toMatchObject({ option_id: "o1", strike: 150, option_type: "call" });
    expect(sent.map((s) => s.url.pathname)).toEqual([
      "/options/instruments/o1/",
      "/marketdata/options/o1/",
      "/options/chains/c1/collateral/",
    ]);
    expect(sent.every((s) => s.method === "GET")).toBe(true);
  });
});
