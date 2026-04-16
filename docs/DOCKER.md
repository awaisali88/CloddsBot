# Running Clodds in Docker

Clodds ships a single image that runs in three modes — pick one per service:

| Mode        | Command                            | Purpose                              |
|-------------|------------------------------------|--------------------------------------|
| `gateway`   | `node dist/index.js`               | Full bot + webchat on port **18789** |
| `mcp-http`  | `node dist/bin/mcp-http.js`        | Bearer-auth MCP HTTP on **18790**    |
| `mcp-stdio` | `node dist/bin/mcp-stdio.js`       | Local stdio MCP (no network)         |

The image is multi-stage on `node:22-bookworm-slim`, runs as non-root, exposes
18789 + 18790, and ships with the embeddings model pre-cached so skills start
cold-fast.

---

## Local development

### 1. One-time setup

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (required) and any venue API keys you want live.
# For mcp-http generate a bearer token:
openssl rand -base64 48   # paste as CLODDS_MCP_TOKEN
```

### 2. Build once

```bash
docker compose build gateway
```

Only the `gateway` service owns the build context — `mcp-http` and
`mcp-stdio` reuse the same `clodds:latest` image, so one build serves all
three modes (and avoids a BuildKit parallel-export collision).

### 3. Run a mode

```bash
docker compose up gateway       # bot + webchat
# — or —
docker compose up mcp-http      # HTTP MCP on :18790
# — or —
docker compose run --rm -i mcp-stdio   # wire directly into an MCP client
```

### 4. Verify

```bash
# Gateway health
curl -fsS http://localhost:18789/health

# MCP HTTP health (public, no auth)
curl -fsS http://localhost:18790/health

# MCP HTTP tools/list (auth required)
curl -fsS http://localhost:18790/mcp \
  -H "Authorization: Bearer $CLODDS_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

You should see `100+` tools. If the count is lower, check `CLODDS_MCP_TOOL_PROFILE`
— `read-only` filters heavily.

---

## Deploy to Railway

The repo's `railway.toml` configures the MCP HTTP transport as the default
entrypoint.

### 1. Create the service

```bash
railway login
railway init
railway link   # if you have an existing project
```

### 2. Set required env vars

```bash
railway variables set CLODDS_MCP_TOKEN="$(openssl rand -base64 48)"
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set CLODDS_MCP_TOOL_PROFILE=read-only   # START SAFE
# Add venue keys only when you're ready to enable trading profiles.
```

### 3. Deploy

```bash
railway up
```

Railway runs the health check against `/health`; wait for green within ~60s.
Then `railway domain` gives you the public URL. Plug it into any MCP client
(see [`MCP-CLIENTS.md`](./MCP-CLIENTS.md)).

### 4. Rotate the token (any time)

```bash
railway variables set CLODDS_MCP_TOKEN="$(openssl rand -base64 48)"
railway restart
# Update the token in every client config that talks to this deploy.
```

---

## Security notes

- **Never commit `.env`.** Compose reads it at runtime; the image doesn't bake secrets.
- **Default `CLODDS_MCP_TOOL_PROFILE` for public deploys is `read-only`.** Trading profiles (`trading-cex`, `trading-dex-solana`, `prediction-markets`, `full`) expose order-placing tools and should only be enabled on private deployments with a unique bearer token per client.
- **Bearer-token comparison is `timingSafeEqual`.** The token itself is never logged — pino redacts `authorization` from request logs.
- **Rate limit is per-IP at the HTTP edge (60/min default)** plus per-client at the skill layer. Raise only if you know why.

## Troubleshooting

| Symptom                                  | Fix                                                                 |
|------------------------------------------|---------------------------------------------------------------------|
| `CLODDS_MCP_TOKEN is not configured`     | Set the env var in `.env` or Railway variables, then restart.       |
| Health check fails on Railway            | Make sure the service is `mcp-http` mode and port matches `$PORT`.  |
| `better-sqlite3` build error             | The image installs `build-essential`+`python3` in the builder only; if you see this locally, rebuild with `docker compose build --no-cache`. |
| Tools list returns `0`                   | Your `CLODDS_MCP_TOOL_PROFILE` or allowlist is filtering everything. Set to `full` temporarily to confirm. |
| `401 Invalid bearer token`               | Client token doesn't match `CLODDS_MCP_TOKEN`. Regenerate + redeploy. |
