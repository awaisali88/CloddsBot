# Connecting Clodds to Claude Desktop & Claude Code

Step-by-step guide for wiring the Clodds MCP server into Claude Desktop and
Claude Code — both locally and against a Railway deployment.

By the end you'll be able to ask Claude things like *"what's my Binance spot
balance"* or *"get a Jupiter quote from SOL to USDC for 1 SOL"* and Claude
will call the Clodds skill directly.

---

## 0. Prerequisites

- **Docker Desktop** (or Docker Engine + Compose v2) installed and running.
- **Node.js 22+** locally (only needed for `mcp-remote` — the bridge Claude
  uses to talk to HTTP MCP servers).
- A populated `.env` in the repo root with at minimum `ANTHROPIC_API_KEY`.
- For HTTP/Railway: a bearer token. Generate one with:
  ```bash
  openssl rand -base64 48
  ```
  Keep it safe — it's effectively a password.

---

## Part 1 — Local stdio (simplest, no network)

This runs Clodds directly as a child process of the client. No port, no token,
no Docker required if you have Node installed locally.

### 1.1. Build Clodds once

```bash
git clone https://github.com/awaisali88/CloddsBot.git
cd CloddsBot
cp .env.example .env
# Edit .env — paste ANTHROPIC_API_KEY and any venue keys you want live
npm install
npm run build
```

After this, `dist/bin/mcp-stdio.js` is the entrypoint clients will launch.

### 1.2a. Claude Desktop (local stdio)

Open the config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add (or merge into) the `mcpServers` section:

```json
{
  "mcpServers": {
    "clodds": {
      "command": "node",
      "args": ["D:\\Work\\UraanAI\\trading\\CloddsBot\\dist\\bin\\mcp-stdio.js"]
    }
  }
}
```

> Replace the path with your actual absolute path. On macOS/Linux use forward
> slashes (`/Users/you/CloddsBot/dist/bin/mcp-stdio.js`).

**Fully quit Claude Desktop** (Cmd/Ctrl+Q — closing the window isn't enough)
and reopen it. Click the 🔌 icon at the bottom of the composer to confirm
`clodds` is listed with a green dot.

### 1.2b. Claude Code (local stdio)

Easiest — one command:

```bash
claude mcp add clodds node D:/Work/UraanAI/trading/CloddsBot/dist/bin/mcp-stdio.js
```

Verify:

```bash
claude mcp list
# should show "clodds" with status "connected"
```

Or manually edit `~/.claude.json` (global) or `.claude.json` (project):

```json
{
  "mcpServers": {
    "clodds": {
      "command": "node",
      "args": ["D:/Work/UraanAI/trading/CloddsBot/dist/bin/mcp-stdio.js"]
    }
  }
}
```

### 1.3. Smoke test

Ask Claude: *"what's my Binance spot balance?"* — you should see it call
`clodds_binance_spot_balance` and return real numbers (assuming Binance
keys are in `.env`).

---

## Part 2 — Local HTTP (Docker, bearer-auth)

Run the MCP server as a long-lived HTTP service on `localhost:18790`. Useful
if you want multiple clients (Desktop + Code + Cursor) to share one server,
or if you want to mimic the Railway setup locally.

### 2.1. Generate a token and add to `.env`

```bash
echo "CLODDS_MCP_TOKEN=$(openssl rand -base64 48)" >> .env
# Optional (safer default):
echo "CLODDS_MCP_TOOL_PROFILE=read-only" >> .env
```

### 2.2. Build and start the HTTP server

```bash
docker compose build gateway          # builds the shared image once
docker compose up mcp-http            # starts HTTP MCP on :18790
```

Leave that terminal running. In another terminal, verify:

```bash
curl -fsS http://localhost:18790/health
# -> {"status":"ok","version":"dev","tools":183,"profile":"full"}

# Load your token into the shell:
source .env && export CLODDS_MCP_TOKEN

curl -sS http://localhost:18790/mcp \
  -H "Authorization: Bearer $CLODDS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | head -c 400
```

### 2.3a. Claude Desktop (local HTTP)

Claude Desktop doesn't speak HTTP natively — we use `mcp-remote` as a bridge.

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clodds-http": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:18790/mcp",
        "--header",
        "Authorization: Bearer PASTE_TOKEN_HERE"
      ]
    }
  }
}
```

Paste the exact token from your `.env`. Fully quit and reopen Claude Desktop.

### 2.3b. Claude Code (local HTTP)

```bash
claude mcp add clodds-http -- npx -y mcp-remote http://localhost:18790/mcp \
  --header "Authorization: Bearer PASTE_TOKEN_HERE"
```

Verify: `claude mcp list` → `clodds-http` connected.

### 2.4. Smoke test

Same as Part 1.3 — ask Claude a trading question and watch it call the
`clodds_*` tool.

---

## Part 3 — Railway deployment (remote HTTP)

Deploy the MCP HTTP server to Railway so you (or your team) can reach it
from anywhere.

### 3.1. Prepare Railway

```bash
npm install -g @railway/cli
railway login
```

From the repo root:

```bash
railway init           # pick a project name
# or: railway link     # to attach to an existing project
```

### 3.2. Set required env vars

```bash
# Bearer token — generate fresh, never reuse local tokens in prod
railway variables --set CLODDS_MCP_TOKEN="$(openssl rand -base64 48)"

# Required for the skill layer
railway variables --set ANTHROPIC_API_KEY="sk-ant-..."

# STRONGLY RECOMMENDED: start with read-only for public deploys
railway variables --set CLODDS_MCP_TOOL_PROFILE=read-only

# Add venue keys ONLY when you're ready to enable a trading profile
# railway variables --set BINANCE_API_KEY="..."
# railway variables --set BINANCE_API_SECRET="..."
```

### 3.3. Deploy

```bash
railway up
```

The `railway.toml` in the repo root configures:

- Builder: `Dockerfile`
- Start command: `node dist/bin/mcp-http.js`
- Health check path: `/health`
- Restart policy: `ON_FAILURE`

Wait for the health check to turn green (≈ 60s after deploy).

### 3.4. Get the public URL

```bash
railway domain       # creates a railway.app subdomain if you don't have one
# -> https://clodds-mcp-production.up.railway.app
```

Save the token and URL — you'll paste them into client configs.

### 3.5. Smoke-test from your laptop

```bash
URL=https://YOUR-APP.up.railway.app
TOKEN=the-token-you-set-on-railway

curl -fsS $URL/health
curl -sS $URL/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

### 3.6a. Claude Desktop (Railway HTTP)

```json
{
  "mcpServers": {
    "clodds-prod": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://YOUR-APP.up.railway.app/mcp",
        "--header",
        "Authorization: Bearer PASTE_TOKEN_HERE"
      ]
    }
  }
}
```

Fully quit and reopen Claude Desktop.

### 3.6b. Claude Code (Railway HTTP)

```bash
claude mcp add clodds-prod -- npx -y mcp-remote https://YOUR-APP.up.railway.app/mcp \
  --header "Authorization: Bearer PASTE_TOKEN_HERE"
```

### 3.7. Rotating the token

Any time you want to invalidate old clients:

```bash
railway variables --set CLODDS_MCP_TOKEN="$(openssl rand -base64 48)"
railway redeploy
```

Then update the token in every client config that still needs access.

---

## Tool profiles — which tools get exposed

Set `CLODDS_MCP_TOOL_PROFILE` locally in `.env` or on Railway via
`railway variables --set`. All clients see the filtered list.

| Profile               | Exposes                                                     |
|-----------------------|-------------------------------------------------------------|
| `read-only` *(safe default for public deploys)* | Balances, positions, prices, orderbooks, history — **no order placement**. |
| `trading-cex`         | Binance / Bybit / MEXC / Hyperliquid spot + futures orders. |
| `trading-dex-solana`  | Jupiter, Raydium, Orca, Pump.fun, Drift.                    |
| `prediction-markets`  | Polymarket, Kalshi, Manifold, Metaculus.                    |
| `defi`                | MarginFi, Solend, Kamino, bridges.                          |
| `full`                | Everything — local/trusted deploys only.                    |

---

## Troubleshooting

| Symptom                                       | Fix                                                                                     |
|-----------------------------------------------|-----------------------------------------------------------------------------------------|
| Claude Desktop shows no MCP servers           | Fully quit (Cmd/Ctrl+Q) and reopen; closing the window doesn't reload config.           |
| `clodds` shows red dot in Claude Desktop      | Check the path in `args` is absolute and `dist/bin/mcp-stdio.js` exists (`npm run build`). |
| `401 Invalid bearer token`                    | Token in client config doesn't match `CLODDS_MCP_TOKEN`. Regenerate + redeploy.         |
| `CLODDS_MCP_TOKEN is not configured` (500)    | Env var missing on the server side. Set it, restart.                                    |
| `tools/list` returns 0 tools                  | `CLODDS_MCP_TOOL_PROFILE` or allowlist is filtering everything. Set to `full` to confirm. |
| Railway health check never goes green         | Check `railway logs` — usually a missing env var or a port mismatch.                    |
| `mcp-remote` keeps reconnecting               | Token mismatch, or firewall blocking SSE — try `curl /health` from the same machine.    |
| `EADDRINUSE 18790`                            | Another Clodds instance is already running. `docker compose down` or change port.       |
| `claude mcp list` shows "failed to connect"   | Run the `command` + `args` manually in a shell and read stderr for the real error.      |

---

## Security notes

- **Treat `CLODDS_MCP_TOKEN` as a password.** It grants full access to every
  exposed tool, including order placement if a trading profile is active.
- **Use `read-only` by default on public Railway deploys.** Only switch to a
  trading profile on a private deployment with a dedicated bearer token.
- **Never commit `.env` or tokens.** `.dockerignore` already excludes `.env`
  from the image.
- **Rotate the token** whenever it's been pasted into a context you don't
  fully control (shared screen, copy-paste into chat, etc.).
- **Rate limit:** the HTTP transport rate-limits per-IP (default 60 req/min,
  override via `CLODDS_MCP_IP_RATE_LIMIT`).
