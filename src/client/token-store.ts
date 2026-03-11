/**
 * Token storage using OS keychain via Bun.secrets.
 *
 * Tokens are stored as JSON directly in the OS keychain
 * (macOS Keychain Services, Linux libsecret, Windows Credential Manager).
 *
 * Falls back to plaintext JSON at ~/.robinhood-for-agents/session.json
 * if Bun.secrets is unavailable (e.g. in CI or minimal environments).
 */

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const KEYRING_SERVICE = "robinhood-for-agents";
const KEYRING_NAME = "session-tokens";

const TOKEN_DIR = join(homedir(), ".robinhood-for-agents");
const FALLBACK_FILE = join(TOKEN_DIR, "session.json");

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  device_token: string;
  account_hint?: string;
  saved_at: number;
}

async function secretsAvailable(): Promise<boolean> {
  try {
    if (typeof Bun !== "undefined" && Bun.secrets) {
      await Bun.secrets.get(KEYRING_SERVICE, KEYRING_NAME);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isTokenData(data: unknown): data is TokenData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.access_token === "string" &&
    typeof obj.refresh_token === "string" &&
    typeof obj.token_type === "string" &&
    typeof obj.device_token === "string" &&
    typeof obj.saved_at === "number"
  );
}

export async function saveTokens(tokens: Omit<TokenData, "saved_at">): Promise<string> {
  const data: TokenData = { ...tokens, saved_at: Date.now() / 1000 };
  const json = JSON.stringify(data);

  if (await secretsAvailable()) {
    await Bun.secrets.set(KEYRING_SERVICE, KEYRING_NAME, json);
    return "keychain";
  }

  // Fallback: plaintext JSON file (atomic write with correct permissions from creation)
  console.warn("[robinhood-for-agents] Bun.secrets unavailable — saving tokens as plaintext JSON");
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  const tmpFile = `${FALLBACK_FILE}.tmp`;
  writeFileSync(tmpFile, json, { mode: 0o600 });
  renameSync(tmpFile, FALLBACK_FILE);
  return FALLBACK_FILE;
}

export async function loadTokens(): Promise<TokenData | null> {
  try {
    if (await secretsAvailable()) {
      const json = await Bun.secrets.get(KEYRING_SERVICE, KEYRING_NAME);
      if (json) {
        const data: unknown = JSON.parse(json);
        if (isTokenData(data)) return data;
      }
    }
  } catch {
    // Fall through to file fallback
  }

  // Fallback: plaintext JSON file
  if (!existsSync(FALLBACK_FILE)) return null;
  try {
    const raw = Bun.file(FALLBACK_FILE);
    const data: unknown = await raw.json();
    if (isTokenData(data)) return data;
    return null;
  } catch {
    return null;
  }
}

export async function deleteTokens(): Promise<void> {
  try {
    await Bun.secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_NAME });
  } catch {
    // Bun.secrets unavailable
  }

  if (existsSync(FALLBACK_FILE)) {
    unlinkSync(FALLBACK_FILE);
  }
}
