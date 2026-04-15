/**
 * MCP Tool Profiles
 *
 * Profiles are coarse allowlists over tool-name prefixes, matched against the
 * tool's `name` (e.g. `clodds_binance_spot_balance`). A profile of `full`
 * allows everything; public Railway deployments should default to `read-only`.
 *
 * This complements `security.ts` (which has a narrower legacy profile set) —
 * resolution order in security.ts falls back to this when it sees an unknown
 * profile name.
 */

import type { McpTool } from './index.js';

export type ProfileName =
  | 'read-only'
  | 'trading-cex'
  | 'trading-dex-solana'
  | 'prediction-markets'
  | 'defi'
  | 'trading'
  | 'full';

/** Glob-like patterns (prefix match with optional `*` wildcard at end or in middle). */
const PROFILE_PATTERNS: Record<ProfileName, string[]> = {
  'read-only': [
    'clodds_*_balance',
    'clodds_*_price',
    'clodds_*_book',
    'clodds_*_orderbook',
    'clodds_*_markets',
    'clodds_*_orders',
    'clodds_*_positions',
    'clodds_*_history',
    'clodds_*_quote',
    'clodds_*_route',
    'clodds_get_*',
    'clodds_feeds*',
    'clodds_markets*',
    'clodds_analytics*',
    'clodds_portfolio*',
    'clodds_watchlist*',
    'clodds_search*',
    'clodds_solana_balance*',
    'clodds_wallet_list',
    'clodds_wallet_balance',
  ],
  'trading-cex': [
    'clodds_binance_spot*',
    'clodds_binance_futures*',
    'clodds_bybit_spot*',
    'clodds_bybit_futures*',
    'clodds_mexc_spot*',
    'clodds_hyperliquid*',
  ],
  'trading-dex-solana': [
    'clodds_jupiter*',
    'clodds_raydium*',
    'clodds_orca*',
    'clodds_pump*',
    'clodds_drift*',
    'clodds_solana_balance*',
  ],
  'prediction-markets': [
    'clodds_polymarket*',
    'clodds_kalshi*',
    'clodds_manifold*',
    'clodds_metaculus*',
  ],
  defi: [
    'clodds_marginfi*',
    'clodds_solend*',
    'clodds_kamino*',
    'clodds_wormhole*',
    'clodds_bridge*',
  ],
  // Legacy profile (matches security.ts) — keep for back-compat.
  trading: [
    'clodds_feeds*',
    'clodds_markets*',
    'clodds_analytics*',
    'clodds_portfolio*',
    'clodds_watchlist*',
    'clodds_search*',
    'clodds_trading*',
    'clodds_execution*',
    'clodds_order*',
  ],
  full: [],
};

function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern.includes('*')) return name === pattern;
  const parts = pattern.split('*');
  let idx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (!part) continue;
    if (i === 0) {
      if (!name.startsWith(part)) return false;
      idx = part.length;
    } else {
      const found = name.indexOf(part, idx);
      if (found < 0) return false;
      idx = found + part.length;
    }
  }
  // If pattern didn't end with *, final part must match end
  if (!pattern.endsWith('*') && idx !== name.length) return false;
  return true;
}

export function isToolInProfile(toolName: string, profile: string): boolean {
  const patterns = PROFILE_PATTERNS[profile as ProfileName];
  if (!patterns || patterns.length === 0) return true; // full / unknown
  return patterns.some((p) => matchesPattern(toolName, p));
}

export function filterToolsByProfile(tools: McpTool[], profile: string): McpTool[] {
  if (!profile || profile === 'full') return tools;
  return tools.filter((t) => isToolInProfile(t.name, profile));
}

export function listProfiles(): ProfileName[] {
  return Object.keys(PROFILE_PATTERNS) as ProfileName[];
}
