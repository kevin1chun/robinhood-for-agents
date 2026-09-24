import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import { loadTokens } from "../../client/token-store.js";

export async function login(opts: { exportTokens: boolean }): Promise<void> {
  p.intro("robinhood-for-agents login (web mode)");

  let existingTokens: Awaited<ReturnType<typeof loadTokens>> | null = null;
  try {
    existingTokens = await loadTokens();
  } catch {
    // Corrupted file, keychain failure, etc. — fall through to login
  }
  let skipLogin = false;
  if (existingTokens) {
    const reuse = await p.confirm({
      message: "Existing Robinhood session found. Skip login?",
      initialValue: true,
    });
    skipLogin = !p.isCancel(reuse) && reuse;
  }

  if (!skipLogin) {
    const spinner = p.spinner();
    spinner.start("Chrome will open to robinhood.com/login. Waiting for login...");
    try {
      const { browserLogin } = await import("../browser-auth.js");
      const result = await browserLogin();
      spinner.stop(`Logged in${result.account_hint ? ` (account ${result.account_hint})` : ""}.`);
    } catch (err) {
      spinner.stop("Login failed.");
      p.log.error(err instanceof Error ? err.message : "Unknown error during login");
      process.exit(1);
    }
  }

  if (opts.exportTokens) await exportEncryptedTokens();
  p.outro("Done.");
}

/** Copy text to the OS clipboard. Throws if clipboard is unavailable. */
function copyToClipboard(text: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execSync("pbcopy", { input: text, stdio: ["pipe", "pipe", "pipe"] });
  } else if (platform === "linux") {
    try {
      execSync("xclip -selection clipboard", { input: text, stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      execSync("xsel --clipboard --input", { input: text, stdio: ["pipe", "pipe", "pipe"] });
    }
  } else {
    throw new Error(`Clipboard not supported on platform: ${platform}`);
  }
}

async function exportEncryptedTokens(): Promise<void> {
  const { EncryptedFileTokenStore, createTokenStore } = await import("../../client/token-store.js");

  const spinner = p.spinner();
  spinner.start("Encrypting tokens...");

  // Read from whichever store is actually active (keychain, or an existing
  // ROBINHOOD_TOKENS_FILE) rather than assuming keychain — a session logged
  // in while file-store mode was configured never touches the keychain.
  const tokens = await createTokenStore().load();
  if (!tokens) {
    spinner.stop("No tokens found in the active token store.");
    return;
  }

  const outputPath = "./tokens.enc";
  const store = new EncryptedFileTokenStore(outputPath);
  await store.save(tokens);

  let encKey = process.env.ROBINHOOD_TOKEN_KEY?.trim() ?? "";
  if (!encKey) {
    try {
      encKey = (await Bun.secrets.get("robinhood-for-agents", "encryption-key")) ?? "";
    } catch {
      // Keychain unavailable
    }
  }

  if (!encKey) {
    spinner.stop("Error: Could not retrieve encryption key.");
    process.exit(1);
  }

  // Copy key to clipboard instead of printing it
  try {
    copyToClipboard(encKey);
  } catch {
    spinner.stop("Error: Cannot copy encryption key to clipboard.");
    p.log.error("Install pbcopy (macOS) or xclip/xsel (Linux) and retry.");
    process.exit(1);
  }

  spinner.stop(`Tokens encrypted to ${outputPath}`);

  p.log.success("Encryption key copied to clipboard. Paste it into your Docker config.");

  p.log.step("Set these env vars in your container:");
  p.log.message(
    "  ROBINHOOD_MODE=web\n  ROBINHOOD_TOKENS_FILE=/app/tokens.enc\n  ROBINHOOD_TOKEN_KEY=<paste from clipboard>",
  );

  p.log.step("docker-compose.yml example:");
  p.log.message(
    '  services:\n    agent:\n      volumes:\n        - ./tokens.enc:/app/tokens.enc:rw\n      environment:\n        ROBINHOOD_MODE: "web"\n        ROBINHOOD_TOKENS_FILE: "/app/tokens.enc"\n        ROBINHOOD_TOKEN_KEY: "<paste from clipboard>"',
  );

  p.log.warn(
    "Security: Only run agents you trust. A rogue agent with shell access can read the\nenv var and decrypt the tokens. See docs/SECURITY.md for details.",
  );
}
