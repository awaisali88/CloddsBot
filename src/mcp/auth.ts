/**
 * Bearer-token auth middleware for the HTTP/SSE MCP transport.
 *
 * Compares `Authorization: Bearer <token>` (or `?token=` query for SSE clients
 * that can't set headers) against `CLODDS_MCP_TOKEN` using timing-safe
 * comparison. Missing env → 500 (misconfiguration); mismatch → 401.
 *
 * The token is never logged: request logs redact `req.headers.authorization`
 * (see http-server.ts pino config) and errors report only the token length.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // Pad to equal length so timingSafeEqual doesn't short-circuit on length diff
  const maxLen = Math.max(ab.length, bb.length, 1);
  const abPad = Buffer.alloc(maxLen);
  const bbPad = Buffer.alloc(maxLen);
  ab.copy(abPad);
  bb.copy(bbPad);
  return ab.length === bb.length && timingSafeEqual(abPad, bbPad);
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const q = req.query?.token;
  if (typeof q === 'string' && q.length > 0) return q;
  return null;
}

export function bearerAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const expected = process.env.CLODDS_MCP_TOKEN;
    if (!expected || expected.length === 0) {
      res.status(500).json({
        error: 'CLODDS_MCP_TOKEN is not configured on the server',
      });
      return;
    }
    const provided = extractToken(req);
    if (!provided) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    if (!safeCompare(provided, expected)) {
      res.status(401).json({ error: 'Invalid bearer token' });
      return;
    }
    next();
  };
}

/** Render a token for safe logging — never emit the token itself. */
export function redactToken(t: string | undefined): string {
  if (!t) return '<unset>';
  return `<redacted len=${t.length}>`;
}
