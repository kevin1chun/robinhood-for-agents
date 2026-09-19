/** The 80 official tools, relayed to Robinhood's hosted MCP (agent mode). */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  type CallToolResult,
  McpError,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { redactTokens } from "../../redact.js";
import { VERSION } from "../../version.js";
import { structured, textError } from "../tools/_helpers.js";
import {
  freshAccessToken,
  type OfficialCredentialStore,
  OfficialNotSignedIn,
  signIn,
} from "./auth.js";
import { officialTools } from "./doc.js";

export const OFFICIAL_MCP_URL = "https://agent.robinhood.com/mcp/trading";

export type Upstream = { connect(): Promise<Client> };

const RELAY_NOTE =
  "Relayed to Robinhood's hosted MCP (agent.robinhood.com) under the credential from robinhood_official_login. Orders through it reach the Agentic account only.";

const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
const ONCE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false };
const REMOVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
};
const CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};
const ENSURE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
};
const ANNOTATIONS: Record<string, ToolAnnotations> = {
  place_advanced_order: ONCE,
  place_crypto_order: ONCE,
  place_equity_order: ONCE,
  place_option_order: ONCE,
  exercise_option: ONCE,
  cancel_advanced_order: REMOVE,
  cancel_crypto_order: REMOVE,
  cancel_equity_order: REMOVE,
  cancel_option_exercise: REMOVE,
  cancel_option_order: REMOVE,
  delete_alert: REMOVE,
  remove_from_watchlist: REMOVE,
  remove_option_from_watchlist: REMOVE,
  unfollow_watchlist: REMOVE,
  update_alert: REMOVE,
  update_scan_config: REMOVE,
  update_scan_filters: REMOVE,
  create_alert: CREATE,
  create_scan: CREATE,
  // A second create makes a second list, so a retry is not safe (the REST tool says the same).
  create_watchlist: CREATE,
  add_option_to_watchlist: ENSURE,
  add_to_watchlist: ENSURE,
  follow_watchlist: ENSURE,
  mark_alerts_read: ENSURE,
  update_watchlist: ENSURE,
};

/** One connected client per process, built on first use and dropped when it closes. */
export function liveUpstream(store: OfficialCredentialStore): Upstream {
  let cached: Promise<Client> | undefined;
  const authed: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${await freshAccessToken(store)}`);
    return fetch(url, { ...init, headers });
  };
  return {
    connect() {
      if (!cached) {
        const client = new Client({ name: "robinhood-for-agents", version: VERSION });
        const p = client
          .connect(new StreamableHTTPClientTransport(new URL(OFFICIAL_MCP_URL), { fetch: authed }))
          .then(() => client);
        client.onclose = () => {
          if (cached === p) cached = undefined;
        };
        p.catch(() => {
          if (cached === p) cached = undefined;
        });
        cached = p;
      }
      return cached;
    },
  };
}

async function relay(client: Client, name: string, args: unknown): Promise<CallToolResult> {
  const r = (await client.callTool(
    { name, arguments: args as Record<string, unknown> },
    undefined,
    { timeout: 30_000 },
  )) as CallToolResult;
  const out: CallToolResult = {
    content: r.content.map((b) => (b.type === "text" ? { ...b, text: redactTokens(b.text) } : b)),
  };
  if (r.structuredContent) out.structuredContent = r.structuredContent;
  if (r.isError) out.isError = true;
  return out;
}

/** A transport failure, not a protocol answer or a throttle: worth one reconnect. */
function isTransportError(e: unknown): boolean {
  return (
    !(e instanceof McpError) &&
    !(e instanceof OfficialNotSignedIn) &&
    !String(e).includes("RATE_LIMITED")
  );
}

function title(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function registerOfficialTools(
  server: McpServer,
  upstream: Upstream,
  store: OfficialCredentialStore,
): void {
  for (const [name, tool] of officialTools()) {
    server.registerTool(
      `robinhood_${name}`,
      {
        title: title(name),
        description: `${tool.description}\n\n${RELAY_NOTE}`,
        inputSchema: z.fromJSONSchema(tool.inputSchema as z.core.JSONSchema.JSONSchema),
        annotations: ANNOTATIONS[name] ?? READ_ONLY,
      },
      async (args: unknown) => {
        const a = ANNOTATIONS[name] ?? READ_ONLY;
        // A non-idempotent write is never retried: the failed attempt may have landed.
        const retryable = a.readOnlyHint === true || a.idempotentHint === true;
        try {
          await freshAccessToken(store);
          let client: Client | undefined;
          try {
            client = await upstream.connect();
            return await relay(client, name, args);
          } catch (e) {
            if (!isTransportError(e)) throw e;
            await client?.close();
            if (!retryable) {
              if (!client) throw e;
              const message = e instanceof Error ? e.message : String(e);
              throw new Error(
                `${message}. The request may have reached Robinhood and was not retried; check with the matching get tool before retrying.`,
              );
            }
            return await relay(await upstream.connect(), name, args);
          }
        } catch (e) {
          return textError(e instanceof Error ? e.message : String(e));
        }
      },
    );
  }

  server.registerTool(
    "robinhood_official_login",
    {
      title: "Official MCP Login",
      description:
        "Sign in to Robinhood's hosted MCP (agent.robinhood.com), which serves every tool in agent mode. Opens the default browser to Robinhood's sign-in; the user approves there. Needed once; nothing is typed through this tool.",
      inputSchema: {},
      outputSchema: { status: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        return structured(
          await signIn(store, {
            openUrl: (u) => {
              try {
                Bun.spawn(["open", u]);
              } catch {
                throw new Error(`could not open a browser; open this URL: ${u}`);
              }
            },
          }),
        );
      } catch (e) {
        return textError(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
