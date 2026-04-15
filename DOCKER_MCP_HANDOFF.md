# Task: Dockerize Clodds + add HTTP/SSE MCP transport for Railway deployment

> Paste this entire document into a new Claude Code session opened in `D:\Work\UraanAI\trading\CloddsBot`. It is self-contained — all context, files, reuse points, and verification steps are included.

---

## Context

Clodds is a 170k-LoC TypeScript trading bot (Binance spot/futures, Solana DEX, Pump.fun, Polymarket, Kalshi, etc.) at `D:\Work\UraanAI\trading\CloddsBot`. The repo is on GitHub at https://github.com/awaisali88/CloddsBot on the `main` branch. Recent commits shipped spot trading and a `solana_balance` tool.

An existing plan file at `C:\Users\awais\.claude\plans\squishy-baking-twilight.md` covers earlier work (security audit, spot-bug fix, MCP enhancement roadmap). **Read it first** — especially the "Follow-up plan: Expose Clodds as an MCP toolkit" section which outlines per-skill JSON schemas, tool profiles, and the installer.

Existing MCP server at `src/mcp/server.ts` works over stdio and exports all 119 skills as tools named `clodds_<skill>` with a generic `{args: string}` schema. `src/bin/worker.ts` is the entrypoint.

---

## Goal

Make Clodds runnable as a Docker container in three modes, deployable to Railway, and connectable from Claude Desktop + Claude Code + Cursor as an MCP server that exposes **every** trading, analysis, and market-data command with proper per-tool JSON schemas.

**Three run modes in the same image:**

1. `gateway` — current bot (webchat on port 18789) — `node dist/index.js`
2. `mcp-stdio` — existing stdio MCP — `node dist/bin/worker.js`
3. `mcp-http` — **NEW** HTTP/SSE MCP transport on port 18790 — `node dist/mcp/http-server.js`

---

## Deliverables

### New files

1. **`Dockerfile`** — multi-stage:
   - Build stage on `node:20-slim` — `npm ci`, `npm run build`, keep postinstall's embeddings-cache step
   - Runtime stage on `node:20-slim` — copy `dist/` + `node_modules` (prod only), non-root user, default `CMD` to gateway
   - Install `build-essential` + `python3` only in build stage (better-sqlite3 native build)
   - Expose 18789 (gateway) and 18790 (mcp-http)
   - Healthcheck: `curl -f http://localhost:18789/health || exit 1` for gateway mode

2. **`.dockerignore`** — exclude `.env`, `node_modules`, `dist`, `tests`, `docs`, `.git`, `*.log`

3. **`docker-compose.yml`** — three services:
   - `gateway` — default profile, depends on nothing
   - `mcp-stdio` — `stdin_open: true`, `tty: true`, no ports
   - `mcp-http` — port 18790, requires `CLODDS_MCP_TOKEN` env
   - All services share `env_file: .env` and volume `./data:/home/node/.clodds`

4. **`railway.toml`:**
   - `[build]` using Dockerfile
   - `[deploy]` `startCommand = "node dist/mcp/http-server.js"`
   - `[deploy.healthcheckPath] = "/health"`
   - `[[deploy.envs]]` listing required vars with descriptions

5. **`src/mcp/http-server.ts`** (~200 lines):
   - Reuse existing Express setup from `src/gateway/server.ts` for middleware style
   - Mount MCP SSE transport at `/mcp` using `@modelcontextprotocol/sdk` (already in package.json) — transport type `SSEServerTransport`
   - Health endpoint `GET /health` returns `{status: "ok", version, tools: N}`
   - Listen on `process.env.CLODDS_MCP_PORT || 18790`

6. **`src/mcp/auth.ts`** (~50 lines):
   - Express middleware
   - Read `Authorization: Bearer <token>` header or `?token=` query param
   - Compare to `process.env.CLODDS_MCP_TOKEN` using `crypto.timingSafeEqual`
   - 401 on mismatch, 500 on missing env
   - Never log the token (redact from Pino if used)

7. **`src/mcp/schemas.ts`** (~150 lines):
   - Import skill manifest from `src/skills/executor.ts` (which needs to export structured subcommand data — see modifications)
   - For each skill, walk its `subcommands` array and produce JSON Schemas keyed by `clodds_<skill>_<subcommand>`
   - Fallback: if a skill has no structured subcommands, keep the existing `clodds_<skill>(args: string)` tool
   - Export `buildMcpTools(): McpTool[]` for use by both stdio and http servers

8. **`src/mcp/profiles.ts`** (~80 lines):
   - Profile definitions: `read-only`, `trading-cex`, `trading-dex-solana`, `prediction-markets`, `full`
   - Each profile is a prefix/glob allowlist (e.g. `read-only`: `clodds_*_balance`, `clodds_*_price`, `clodds_*_book`, `clodds_*_markets`, `clodds_*_orders`, `clodds_*_history`, `clodds_get_*`)
   - Export `filterToolsByProfile(tools, profileName)`
   - Default profile for HTTP transport: `full` (configurable via env `CLODDS_MCP_TOOL_PROFILE`)

9. **`docs/DOCKER.md`:**
   - Local setup: `docker compose up gateway` / `docker compose up mcp-http`
   - Required `.env` vars
   - Railway deploy walkthrough: `railway up`, set env vars, get URL
   - Troubleshooting: healthcheck failures, env var issues

10. **`docs/MCP-CLIENTS.md`:**
    - Claude Desktop config snippets for:
      - Local Docker stdio: `docker exec -i clodds-mcp node dist/bin/worker.js`
      - Local HTTP: `mcp-remote http://localhost:18790/mcp --header "Authorization: Bearer <TOKEN>"`
      - Railway HTTP: same with remote URL
    - Claude Code CLI config (`~/.claude.json` `mcpServers` block)
    - Cursor config (`~/.cursor/mcp.json`)
    - Zed config (`~/.config/zed/settings.json`)
    - One-line example queries per client to verify it works

### Modifications

11. **`src/skills/executor.ts`:**
    - Add `getSkillSubcommands(skillName)`: returns typed subcommand metadata `{name, description, params}`
    - Hook each bundled skill's `export.subcommands` if declared; otherwise return empty array
    - Export this for `schemas.ts` consumption

12. **`src/mcp/server.ts`:**
    - Extract `listTools` and `callTool` into exported functions so `http-server.ts` can reuse
    - Keep stdio behavior unchanged

13. **`src/mcp/security.ts`:**
    - Export rate limiter factory for HTTP middleware
    - Add `CLODDS_MCP_IP_RATE_LIMIT` support (default 60/min)

14. **`package.json`:**
    - Scripts: `"mcp:stdio": "node dist/bin/worker.js"`, `"mcp:http": "node dist/mcp/http-server.js"`
    - Add `@modelcontextprotocol/sdk` if not already present (check — it IS already there)

15. **`.env.example`:**
    - Add section `# MCP Server (for Claude Desktop / Claude Code / Cursor / Zed)`
    - Document: `CLODDS_MCP_TOKEN` (required for HTTP), `CLODDS_MCP_PORT` (default 18790), `CLODDS_MCP_TOOL_PROFILE` (default `full`; set `read-only` for public deployments), `CLODDS_MCP_IP_RATE_LIMIT` (default 60/min)

16. **`README.md`:**
    - Add a "Run with Docker" section with a link to `docs/DOCKER.md`
    - Add "Use as MCP Server" section with link to `docs/MCP-CLIENTS.md`

---

## Security requirements (non-negotiable)

- HTTP/SSE MCP endpoint MUST reject requests without valid bearer token
- Token comparison MUST use `crypto.timingSafeEqual`
- `CLODDS_MCP_TOKEN` MUST be printed to logs ONLY as `<redacted>` or length
- `Authorization` header MUST be excluded from Pino request logs
- README + docs must warn users to generate a fresh token, never commit it, and rotate if exposed
- Default tool profile for public Railway deployments should be suggested as `read-only` with explicit note about trading-enabled profiles

---

## Verification

1. `npm run typecheck` and `npm run build` clean
2. `docker compose build` clean
3. `docker compose up gateway` — webchat at `localhost:18789` works, `/spot balance` returns real data
4. `docker compose up mcp-http` — `curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/health` returns `{status:"ok", tools: N}` with N > 100
5. Claude Desktop config pointing to local HTTP MCP — ask "what's my Binance spot balance" — Claude calls `clodds_binance_spot_balance` and returns real data
6. Railway deploy works: `railway up`, set env vars, healthcheck green within 60s
7. Regression: existing stdio MCP via `node dist/bin/worker.js` still works unchanged
8. All existing 135 tests still pass

---

## Reuse — do NOT re-implement

- Existing MCP logic in `src/mcp/server.ts` (`listTools`, `callTool`) — extract and reuse
- Existing rate limiter / security in `src/mcp/security.ts`
- Existing Express middleware patterns from `src/gateway/server.ts`
- `@modelcontextprotocol/sdk` `SSEServerTransport` — already a dependency
- Skill manifest from `src/skills/executor.ts`
- Tool registry / prefix inference from `src/agents/tool-registry.ts` for categorization

---

## Constraints

- Keep Docker image under 500 MB final size if possible
- Node 20 LTS, match `engines` in `package.json`
- Non-root user inside container
- Graceful shutdown (SIGTERM handling) for both HTTP and stdio transports
- Zero changes to trading handlers — only wrap them in new transport

---

## Commit strategy

Three commits:

1. `feat(docker): add Dockerfile, compose, and dockerignore for local + Railway` — `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `railway.toml`
2. `feat(mcp): add HTTP/SSE transport with bearer auth and tool profiles` — `http-server.ts`, `auth.ts`, `schemas.ts`, `profiles.ts`, `server.ts` refactor, `security.ts` rate-limit export, `package.json` scripts, `.env.example`
3. `docs(mcp): Docker + MCP client setup guides` — `docs/DOCKER.md`, `docs/MCP-CLIENTS.md`, README update

Push all three to `origin/main`.

---

## Suggested execution order

Start by reading the plan file and `src/mcp/server.ts` + `src/bin/worker.ts` + `src/skills/executor.ts`. Then:

1. Draft the Dockerfile first (simplest, foundational)
2. Build locally (`docker compose build`) to confirm it works
3. Test gateway mode (`docker compose up gateway`) with the existing `/spot balance` command
4. Layer on the HTTP transport and auth
5. Add schemas + profiles
6. Write the docs
7. Commit + push in three logical chunks

Each commit must pass `npm run typecheck` before pushing.
