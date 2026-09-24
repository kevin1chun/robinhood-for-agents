#!/usr/bin/env bun
export {};

const args = process.argv.slice(2);

if (args[0] === "install") {
  const { install } = await import("../src/server/cli/install.js");
  await install({ yes: args.includes("-y") || args.includes("--yes") });
} else if (args[0] === "login") {
  const { login } = await import("../src/server/cli/login.js");
  await login({ exportTokens: args.includes("--export") });
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`robinhood-for-agents — AI-native Robinhood trading interface

Usage:
  robinhood-for-agents [--mode standard|web]   Start the MCP server (default standard; or ROBINHOOD_MODE)
  robinhood-for-agents install [-y]            Register the MCP server and install the skill in your agent apps
  robinhood-for-agents login [--export]        Web-mode Chrome login; --export also writes ./tokens.enc for Docker
  robinhood-for-agents --help                  Show this help message`);
} else {
  const { resolveMode } = await import("../src/server/mode.js");
  let mode: import("../src/server/mode.js").Mode;
  try {
    mode = resolveMode(args);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
  const { main } = await import("../src/server/index.js");
  await main(mode);
}
