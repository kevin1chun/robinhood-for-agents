/**
 * OAuth credential for Robinhood's hosted MCP (agent.robinhood.com). A separate credential from
 * the REST session: the two are partitioned at the OAuth client, so neither works on the other's
 * surface. Refresh tokens are single-use; every grant rotates them.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { envEncryptionKey, openBlob, sealBlob } from "../../client/token-store.js";

const REGISTER_URL = "https://agent.robinhood.com/oauth/trading/register";
const AUTHORIZE_URL = "https://robinhood.com/oauth";
const TOKEN_URL = "https://api.robinhood.com/oauth2/token/";
const SCOPE = "internal";
const REFRESH_SKEW_SEC = 3600;

export type OfficialCredential = {
  client_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export interface OfficialCredentialStore {
  load(): Promise<OfficialCredential | null>;
  save(c: OfficialCredential): Promise<void>;
  delete(): Promise<void>;
}

export class OfficialNotSignedIn extends Error {
  constructor(
    message = "Not signed in to Robinhood's hosted MCP; run robinhood_official_login first",
  ) {
    super(message);
    this.name = "OfficialNotSignedIn";
  }
}

function parseCredential(json: string | null): OfficialCredential | null {
  if (!json) return null;
  const c = JSON.parse(json) as Partial<OfficialCredential>;
  return typeof c.client_id === "string" &&
    typeof c.access_token === "string" &&
    typeof c.refresh_token === "string" &&
    typeof c.expires_at === "number"
    ? (c as OfficialCredential)
    : null;
}

/** Beside `ROBINHOOD_TOKENS_FILE` when set, else in the REST file store's default directory. */
export function officialCredentialPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const tokensFile = env.ROBINHOOD_TOKENS_FILE?.trim();
  return join(
    tokensFile ? dirname(tokensFile) : join(env.HOME ?? homedir(), ".robinhood-for-agents"),
    "official-mcp.enc",
  );
}

/** The key comes from ROBINHOOD_TOKEN_KEY only: this credential never touches the OS keychain. */
function requireKey(): Buffer {
  const key = envEncryptionKey();
  if (!key) {
    throw new Error(
      "Standard mode needs ROBINHOOD_TOKEN_KEY to encrypt its credential file. Run `bunx robinhood-for-agents install` (it generates the key and writes it into your agent config), then restart.",
    );
  }
  return key;
}

/** AES-256-GCM file, mode 0600. A missing key throws; a missing file loads as null. */
export function createOfficialCredentialStore(): OfficialCredentialStore {
  const path = officialCredentialPath();
  return {
    async load() {
      const key = requireKey();
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch {
        return null;
      }
      try {
        return parseCredential(await openBlob(raw, key));
      } catch {
        return null;
      }
    },
    async save(c) {
      const key = requireKey();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await sealBlob(JSON.stringify(c), key), {
        encoding: "utf8",
        mode: 0o600,
      });
    },
    async delete() {
      try {
        await unlink(path);
      } catch {
        // File missing
      }
    },
  };
}

/** POST a form to the token endpoint; the body is credential material and never logged. */
async function tokenGrant(
  f: typeof fetch,
  form: Record<string, string>,
): Promise<{ status: number; body?: Record<string, unknown> }> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  if (!res.ok) return { status: res.status };
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function credentialFrom(
  clientId: string,
  body: Record<string, unknown>,
  now: number,
): OfficialCredential {
  if (typeof body.access_token !== "string" || typeof body.refresh_token !== "string") {
    throw new Error("token response carried no access_token or refresh_token");
  }
  return {
    client_id: clientId,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    // A missing expires_in makes the token stale at once, so the next call refreshes.
    expires_at: now + (Number(body.expires_in) || 0),
  };
}

export async function signIn(
  store: OfficialCredentialStore,
  opts: { openUrl: (url: string) => void; timeoutMs?: number; fetch?: typeof fetch },
): Promise<{ status: "signed_in" }> {
  const f = opts.fetch ?? fetch;
  // A store that cannot be written (no key) fails here, not after the user's browser trip.
  await store.load();
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  let answer: (code: string, finish: (page: string) => void) => void = () => {};
  let fail: (e: Error) => void = () => {};
  const callback = new Promise<{ code: string; finish: (page: string) => void }>(
    (resolve, reject) => {
      answer = (code, finish) => resolve({ code, finish });
      fail = reject;
    },
  );
  // A timeout can fire before the callback is awaited; the await below still sees it.
  callback.catch(() => {});
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    if (url.searchParams.get("state") !== state) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("state mismatch");
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      const error = url.searchParams.get("error") ?? "no code";
      res.writeHead(400, { "Content-Type": "text/plain" }).end(`sign-in failed: ${error}`);
      fail(new Error(`sign-in failed: ${error}`));
      return;
    }
    answer(code, (page) => res.writeHead(200, { "Content-Type": "text/plain" }).end(page));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const timer = setTimeout(
    () => fail(new Error("sign-in timed out: the browser never returned to the callback")),
    opts.timeoutMs ?? 300_000,
  );

  try {
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
    const reg = await f(REGISTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: "robinhood-for-agents",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
        scope: SCOPE,
      }),
    });
    if (!reg.ok) throw new Error(`client registration failed: HTTP ${reg.status}`);
    const clientId = ((await reg.json()) as { client_id?: unknown }).client_id;
    if (typeof clientId !== "string") throw new Error("client registration returned no client_id");

    const authorize = new URL(AUTHORIZE_URL);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) {
      authorize.searchParams.set(k, v);
    }
    opts.openUrl(authorize.toString());

    const { code, finish } = await callback;
    try {
      const grant = await tokenGrant(f, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      });
      if (!grant.body) throw new Error(`token exchange failed: HTTP ${grant.status}`);
      await store.save(credentialFrom(clientId, grant.body, Date.now() / 1000));
      finish("Signed in to Robinhood's hosted MCP. Close this tab.");
    } catch (e) {
      finish("Sign-in failed. Return to your agent.");
      throw e;
    }
    return { status: "signed_in" };
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

/** A refresh grant; saves the rotated pair before answering. Null on a 4xx (grant rejected). */
async function refresh(
  store: OfficialCredentialStore,
  cred: OfficialCredential,
  f: typeof fetch,
  now: number,
): Promise<string | null> {
  const grant = await tokenGrant(f, {
    grant_type: "refresh_token",
    refresh_token: cred.refresh_token,
    client_id: cred.client_id,
  });
  if (!grant.body) {
    if (grant.status >= 400 && grant.status < 500) return null;
    throw new Error(`token refresh failed: HTTP ${grant.status}`);
  }
  const next = credentialFrom(cred.client_id, grant.body, now);
  await store.save(next);
  return next.access_token;
}

export async function freshAccessToken(
  store: OfficialCredentialStore,
  opts: { fetch?: typeof fetch; now?: () => number } = {},
): Promise<string> {
  const f = opts.fetch ?? fetch;
  const now = opts.now?.() ?? Date.now() / 1000;
  const cred = await store.load();
  if (!cred) throw new OfficialNotSignedIn();
  if (cred.expires_at - now > REFRESH_SKEW_SEC) return cred.access_token;
  const token = await refresh(store, cred, f, now);
  if (token) return token;
  // No cross-process lock: a rejected grant may mean another process already rotated the pair.
  const reloaded = await store.load();
  if (reloaded && reloaded.refresh_token !== cred.refresh_token) {
    if (reloaded.expires_at - now > REFRESH_SKEW_SEC) return reloaded.access_token;
    const again = await refresh(store, reloaded, f, now);
    if (again) return again;
  }
  throw new OfficialNotSignedIn("refresh rejected; run robinhood_official_login");
}
