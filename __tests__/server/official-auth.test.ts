/** Hosted-MCP credential: refresh rotation and the sign-in callback, with a stubbed fetch. */
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  createOfficialCredentialStore,
  freshAccessToken,
  type OfficialCredential,
  type OfficialCredentialStore,
  OfficialNotSignedIn,
  officialCredentialPath,
  signIn,
} from "../../src/server/official/auth.js";

const NOW = 1_800_000_000;
const TOKEN_URL = "https://api.robinhood.com/oauth2/token/";

/** Bun's `typeof fetch` also carries `preconnect`, which a stub need not. */
const asFetch = (f: unknown) => f as typeof fetch;

function memoryStore(cred: OfficialCredential | null) {
  const store = {
    cred,
    load: vi.fn(async () => store.cred),
    save: vi.fn(async (next: OfficialCredential) => {
      store.cred = next;
    }),
    delete: vi.fn(async () => {
      store.cred = null;
    }),
  };
  return store satisfies OfficialCredentialStore;
}

function cred(over: Partial<OfficialCredential> = {}): OfficialCredential {
  return {
    client_id: "client-x",
    access_token: "access-old",
    refresh_token: "refresh-old",
    expires_at: NOW + 60,
    ...over,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("freshAccessToken", () => {
  it("returns the stored token when fresh, with no request", async () => {
    const store = memoryStore(cred({ expires_at: NOW + 86_400 }));
    const f = vi.fn();
    expect(await freshAccessToken(store, { fetch: asFetch(f), now: () => NOW })).toBe("access-old");
    expect(f).not.toHaveBeenCalled();
  });

  it("refreshes a stale token and saves the rotated pair before returning", async () => {
    const store = memoryStore(cred());
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { access_token: "access-new", refresh_token: "refresh-new", expires_in: 86_400 }),
    );
    const token = await freshAccessToken(store, { fetch: asFetch(f), now: () => NOW });
    expect(token).toBe("access-new");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    const form = new URLSearchParams(init.body as string);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("refresh-old");
    expect(form.get("client_id")).toBe("client-x");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.cred).toEqual({
      client_id: "client-x",
      access_token: "access-new",
      refresh_token: "refresh-new",
      expires_at: NOW + 86_400,
    });
  });

  it("adopts a pair another process rotated when its own grant is rejected", async () => {
    const store = memoryStore(cred());
    const f = vi.fn(async () => {
      // The other process won the race and persisted its pair.
      store.cred = cred({
        access_token: "access-theirs",
        refresh_token: "refresh-theirs",
        expires_at: NOW + 86_400,
      });
      return json(401, { error: "invalid_grant" });
    });
    expect(await freshAccessToken(store, { fetch: asFetch(f), now: () => NOW })).toBe(
      "access-theirs",
    );
    expect(f).toHaveBeenCalledTimes(1);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("a rejected grant with no rotation throws OfficialNotSignedIn and keeps the store", async () => {
    const store = memoryStore(cred());
    const f = vi.fn(async () => json(401, { error: "invalid_grant" }));
    await expect(
      freshAccessToken(store, { fetch: asFetch(f), now: () => NOW }),
    ).rejects.toBeInstanceOf(OfficialNotSignedIn);
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.cred).toEqual(cred());
  });

  it("never carries the response body in an error", async () => {
    const store = memoryStore(cred());
    const f = vi.fn(async () => json(500, { detail: "secret-body-xyz" }));
    const err = await freshAccessToken(store, { fetch: asFetch(f), now: () => NOW }).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("500");
    expect((err as Error).message).not.toContain("secret-body-xyz");

    const rejected = await freshAccessToken(memoryStore(cred()), {
      fetch: asFetch(vi.fn(async () => json(400, { detail: "secret-body-xyz" }))),
      now: () => NOW,
    }).catch((e: Error) => e);
    expect((rejected as Error).message).not.toContain("secret-body-xyz");
  });

  it("with no credential throws OfficialNotSignedIn naming the login tool", async () => {
    const err = await freshAccessToken(memoryStore(null)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(OfficialNotSignedIn);
    expect((err as Error).message).toContain("robinhood_official_login");
  });
});

describe("signIn callback", () => {
  it("answers 400 on a state mismatch and keeps waiting for the real redirect", async () => {
    const store = memoryStore(null);
    const stub = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).endsWith("/register")
        ? json(201, { client_id: "client-x" })
        : json(200, { access_token: "access-new", refresh_token: "refresh-new", expires_in: 100 }),
    );
    let openUrl: (u: string) => void = () => {};
    const opened = new Promise<URL>((resolve) => {
      openUrl = (u) => resolve(new URL(u));
    });
    const signedIn = signIn(store, { fetch: asFetch(stub), timeoutMs: 5_000, openUrl });
    let settled = false;
    signedIn.then(() => {
      settled = true;
    });
    const au = await opened;
    expect(au.searchParams.get("code_challenge_method")).toBe("S256");
    const redirect = au.searchParams.get("redirect_uri") as string;
    const state = au.searchParams.get("state") as string;

    const bad = await fetch(`${redirect}?code=c1&state=wrong`);
    expect(bad.status).toBe(400);
    expect(settled).toBe(false);
    expect(store.save).not.toHaveBeenCalled();

    const good = await fetch(`${redirect}?code=c1&state=${state}`);
    expect(good.status).toBe(200);
    expect(await signedIn).toEqual({ status: "signed_in" });
    expect(store.cred?.refresh_token).toBe("refresh-new");
    const exchange = new URLSearchParams(stub.mock.calls[1]?.[1]?.body as string);
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("code")).toBe("c1");
    expect(exchange.get("redirect_uri")).toBe(redirect);
  });
});

describe("the standard-mode credential file", () => {
  const dir = mkdtempSync(join(tmpdir(), "rfa-official-"));
  const FAKE_KEY = Buffer.alloc(32, 7).toString("base64");
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("lives beside ROBINHOOD_TOKENS_FILE, else under ~/.robinhood-for-agents", () => {
    expect(officialCredentialPath({ ROBINHOOD_TOKENS_FILE: "/app/tokens.enc" })).toBe(
      "/app/official-mcp.enc",
    );
    expect(officialCredentialPath({ HOME: "/home/u" })).toBe(
      "/home/u/.robinhood-for-agents/official-mcp.enc",
    );
  });

  it("round-trips through an AES-256-GCM file at mode 0600 under ROBINHOOD_TOKEN_KEY", async () => {
    vi.stubEnv("ROBINHOOD_TOKENS_FILE", join(dir, "tokens.enc"));
    vi.stubEnv("ROBINHOOD_TOKEN_KEY", FAKE_KEY);
    const store = createOfficialCredentialStore();
    expect(await store.load()).toBeNull();
    await store.save(cred());
    const file = join(dir, "official-mcp.enc");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const raw = readFileSync(file, "utf8");
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["ciphertext", "iv", "tag"]);
    expect(raw).not.toContain("refresh-old");
    expect(await store.load()).toEqual(cred());
    await store.delete();
    expect(await store.load()).toBeNull();
  });

  it("without ROBINHOOD_TOKEN_KEY, fails with the instruction and never falls back", async () => {
    vi.stubEnv("ROBINHOOD_TOKENS_FILE", join(dir, "tokens.enc"));
    vi.stubEnv("ROBINHOOD_TOKEN_KEY", "");
    const store = createOfficialCredentialStore();
    await expect(store.load()).rejects.toThrow(/ROBINHOOD_TOKEN_KEY/);
    await expect(store.save(cred())).rejects.toThrow(/ROBINHOOD_TOKEN_KEY/);
  });
});
