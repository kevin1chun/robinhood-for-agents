/**
 * Token storage using OS keychain via Bun.secrets.
 *
 * Tokens are stored as JSON directly in the OS keychain
 * (macOS Keychain Services, Linux libsecret, Windows Credential Manager).
 *
 * Bun.secrets is required — no plaintext fallback.
 */

const KEYRING_SERVICE = "robinhood-for-agents";
const KEYRING_NAME = "session-tokens";

export interface TokenData {
  access_token: string;
  refresh_token: string;
  token_type: string;
  device_token: string;
  account_hint?: string;
  saved_at: number;
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
  await Bun.secrets.set(KEYRING_SERVICE, KEYRING_NAME, json);
  return "keychain";
}

export async function loadTokens(): Promise<TokenData | null> {
  try {
    const json = await Bun.secrets.get(KEYRING_SERVICE, KEYRING_NAME);
    if (json) {
      const data: unknown = JSON.parse(json);
      if (isTokenData(data)) return data;
    }
  } catch {
    // Bun.secrets unavailable or keychain access denied
  }
  return null;
}

export async function deleteTokens(): Promise<void> {
  try {
    await Bun.secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_NAME });
  } catch {
    // Bun.secrets unavailable
  }
}
