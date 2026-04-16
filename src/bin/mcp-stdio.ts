#!/usr/bin/env node
/**
 * Clodds MCP stdio entrypoint.
 *
 * Launches the hand-rolled JSON-RPC 2.0 MCP server over stdin/stdout.
 * Used by Claude Desktop / Claude Code / Cursor when configured with:
 *   "command": "node", "args": ["dist/bin/mcp-stdio.js"]
 *
 * CRITICAL: LOG_LEVEL must be set BEFORE any imports that instantiate pino,
 * because pino reads the env at construction time. Any log line on stdout
 * corrupts the JSON-RPC stream and Claude Desktop shows "not valid JSON".
 */
process.env.LOG_LEVEL = 'silent';

import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Resolve .env relative to the project root (two dirs up from dist/bin/),
// NOT relative to cwd — Claude Desktop's cwd is its own app directory.
const projectRoot = resolve(__dirname, '..', '..');
dotenvConfig({ path: resolve(projectRoot, '.env') });

// Re-enforce silent after dotenv (in case .env sets LOG_LEVEL to something else)
process.env.LOG_LEVEL = 'silent';

import { startMcpServer } from '../mcp/server.js';

startMcpServer().catch((err) => {
  process.stderr.write(`Clodds MCP stdio failed: ${err?.message || err}\n`);
  process.exit(1);
});
