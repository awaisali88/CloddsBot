/**
 * HTTP MCP transport for Clodds.
 *
 * Exposes the full MCP tool surface over authenticated HTTP. Clients (Claude
 * Desktop / Claude Code / Cursor / Zed) connect via `mcp-remote` which bridges
 * stdio to this HTTP endpoint.
 *
 * Endpoints:
 *   GET  /health           — public liveness probe + tool count
 *   POST /mcp              — JSON-RPC 2.0 request/response (bearer-auth)
 *
 * Security:
 *   - Bearer-token auth (crypto.timingSafeEqual) on `/mcp`
 *   - IP rate limit in front of auth (default 60/min via CLODDS_MCP_IP_RATE_LIMIT)
 *   - `CLODDS_MCP_TOKEN` is never logged (pino redacts `authorization`)
 */

import express, { type Request, type Response } from 'express';
import pino from 'pino';
import { handleMcpRequest, listTools, getSecurityConfig } from './server.js';
import { filterTools } from './security.js';
import { createRateLimitMiddleware } from './security.js';
import { bearerAuthMiddleware, redactToken } from './auth.js';
import type { JsonRpcRequest } from './index.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'headers.authorization', 'query.token'],
    censor: '<redacted>',
  },
});

function clientIdFromRequest(req: Request): string {
  // Hash-free: IP is fine for per-client rate-limiting scope at this layer.
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

async function handleHttpRpc(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<JsonRpcRequest> | undefined;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id,
      error: { code: -32600, message: 'Invalid Request: missing jsonrpc "2.0" or method' },
    });
    return;
  }

  try {
    const response = await handleMcpRequest(body as JsonRpcRequest, clientIdFromRequest(req));
    if (!response) {
      // Notification — no response body
      res.status(204).end();
      return;
    }
    res.json(response);
  } catch (err: any) {
    logger.error({ err: err?.message }, 'mcp_http_error');
    res.status(500).json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32603, message: err?.message || 'Internal error' },
    });
  }
}

export async function startMcpHttpServer(): Promise<void> {
  const port = Number(process.env.CLODDS_MCP_PORT || 18790);
  const token = process.env.CLODDS_MCP_TOKEN;
  const config = getSecurityConfig();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Public: health probe
  app.get('/health', async (_req, res) => {
    try {
      const tools = filterTools(await listTools(), config);
      res.json({
        status: 'ok',
        version: process.env.npm_package_version || 'dev',
        tools: tools.length,
        profile: config.toolProfile,
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', error: err?.message });
    }
  });

  // Protected: MCP JSON-RPC endpoint
  const rateLimit = createRateLimitMiddleware(config);
  const auth = bearerAuthMiddleware();
  app.post('/mcp', rateLimit, auth, handleHttpRpc);

  // Graceful shutdown
  const server = app.listen(port, () => {
    logger.info(
      { port, token: redactToken(token), profile: config.toolProfile },
      'Clodds MCP HTTP server started',
    );
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down MCP HTTP server');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
