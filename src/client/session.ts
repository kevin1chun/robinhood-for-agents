/** HTTP session wrapper for Robinhood API using native fetch. */

import { API_BASE, NUMMUS_BASE } from "./urls.js";

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=1",
  "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
  "X-Robinhood-API-Version": "1.431.4",
  "User-Agent": "robinhood-for-agents/0.1.0",
};

const DEFAULT_TIMEOUT_MS = 16_000;

const TRUSTED_ORIGINS = new Set([
  new URL(API_BASE).origin,
  new URL(NUMMUS_BASE).origin,
  new URL("https://robinhood.com").origin,
]);

/**
 * Follow redirects manually, refusing to send auth headers to untrusted hosts.
 * Returns the final response after following up to `maxRedirects` hops.
 */
async function safeFetch(
  url: string,
  init: RequestInit & { signal: AbortSignal },
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const resp = await fetch(currentUrl, { ...init, redirect: "manual" });

    if (resp.status < 300 || resp.status >= 400) {
      return resp;
    }

    // 3xx redirect
    const location = resp.headers.get("location");
    if (!location) return resp;

    // Resolve relative redirects
    const resolved = new URL(location, currentUrl).href;
    const target = new URL(resolved);
    if (!TRUSTED_ORIGINS.has(target.origin)) {
      throw new Error(`Refusing redirect to untrusted host: ${target.hostname}`);
    }
    currentUrl = resolved;
  }
  throw new Error("Too many redirects");
}

export class RobinhoodSession {
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.headers = { ...DEFAULT_HEADERS };
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  setAuth(token: string): void {
    this.headers.Authorization = `Bearer ${token}`;
  }

  clearAuth(): void {
    delete this.headers.Authorization;
  }

  /**
   * Returns the raw access token. ONLY for token revocation during logout.
   * NEVER expose this value in API responses, logs, or error messages.
   * @internal
   */
  getAuthTokenForRevocation(): string | undefined {
    const auth = this.headers.Authorization;
    return auth?.replace("Bearer ", "");
  }

  async get(url: string, params?: Record<string, string>): Promise<Response> {
    const target = params ? `${url}?${new URLSearchParams(params)}` : url;
    return safeFetch(target, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  async post(
    url: string,
    body?: Record<string, unknown>,
    opts?: { asJson?: boolean; timeoutMs?: number },
  ): Promise<Response> {
    const timeout = opts?.timeoutMs ?? this.timeoutMs;
    const headers = { ...this.headers };

    let requestBody: string;
    if (opts?.asJson) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body ?? {});
    } else {
      for (const [k, v] of Object.entries(body ?? {})) {
        if (v !== null && typeof v === "object") {
          throw new Error(
            `Cannot form-encode nested object at key "${k}". Use asJson: true for complex payloads.`,
          );
        }
      }
      requestBody = new URLSearchParams(
        Object.entries(body ?? {}).map(([k, v]) => [k, String(v)]),
      ).toString();
    }

    return safeFetch(url, {
      method: "POST",
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(timeout),
    });
  }

  async delete(url: string): Promise<Response> {
    return safeFetch(url, {
      method: "DELETE",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

export function createSession(opts?: { timeoutMs?: number }): RobinhoodSession {
  return new RobinhoodSession(opts);
}
