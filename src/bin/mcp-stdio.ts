#!/usr/bin/env node
/**
 * Clodds MCP stdio entrypoint.
 *
 * Launches the hand-rolled JSON-RPC 2.0 MCP server over stdin/stdout.
 * Used by Claude Desktop / Claude Code / Cursor when configured with:
 *   "command": "node", "args": ["dist/bin/mcp-stdio.js"]
 */
import { startMcpServer } from '../mcp/server.js';

startMcpServer().catch((err) => {
  process.stderr.write(`Clodds MCP stdio failed: ${err?.message || err}\n`);
  process.exit(1);
});
