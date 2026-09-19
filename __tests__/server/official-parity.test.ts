/**
 * Parity with the official Robinhood Trading MCP. Reads the official tools from
 * docs/official-mcp-tools.json and the Parity table from docs/official-mcp-tools.md.
 * Agent mode (all 80) lists each tool's title, description and annotations verbatim and its
 * input and output schemas; standard mode (all but the agent-only rows) its input schema.
 * A schema is compared by property names, required set, enum values, and primitive type,
 * recursively. Nullability is ignored (the official schemas mark optional arrays nullable).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  OfficialCredential,
  OfficialCredentialStore,
} from "../../src/server/official/auth.js";
import { officialTools, parityStatus } from "../../src/server/official/doc.js";
import { createServer } from "../../src/server/server.js";

type Schema = {
  type?: string | string[];
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
};

const official = officialTools();
const status = parityStatus();

/** Drop null from a type union or an anyOf wrapper. */
function unwrap(s: Schema): Schema {
  if (s.anyOf) {
    const rest = s.anyOf.filter((x) => x.type !== "null");
    if (rest.length === 1) return unwrap(rest[0] as Schema);
  }
  if (Array.isArray(s.type)) {
    const rest = s.type.filter((t) => t !== "null");
    return { ...s, type: rest.length === 1 ? rest[0] : rest };
  }
  return s;
}

/** Every difference between the official and the registered schema, as path: message. */
function drift(o: Schema, c: Schema, path: string): string[] {
  const a = unwrap(o);
  const b = unwrap(c);
  const out: string[] = [];
  if (JSON.stringify(a.type) !== JSON.stringify(b.type)) {
    out.push(`${path}: type ${JSON.stringify(a.type)} vs ${JSON.stringify(b.type)}`);
  }
  if (JSON.stringify(a.enum) !== JSON.stringify(b.enum)) {
    out.push(`${path}: enum ${JSON.stringify(a.enum)} vs ${JSON.stringify(b.enum)}`);
  }
  if (a.properties || b.properties) {
    const ap = a.properties ?? {};
    const bp = b.properties ?? {};
    const names = (p: Record<string, Schema>) => Object.keys(p).sort().join(",");
    if (names(ap) !== names(bp)) out.push(`${path}: properties ${names(ap)} vs ${names(bp)}`);
    const req = (s: Schema) => [...(s.required ?? [])].sort().join(",");
    if (req(a) !== req(b)) out.push(`${path}: required ${req(a)} vs ${req(b)}`);
    for (const k of Object.keys(ap)) {
      if (bp[k]) out.push(...drift(ap[k] as Schema, bp[k] as Schema, `${path}.${k}`));
    }
  }
  if (a.items || b.items) out.push(...drift(a.items ?? {}, b.items ?? {}, `${path}[]`));
  return out;
}

async function listed(server: ReturnType<typeof createServer>): Promise<Map<string, Tool>> {
  const client = new Client({ name: "parity", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  const { tools } = await client.listTools();
  return new Map(tools.map((t) => [t.name, t]));
}

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

let standard: Map<string, Tool>;
let agent: Map<string, Tool>;

beforeAll(async () => {
  standard = await listed(createServer());
  agent = await listed(
    createServer({
      mode: "agent",
      officialStore: memoryStore(null),
      upstream: { connect: () => Promise.reject(new Error("no upstream in tests")) },
    }),
  );
});

const webServed = [...status].filter(([, s]) => s !== "agent-only").map(([n]) => n);
const agentOnly = [...status].filter(([, s]) => s === "agent-only").map(([n]) => n);

describe("official MCP parity", () => {
  it("the Parity table covers all 80 official tools", () => {
    expect(official.size).toBe(80);
    expect([...status.keys()].sort()).toEqual([...official.keys()].sort());
  });

  it("every status is known; 28 are agent-only", () => {
    expect(
      [...status.values()].filter((s) => !["same", "renamed", "new", "agent-only"].includes(s)),
    ).toEqual([]);
    expect(agentOnly).toHaveLength(28);
  });

  it("agent mode lists exactly the 80 official tools plus robinhood_official_login", () => {
    expect([...agent.keys()].sort()).toEqual(
      [...[...official.keys()].map((n) => `robinhood_${n}`), "robinhood_official_login"].sort(),
    );
  });

  it.each([...status.keys()])("agent mode: robinhood_%s lists the official definition", (name) => {
    const o = official.get(name) as Tool;
    const t = agent.get(`robinhood_${name}`) as Tool;
    expect(t.title).toBe(o.title);
    expect(t.description).toBe(o.description);
    expect(t.annotations).toEqual(o.annotations);
    expect(drift(o.inputSchema as Schema, t.inputSchema as Schema, name)).toEqual([]);
    if (o.outputSchema) {
      expect(drift(o.outputSchema as Schema, t.outputSchema as Schema, `${name}->`)).toEqual([]);
    } else {
      expect(t.outputSchema).toBeUndefined();
    }
  });

  it.each(webServed)("standard mode: robinhood_%s takes the official input schema", (name) => {
    const tool = standard.get(`robinhood_${name}`);
    expect(tool, `robinhood_${name} is not registered`).toBeDefined();
    expect(
      drift(official.get(name)?.inputSchema as Schema, tool?.inputSchema as Schema, name),
    ).toEqual([]);
  });

  it("standard mode has no agent-only tool and no official login", () => {
    for (const n of agentOnly) expect(standard.has(`robinhood_${n}`), n).toBe(false);
    expect(standard.has("robinhood_official_login")).toBe(false);
    expect(standard.size).toBe(59);
  });
});
