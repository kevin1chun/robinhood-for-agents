/** MCP server for rh-agent-tools. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerCryptoTools } from "./tools/crypto.js";
import { registerMarketTools } from "./tools/markets.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import { registerStockTools } from "./tools/stocks.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "rh-agent-tools",
    version: "0.3.0",
  });

  registerAuthTools(server);
  registerPortfolioTools(server);
  registerStockTools(server);
  registerOptionsTools(server);
  registerCryptoTools(server);
  registerOrderTools(server);
  registerMarketTools(server);

  return server;
}
