/** MCP server for robinhood-for-agents. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../version.js";
import type { Mode } from "./mode.js";
import { createOfficialCredentialStore, type OfficialCredentialStore } from "./official/auth.js";
import { liveUpstream, registerOfficialTools, type Upstream } from "./official/forward.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerMarketTools } from "./tools/markets.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerPnlTools } from "./tools/pnl.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerReviewTools } from "./tools/review.js";
import { registerScannerTools } from "./tools/scanners.js";
import { registerStockTools } from "./tools/stocks.js";
import { registerTaxLotTools } from "./tools/tax-lots.js";
import { registerWatchlistTools } from "./tools/watchlists.js";

const INSTRUCTIONS: Record<Mode, string> = {
  standard:
    "Standard mode: every tool is relayed to Robinhood's hosted MCP under the official credential; sign in with robinhood_official_login.",
  web: "Web mode: Robinhood's web API under a Chrome browser session; sign in with robinhood_browser_login.",
};

export function createServer(
  opts: { mode?: Mode; upstream?: Upstream; officialStore?: OfficialCredentialStore } = {},
): McpServer {
  const mode = opts.mode ?? "standard";
  const server = new McpServer(
    { name: "robinhood-for-agents", version: VERSION },
    { instructions: INSTRUCTIONS[mode] },
  );

  if (mode === "standard") {
    const store = opts.officialStore ?? createOfficialCredentialStore();
    registerOfficialTools(server, opts.upstream ?? liveUpstream(store), store);
    return server;
  }

  registerAuthTools(server);
  registerPortfolioTools(server);
  registerStockTools(server);
  registerOptionsTools(server);
  registerCryptoTools(server);
  registerOrderTools(server);
  registerMarketTools(server);
  registerWatchlistTools(server);
  registerScannerTools(server);
  registerPnlTools(server);
  registerReviewTools(server);
  registerTaxLotTools(server);
  return server;
}
