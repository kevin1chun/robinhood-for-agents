# rh-agent-tools

AI-native Robinhood trading interface — TypeScript monorepo with a standalone API client and MCP server.

## Project Structure
- `packages/client/` — `@rh-agent-tools/client`: Standalone Robinhood API client
- `packages/server/` — `rh-agent-tools`: MCP server with 18 tools
- `.claude/skills/` — Claude Code skills for interactive use (SKILL.md only, no scripts)
- `docs/` — Architecture, access controls, use cases, contributing

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESM-only)
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.12+ (McpServer + StdioServerTransport)
- **Validation**: Zod v3.24 (API responses + MCP tool schemas)
- **Testing**: Vitest (not `bun test` — module isolation matters)
- **Linting**: Biome v2
- **Browser Auth**: playwright-core (browser auth)

## Running the MCP Server
```bash
bun install
bun packages/server/bin/rh-agent-tools.ts
```

## Development
```bash
bun run typecheck   # tsc --noEmit on both packages
bun run check       # biome lint + format
npx vitest run      # all tests (use vitest, NOT bun test)
```

## Skills
Canonical skill source is `packages/server/skills/`. Local `.claude/skills/` contains symlinks for development.

Install MCP server + skills: `bun packages/server/bin/rh-agent-tools.ts install`

Skills use three-layer progressive disclosure:
1. **SKILL.md** — MCP tool orchestration (default)
2. **reference.md** — MCP tool API details (loaded on demand)
3. **client-api.md** — TypeScript client library patterns (advanced, loaded on demand)

Available skills:
- `robinhood-setup` - Initial auth setup
- `robinhood-portfolio` - Portfolio and holdings
- `robinhood-research` - Stock research and analysis
- `robinhood-trade` - Order placement with safety checks
- `robinhood-options` - Options chain analysis

## Client Patterns
```typescript
import { RobinhoodClient, getClient } from "@rh-agent-tools/client";

// Class-based
const client = new RobinhoodClient();
await client.restoreSession();
const quotes = await client.getQuotes("AAPL");

// Singleton
const rh = getClient();
await rh.restoreSession();
```
- All methods are `async` (native `fetch` under the hood)
- Multi-account is first-class: every account-scoped method accepts `accountNumber`
- Session cached to `~/.rh-agent-tools/session.enc` (AES-256-GCM, key in OS keychain)
- Proper exceptions: `AuthenticationError`, `APIError`
- **Do NOT use `phoenix.robinhood.com`** — it rejects TLS. Use `api.robinhood.com` endpoints only.

## Safety Rules
- **NEVER** place bulk cancel operations
- **NEVER** call fund transfer functions
- **ALWAYS** confirm with user before placing any order
- Order tools require explicit parameters - no defaults that could cause accidental trades

## Testing
```bash
npx vitest run
```
Tests use `vi.mock()` to mock HTTP layer — no real API calls. Use `vitest` (not `bun test`) for correct module isolation.
