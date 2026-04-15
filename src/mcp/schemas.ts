/**
 * MCP Tool Schema builder.
 *
 * Produces the `McpTool[]` surface exposed over both stdio and HTTP/SSE.
 *
 * Strategy:
 *   1. Hand-written per-subcommand tools from `tool-definitions.ts` (typed schemas
 *      for the top ~10 trading skills — binance/bybit/mexc spot+futures,
 *      hyperliquid, jupiter, pumpfun, polymarket, kalshi, portfolio).
 *   2. Generic `clodds_<skill>(args: string)` fallback for every other skill in
 *      the manifest. Skills covered by (1) also keep a generic tool so callers
 *      can invoke less-common subcommands ad-hoc — the hand-written tools are
 *      an ergonomic overlay, not a replacement.
 */

import type { McpTool } from './index.js';
import { TOOL_DEFINITIONS, findToolDefinition } from './tool-definitions.js';

/** Build the full MCP tool list from a skill manifest. */
export function buildMcpTools(skillManifest: string[]): McpTool[] {
  const tools: McpTool[] = [];

  // 1) Per-subcommand tools with typed schemas
  for (const def of TOOL_DEFINITIONS) {
    tools.push({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
    });
  }

  // 2) Generic fallback for every skill (covers both typed-and-untyped skills)
  for (const name of skillManifest) {
    const toolName = `clodds_${name.replace(/-/g, '_')}`;
    tools.push({
      name: toolName,
      description: `Clodds skill: ${name} — generic interface. Prefer subcommand-specific tools (clodds_${name.replace(/-/g, '_')}_*) when available.`,
      inputSchema: {
        type: 'object',
        properties: {
          args: {
            type: 'string',
            description: 'Raw argument string forwarded to the skill (e.g. "balance", "buy BTCUSDT 0.001")',
          },
        },
      },
    });
  }

  return tools;
}

/**
 * Resolve a tool invocation to the shell-style skill command string that
 * `executeSkillCommand()` expects.
 *
 * Returns the command (including leading slash) or `null` if the tool is
 * unknown.
 */
export function dispatchTool(toolName: string, args: Record<string, unknown>): string | null {
  // 1) Hand-written subcommand tool?
  const def = findToolDefinition(toolName);
  if (def) {
    const argsStr = def.paramsToArgs(args).trim();
    return `/${def.skill} ${def.subcommand} ${argsStr}`.trim();
  }

  // 2) Generic fallback — infer skill name from tool name
  if (!toolName.startsWith('clodds_')) return null;
  const skillName = toolName.replace(/^clodds_/, '').replace(/_/g, '-');
  const rawArgs = typeof args.args === 'string' ? args.args : '';
  return `/${skillName} ${rawArgs}`.trim();
}
