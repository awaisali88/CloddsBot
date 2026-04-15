#!/usr/bin/env node
/**
 * Clodds MCP HTTP entrypoint (bearer-auth'd JSON-RPC over HTTP).
 *
 * Default port 18790; override with CLODDS_MCP_PORT.
 * Required env: CLODDS_MCP_TOKEN.
 */
import { startMcpHttpServer } from '../mcp/http-server.js';

startMcpHttpServer().catch((err) => {
  process.stderr.write(`Clodds MCP HTTP failed: ${err?.message || err}\n`);
  process.exit(1);
});
