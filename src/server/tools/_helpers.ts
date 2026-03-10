/** Shared helpers for MCP tool handlers. */

import { redactTokens } from "../../redact.js";
import { getClient } from "../../client/index.js";

export function text(data: unknown) {
  return { content: [{ type: "text" as const, text: redactTokens(JSON.stringify(data)) }] };
}

export function textError(msg: string) {
  return {
    content: [{ type: "text" as const, text: redactTokens(JSON.stringify({ error: msg })) }],
    isError: true as const,
  };
}

export function getRh() {
  return getClient();
}

export async function getAuthenticatedRh() {
  const rh = getClient();
  if (!rh.isLoggedIn) {
    await rh.restoreSession();
  }
  return rh;
}
