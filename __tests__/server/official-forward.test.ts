/** Standard mode relays official tools to an in-memory upstream; no network. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type {
  OfficialCredential,
  OfficialCredentialStore,
} from "../../src/server/official/auth.js";
import { officialTools } from "../../src/server/official/doc.js";
import type { Upstream } from "../../src/server/official/forward.js";
import { createServer } from "../../src/server/server.js";

// Retry reads the official annotations; pin them here so a refreshed snapshot cannot move the tests.
vi.mock("../../src/server/official/doc.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/server/official/doc.js")>();
  const fixture: Record<string, object> = {
    get_financials: { readOnlyHint: true },
    place_advanced_order: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  };
  const tools = new Map(
    [...real.officialTools()].map(([name, { annotations: _, ...t }]) => [
      name,
      fixture[name] ? { ...t, annotations: fixture[name] } : t,
    ]),
  );
  return { ...real, officialTools: () => tools };
});

type Result = {
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function memoryStore(cred: OfficialCredential | null): OfficialCredentialStore {
  let c = cred;
  return {
    load: async () => c,
    save: async (next) => {
      c = next;
    },
    delete: async () => {
      c = null;
    },
  };
}

const SIGNED_IN = memoryStore({
  client_id: "client-x",
  access_token: "access-x",
  refresh_token: "refresh-x",
  expires_at: Date.now() / 1000 + 86_400,
});

/** An upstream serving get_financials, get_equity_quotes and place_advanced_order with the doc schemas. */
function fakeUpstream() {
  const calls: Array<{ name: string; args: unknown }> = [];
  const official = officialTools();
  const server = new McpServer({ name: "official", version: "0.0.0" });
  server.registerTool(
    "get_financials",
    { inputSchema: z.fromJSONSchema(official.get("get_financials")?.inputSchema as never) },
    async (args: unknown) => {
      calls.push({ name: "get_financials", args });
      return {
        content: [{ type: "text", text: "revenue 100" }],
        structuredContent: { data: { results: [] }, guide: "g" },
      };
    },
  );
  server.registerTool(
    "get_equity_quotes",
    { inputSchema: z.fromJSONSchema(official.get("get_equity_quotes")?.inputSchema as never) },
    async (args: unknown) => {
      calls.push({ name: "get_equity_quotes", args });
      return {
        content: [{ type: "text", text: "AAPL 150" }],
        structuredContent: { data: { results: [] }, guide: "g" },
      };
    },
  );
  server.registerTool(
    "place_advanced_order",
    { inputSchema: z.fromJSONSchema(official.get("place_advanced_order")?.inputSchema as never) },
    async (args: unknown) => {
      calls.push({ name: "place_advanced_order", args });
      return { content: [{ type: "text", text: "REJECTED: market closed" }], isError: true };
    },
  );
  const connect = vi.fn(async () => {
    const client = new Client({ name: "fork", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(ct), server.connect(st)]);
    return client;
  });
  return { upstream: { connect } satisfies Upstream, calls, connect };
}

async function fork(upstream: Upstream, store: OfficialCredentialStore) {
  const server = createServer({ mode: "standard", upstream, officialStore: store });
  const client = new Client({ name: "agent", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  return client;
}

describe("standard mode relays official tools", () => {
  it("relays args verbatim and returns the upstream content", async () => {
    const { upstream, calls } = fakeUpstream();
    const client = await fork(upstream, SIGNED_IN);
    const args = { symbols: ["AAPL"], period: "annual", limit: 2 };
    const r = (await client.callTool({
      name: "robinhood_get_financials",
      arguments: args,
    })) as Result;
    expect(r.isError).toBeFalsy();
    expect(r.content).toEqual([{ type: "text", text: "revenue 100" }]);
    expect(calls).toEqual([{ name: "get_financials", args }]);
  });

  it("relays an upstream isError", async () => {
    const { upstream } = fakeUpstream();
    const client = await fork(upstream, SIGNED_IN);
    const r = (await client.callTool({
      name: "robinhood_place_advanced_order",
      arguments: {
        account_number: "ACCOUNT_ID",
        symbol: "AAPL",
        side: "sell",
        quantity: "1",
        take_profit_limit_price: "250",
        stop_loss_stop_price: "200",
      },
    })) as Result;
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe("REJECTED: market closed");
  });

  it("unsigned, answers an error naming the login tool and never connects", async () => {
    const { upstream, connect } = fakeUpstream();
    const client = await fork(upstream, memoryStore(null));
    const r = (await client.callTool({
      name: "robinhood_get_financials",
      arguments: { symbols: ["AAPL"] },
    })) as Result;
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("robinhood_official_login");
    expect(connect).not.toHaveBeenCalled();
  });

  it("retries a transport error on a read, never on a non-idempotent write", async () => {
    const callTool = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const broken = { callTool, close: vi.fn(async () => {}) } as unknown as Client;
    const client = await fork({ connect: async () => broken }, SIGNED_IN);

    const place = (await client.callTool({
      name: "robinhood_place_advanced_order",
      arguments: {
        account_number: "ACCOUNT_ID",
        symbol: "AAPL",
        side: "sell",
        quantity: "1",
        take_profit_limit_price: "250",
        stop_loss_stop_price: "200",
      },
    })) as Result;
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(place.isError).toBe(true);
    expect(place.content[0]?.text).toContain("fetch failed");
    expect(place.content[0]?.text).toContain("may have reached Robinhood");

    callTool.mockClear();
    const read = (await client.callTool({
      name: "robinhood_get_financials",
      arguments: { symbols: ["AAPL"] },
    })) as Result;
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(read.isError).toBe(true);
    expect(read.content[0]?.text).toContain("fetch failed");
  });

  it("never retries a tool with no annotations", async () => {
    const callTool = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const broken = { callTool, close: vi.fn(async () => {}) } as unknown as Client;
    const client = await fork({ connect: async () => broken }, SIGNED_IN);
    const r = (await client.callTool({
      name: "robinhood_get_equity_quotes",
      arguments: { symbols: ["AAPL"] },
    })) as Result;
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("may have reached Robinhood");
  });

  it("relays a tool the web API also serves in web mode", async () => {
    const { upstream, calls } = fakeUpstream();
    const client = await fork(upstream, SIGNED_IN);
    const args = { symbols: ["AAPL"] };
    const r = (await client.callTool({
      name: "robinhood_get_equity_quotes",
      arguments: args,
    })) as Result;
    expect(r.content).toEqual([{ type: "text", text: "AAPL 150" }]);
    expect(calls).toEqual([{ name: "get_equity_quotes", args }]);
  });
});
