/**
 * Rewrites docs/official-mcp-tools.json with Robinhood's hosted MCP `tools/list` result, every
 * field as sent, sorted by name. Needs the agent-mode credential (`robinhood_official_login`) and
 * ROBINHOOD_TOKEN_KEY.
 *
 *   bun run refresh-official-tools
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createOfficialCredentialStore } from "../src/server/official/auth.js";
import { liveUpstream } from "../src/server/official/forward.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    "usage: bun run refresh-official-tools\n  Rewrites docs/official-mcp-tools.json from agent.robinhood.com's tools/list under the robinhood_official_login credential.",
  );
  process.exit(0);
}

// listTools() parses through the SDK's Tool schema, which drops fields it does not know.
const Page = z.object({
  tools: z.array(z.looseObject({ name: z.string() })),
  nextCursor: z.string().optional(),
});

const client = await liveUpstream(createOfficialCredentialStore()).connect();
const tools: Array<{ name: string }> = [];
let cursor: string | undefined;
do {
  const page = await client.request(
    { method: "tools/list", params: cursor ? { cursor } : {} },
    Page,
  );
  tools.push(...page.tools);
  cursor = page.nextCursor;
} while (cursor);
await client.close();

tools.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const path = fileURLToPath(new URL("../docs/official-mcp-tools.json", import.meta.url));
writeFileSync(path, `${JSON.stringify(tools, null, 2)}\n`);
console.log(`${tools.length} tools -> ${path}`);
