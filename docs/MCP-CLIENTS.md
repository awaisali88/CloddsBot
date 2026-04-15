# Clodds as an MCP Server — Client Setup

Clodds exposes every skill as an MCP tool. Connect from any MCP client to
query market data, manage positions, or place trades through Claude.

There are two transports:

- **stdio** — local process over a pipe. Simplest, no token needed.
- **HTTP** — bearer-auth'd JSON-RPC over HTTP, great for remote/Railway deploys.
  Connect via `mcp-remote` which bridges stdio ⇄ HTTP on the client side.

---

## Generate a token (HTTP only)

```bash
openssl rand -base64 48
```

Paste into `.env` as `CLODDS_MCP_TOKEN` and into every client config below.
**Never commit the token.** Rotate if exposed.

---

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

### Local stdio (via Docker)

```json
{
  "mcpServers": {
    "clodds": {
      "command": "docker",
      "args": ["compose", "run", "--rm", "-i", "mcp-stdio"],
      "cwd": "/path/to/CloddsBot"
    }
  }
}
```

### Local stdio (native, no Docker)

```json
{
  "mcpServers": {
    "clodds": {
      "command": "node",
      "args": ["/path/to/CloddsBot/dist/bin/mcp-stdio.js"]
    }
  }
}
```

### Remote HTTP (local or Railway)

```json
{
  "mcpServers": {
    "clodds": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://YOUR-RAILWAY-APP.up.railway.app/mcp",
        "--header",
        "Authorization: Bearer PASTE_TOKEN_HERE"
      ]
    }
  }
}
```

**Smoke test:** ask *"What's my Binance spot balance?"* — Claude should call
`clodds_binance_spot_balance` and return real numbers.

---

## Claude Code (CLI)

Add to `~/.claude.json` (or the project-scoped `.claude.json`):

```json
{
  "mcpServers": {
    "clodds": {
      "command": "node",
      "args": ["/path/to/CloddsBot/dist/bin/mcp-stdio.js"]
    }
  }
}
```

Or use the one-line installer:

```bash
claude mcp add clodds node /path/to/CloddsBot/dist/bin/mcp-stdio.js
```

For remote HTTP, swap in the `mcp-remote` invocation shown for Claude Desktop.

**Smoke test:** `claude "show my portfolio summary"` — should call
`clodds_portfolio_summary`.

---

## Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clodds": {
      "command": "node",
      "args": ["/path/to/CloddsBot/dist/bin/mcp-stdio.js"]
    }
  }
}
```

Remote HTTP uses the same `mcp-remote` pattern as Claude Desktop.

**Smoke test:** ask Cursor *"get a Jupiter quote from SOL to USDC for 1 SOL"*
— should call `clodds_jupiter_quote`.

---

## Zed

Edit `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "clodds": {
      "command": {
        "path": "node",
        "args": ["/path/to/CloddsBot/dist/bin/mcp-stdio.js"]
      }
    }
  }
}
```

**Smoke test:** in a Zed assistant panel, ask *"list open Polymarket markets
about the 2028 election"* — should call `clodds_polymarket_markets`.

---

## Tool profiles

The `CLODDS_MCP_TOOL_PROFILE` env var controls which tools appear. All clients
see the filtered list — there is no client-side override.

| Profile                | Exposes                                                           |
|------------------------|-------------------------------------------------------------------|
| `read-only` *(safe default for public)* | Balances, positions, prices, orderbooks, history.       |
| `trading-cex`          | Binance / Bybit / MEXC / Hyperliquid spot + futures orders.      |
| `trading-dex-solana`   | Jupiter, Raydium, Orca, Pump.fun, Drift.                         |
| `prediction-markets`   | Polymarket, Kalshi, Manifold, Metaculus.                         |
| `defi`                 | MarginFi, Solend, Kamino, bridges.                               |
| `full`                 | Everything — local/trusted deploys only.                         |

---

## Verifying the connection

Every transport supports tools/list. The fastest way to confirm Clodds is
wired up is:

```bash
# HTTP (from your shell)
curl -s http://localhost:18790/mcp \
  -H "Authorization: Bearer $CLODDS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name' | head

# stdio (uses the official MCP inspector)
npx @modelcontextprotocol/inspector node dist/bin/mcp-stdio.js
```

You should see `clodds_binance_spot_balance`, `clodds_jupiter_swap`, etc.
plus a generic `clodds_<skill>` tool for every other bundled skill.
