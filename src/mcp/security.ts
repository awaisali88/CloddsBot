/**
 * MCP Security Layers
 *
 * Auth, tool allowlisting, rate limiting, audit logging, and input sanitization.
 * All opt-in via env vars — zero breaking changes when unconfigured.
 */

import { RateLimiter, detectInjection } from '../security/index.js';
import type { McpTool } from './index.js';
import { isToolInProfile, filterToolsByProfile } from './profiles.js';

// =============================================================================
// CONFIG
// =============================================================================

export interface McpSecurityConfig {
  /** Comma-separated allowlist of tool names (empty = all allowed) */
  allowedTools: Set<string>;
  /** Comma-separated blocklist of tool names */
  blockedTools: Set<string>;
  /** Max calls per minute per client */
  rateLimit: number;
  /** Whether audit logging is enabled */
  auditEnabled: boolean;
  /** Predefined tool profile: read-only, trading, full */
  toolProfile: string;
}

/** Tool profiles — predefined sets of allowed tool prefixes */
const TOOL_PROFILES: Record<string, string[]> = {
  'read-only': [
    'clodds_feeds', 'clodds_markets', 'clodds_analytics',
    'clodds_portfolio', 'clodds_watchlist', 'clodds_search',
  ],
  'trading': [
    'clodds_feeds', 'clodds_markets', 'clodds_analytics',
    'clodds_portfolio', 'clodds_watchlist', 'clodds_search',
    'clodds_trading', 'clodds_execution', 'clodds_order',
  ],
  'full': [],
};

export function loadSecurityConfig(): McpSecurityConfig {
  const allowed = process.env.CLODDS_MCP_ALLOWED_TOOLS?.trim();
  const blocked = process.env.CLODDS_MCP_BLOCKED_TOOLS?.trim();
  const rateLimit = parseInt(process.env.CLODDS_MCP_RATE_LIMIT || '60', 10);
  const auditEnabled = process.env.CLODDS_MCP_AUDIT !== 'false';
  const toolProfile = process.env.CLODDS_MCP_TOOL_PROFILE || 'full';

  return {
    allowedTools: allowed ? new Set(allowed.split(',').map((s) => s.trim())) : new Set(),
    blockedTools: blocked ? new Set(blocked.split(',').map((s) => s.trim())) : new Set(),
    rateLimit: isNaN(rateLimit) || rateLimit <= 0 ? 60 : rateLimit,
    auditEnabled,
    toolProfile,
  };
}

// =============================================================================
// TOOL ALLOWLISTING
// =============================================================================

/** Check whether a single tool name is allowed by the config */
export function isToolAllowed(toolName: string, config: McpSecurityConfig): boolean {
  // Blocklist always wins
  if (config.blockedTools.has(toolName)) return false;

  // Explicit allowlist
  if (config.allowedTools.size > 0) {
    return config.allowedTools.has(toolName);
  }

  // Profile-based filtering (delegated to profiles.ts for richer profile set)
  if (config.toolProfile && config.toolProfile !== 'full') {
    return isToolInProfile(toolName, config.toolProfile);
  }

  // Legacy inline prefixes (kept for back-compat with existing env configs)
  const prefixes = TOOL_PROFILES[config.toolProfile];
  if (prefixes && prefixes.length > 0) {
    return prefixes.some((prefix) => toolName.startsWith(prefix));
  }

  // 'full' profile or unknown — allow everything
  return true;
}

/** Filter a tools/list response to only include allowed tools */
export function filterTools(tools: McpTool[], config: McpSecurityConfig): McpTool[] {
  let filtered = tools;
  if (config.toolProfile && config.toolProfile !== 'full') {
    filtered = filterToolsByProfile(filtered, config.toolProfile);
  }
  if (config.blockedTools.size > 0) {
    filtered = filtered.filter((t) => !config.blockedTools.has(t.name));
  }
  if (config.allowedTools.size > 0) {
    filtered = filtered.filter((t) => config.allowedTools.has(t.name));
  }
  return filtered;
}

/** Factory for an Express rate-limit middleware keyed by client IP. */
export function createRateLimitMiddleware(config: McpSecurityConfig) {
  const perMinute = Number(process.env.CLODDS_MCP_IP_RATE_LIMIT || 60);
  const limiter = new RateLimiter({ maxRequests: perMinute, windowMs: 60_000 });
  return (req: any, res: any, next: any) => {
    const ip = (req.ip || req.socket?.remoteAddress || 'unknown') as string;
    const result = limiter.check(ip);
    if (!result.allowed) {
      res.status(429).json({
        error: `Rate limited: ${perMinute}/min exceeded`,
        retryInSec: Math.ceil(result.resetIn / 1000),
      });
      return;
    }
    next();
  };
}

// =============================================================================
// RATE LIMITING
// =============================================================================

let rateLimiter: RateLimiter | null = null;

function getRateLimiter(config: McpSecurityConfig): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter({
      maxRequests: config.rateLimit,
      windowMs: 60_000,
    });
  }
  return rateLimiter;
}

/**
 * Check rate limit for a client. Returns null if allowed,
 * or an error message string if rate limited.
 */
export function checkRateLimit(
  clientId: string,
  config: McpSecurityConfig,
): string | null {
  const limiter = getRateLimiter(config);
  const result = limiter.check(clientId);
  if (!result.allowed) {
    return `Rate limited: ${config.rateLimit} calls/min exceeded. Retry in ${Math.ceil(result.resetIn / 1000)}s`;
  }
  return null;
}

// =============================================================================
// INPUT SANITIZATION
// =============================================================================

/**
 * Scan all string values in tool arguments for injection patterns.
 * Returns null if clean, or a description of threats found.
 */
export function sanitizeToolArgs(args: Record<string, unknown>): string | null {
  const threats: string[] = [];

  function scanValue(value: unknown, path: string): void {
    if (typeof value === 'string') {
      const result = detectInjection(value);
      if (!result.safe) {
        threats.push(`${path}: ${result.threats.join(', ')}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => scanValue(item, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        scanValue(v, `${path}.${k}`);
      }
    }
  }

  for (const [key, value] of Object.entries(args)) {
    scanValue(value, key);
  }

  return threats.length > 0 ? `Injection detected: ${threats.join('; ')}` : null;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

export interface AuditEntry {
  tool: string;
  clientId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

/** Log a structured audit entry to stderr (not pino — stdout would corrupt JSON-RPC) */
export function logAudit(entry: AuditEntry, config: McpSecurityConfig): void {
  if (!config.auditEnabled) return;

  const record = {
    level: 'info',
    time: entry.timestamp,
    audit: true,
    tool: entry.tool,
    client: entry.clientId,
    durationMs: entry.durationMs,
    success: entry.success,
    ...(entry.error ? { error: entry.error } : {}),
  };
  process.stderr.write(JSON.stringify(record) + '\n');
}
