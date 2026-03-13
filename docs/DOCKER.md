# Docker (OpenClaw, etc.)

**TL;DR** — Tokens stay on the host. The container connects through an auth proxy. No tokens, keys, or credentials inside the container.

---

## The constraint

| Where | Keychain? |
|-------|-----------|
| **Host (Mac/Linux)** | Yes. Login + tokens live here. |
| **Container** | No. Different OS; no API to your host keychain. |

OpenClaw and other agents running in Docker execute skill code via `bun` directly — calling `getClient()` → `restoreSession()` → `loadTokens()`. The client library needs to reach the Robinhood API with valid auth.

**The wrong approach**: mounting token files or passing tokens as env vars. A rogue agent can read either in one command. See [SECURITY.md](./SECURITY.md) for detailed attack scenarios.

**The right approach**: an auth proxy on the host that holds the tokens and injects auth headers. The container only knows the proxy URL.

---

## How the auth proxy works

```
┌─── Host ──────────────────────┐    ┌─── Container ──────────────┐
│                               │    │                            │
│ Keychain: has tokens          │    │ Keychain: empty            │
│ Proxy: listens on :3100      │◄───│ Client: talks to proxy     │
│                               │    │                            │
│ Proxy receives request        │    │ No tokens on filesystem    │
│ → adds Bearer header          │    │ No keys in env vars        │
│ → forwards to Robinhood API   │    │ Only env: PROXY URL        │
│ → returns response            │    │                            │
└───────────────────────────────┘    └────────────────────────────┘
```

The proxy:
- Loads tokens from the host keychain via `Bun.secrets`
- Forwards API requests to `api.robinhood.com` with the Bearer header injected
- Handles token refresh transparently
- Never exposes raw tokens in responses
- Provides rate limiting, operation allowlisting, and audit logging

---

## Setup (3 steps)

### 1. Login on the host

```bash
bunx robinhood-for-agents login
```

### 2. Start the auth proxy

```bash
bunx robinhood-for-agents proxy --port 3100
```

The proxy runs on the host and listens for requests from the container.

### 3. Configure your container

Set one env var in your Docker Compose or `docker run`:

```yaml
# docker-compose.yml
services:
  openclaw-gateway:
    image: your-gateway-image
    environment:
      ROBINHOOD_API_PROXY: "http://host.docker.internal:3100"
```

Or with `docker run`:

```bash
docker run -e ROBINHOOD_API_PROXY=http://host.docker.internal:3100 your-gateway-image
```

The client library detects `ROBINHOOD_API_PROXY` and routes all Robinhood API calls through the proxy instead of calling `api.robinhood.com` directly.

---

## What the container sees

```bash
# Inside the container:
$ env | grep ROBINHOOD
ROBINHOOD_API_PROXY=http://host.docker.internal:3100
# That's it. No tokens. No keys.

$ find / -name "*.json" -exec grep -l "access_token" {} \;
# (nothing)
```

---

## Stopping access

Kill the proxy on the host → the container immediately loses all Robinhood API access. No tokens to revoke, no files to delete.

---

## Why not token files?

Mounting a token file (plaintext or encrypted) into the container means a rogue agent or prompt injection can exfiltrate the credentials in one command:

```bash
$ cat /secrets/robinhood-tokens.json   # plaintext: instant theft
$ env | grep ENCRYPTION_KEY            # encrypted: key is right here
```

The auth proxy avoids this entirely — there's nothing to steal. See [SECURITY.md](./SECURITY.md) for the full threat model.
