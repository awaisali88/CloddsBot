/**
 * Hand-written per-subcommand MCP tool definitions for the top trading skills.
 *
 * Each definition becomes a typed MCP tool (e.g. `clodds_binance_spot_balance`)
 * with a real JSON Schema — far better affordances for Claude than the generic
 * `clodds_<skill>(args: string)` fallback.
 *
 * The fallback still exists for every skill not listed here (see schemas.ts).
 *
 * Adding a new subcommand:
 *   1. Add a ToolDefinition entry below.
 *   2. `name` must be `clodds_<skill>_<sub>` (underscored).
 *   3. `skill` is the bundled skill directory name (with hyphens).
 *   4. `subcommand` is the case name in the skill's execute() switch.
 *   5. `paramsToArgs` serializes the parsed params back to the positional
 *      arg string the skill expects (e.g. `symbol qty` → `"BTC 0.01"`).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  skill: string;
  subcommand: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  paramsToArgs: (params: Record<string, unknown>) => string;
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const join = (...parts: unknown[]): string =>
  parts.map(str).filter((s) => s.length > 0).join(' ');

// =============================================================================
// BINANCE SPOT
// =============================================================================

const binanceSpot: ToolDefinition[] = [
  {
    name: 'clodds_binance_spot_balance',
    description: 'Get Binance spot wallet balance (all assets with non-zero free/locked)',
    skill: 'binance-spot',
    subcommand: 'balance',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: 'clodds_binance_spot_price',
    description: 'Get Binance spot price for a symbol (e.g. BTCUSDT)',
    skill: 'binance-spot',
    subcommand: 'price',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Symbol like BTCUSDT' } },
      required: ['symbol'],
    },
    paramsToArgs: (p) => join(p.symbol),
  },
  {
    name: 'clodds_binance_spot_buy',
    description: 'Place a market buy order on Binance spot',
    skill: 'binance-spot',
    subcommand: 'buy',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading symbol (e.g. BTCUSDT)' },
        quantity: { type: 'string', description: 'Base asset quantity' },
        price: { type: 'string', description: 'Optional limit price; omit for market' },
      },
      required: ['symbol', 'quantity'],
    },
    paramsToArgs: (p) => join(p.symbol, p.quantity, p.price),
  },
  {
    name: 'clodds_binance_spot_sell',
    description: 'Place a market sell order on Binance spot',
    skill: 'binance-spot',
    subcommand: 'sell',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Trading symbol (e.g. BTCUSDT)' },
        quantity: { type: 'string', description: 'Base asset quantity' },
        price: { type: 'string', description: 'Optional limit price; omit for market' },
      },
      required: ['symbol', 'quantity'],
    },
    paramsToArgs: (p) => join(p.symbol, p.quantity, p.price),
  },
  {
    name: 'clodds_binance_spot_orders',
    description: 'List open Binance spot orders, optionally filtered by symbol',
    skill: 'binance-spot',
    subcommand: 'orders',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', description: 'Optional symbol filter' } },
    },
    paramsToArgs: (p) => join(p.symbol),
  },
  {
    name: 'clodds_binance_spot_history',
    description: 'Get Binance spot trade history for a symbol',
    skill: 'binance-spot',
    subcommand: 'history',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        limit: { type: 'string', description: 'Max rows (default 20)' },
      },
      required: ['symbol'],
    },
    paramsToArgs: (p) => join(p.symbol, p.limit),
  },
];

// =============================================================================
// BINANCE FUTURES
// =============================================================================

const futuresOpen = (skill: string, prefix: string): ToolDefinition[] => [
  {
    name: `${prefix}_balance`,
    description: `Get ${skill} futures account balance`,
    skill,
    subcommand: 'balance',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: `${prefix}_positions`,
    description: `List open ${skill} futures positions`,
    skill,
    subcommand: 'positions',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: `${prefix}_long`,
    description: `Open a long ${skill} futures position (market)`,
    skill,
    subcommand: 'long',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'e.g. BTCUSDT' },
        quantity: { type: 'string' },
        leverage: { type: 'string', description: 'Optional leverage multiplier' },
      },
      required: ['symbol', 'quantity'],
    },
    paramsToArgs: (p) => join(p.symbol, p.quantity, p.leverage),
  },
  {
    name: `${prefix}_short`,
    description: `Open a short ${skill} futures position (market)`,
    skill,
    subcommand: 'short',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        quantity: { type: 'string' },
        leverage: { type: 'string' },
      },
      required: ['symbol', 'quantity'],
    },
    paramsToArgs: (p) => join(p.symbol, p.quantity, p.leverage),
  },
  {
    name: `${prefix}_close`,
    description: `Close a ${skill} futures position`,
    skill,
    subcommand: 'close',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string' } },
      required: ['symbol'],
    },
    paramsToArgs: (p) => join(p.symbol),
  },
  {
    name: `${prefix}_leverage`,
    description: `Set leverage for a ${skill} futures symbol`,
    skill,
    subcommand: 'leverage',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        value: { type: 'string', description: 'Leverage multiplier (e.g. 5)' },
      },
      required: ['symbol', 'value'],
    },
    paramsToArgs: (p) => join(p.symbol, p.value),
  },
];

const binanceFutures = futuresOpen('binance-futures', 'clodds_binance_futures');
const bybitFutures = futuresOpen('bb', 'clodds_bybit_futures');
const mexcFutures = futuresOpen('mx', 'clodds_mexc_futures');
const hyperliquid = futuresOpen('hl', 'clodds_hyperliquid');

// bybit-spot and mexc-spot share the binance-spot shape
const spotShape = (skill: string, prefix: string): ToolDefinition[] =>
  binanceSpot.map((t) => ({
    ...t,
    name: t.name.replace('clodds_binance_spot', prefix),
    skill,
    description: t.description.replace(/Binance spot/g, `${skill} spot`),
  }));

const bybitSpot = spotShape('bybit-spot', 'clodds_bybit_spot');
const mexcSpot = spotShape('mexc-spot', 'clodds_mexc_spot');

// =============================================================================
// JUPITER (Solana DEX aggregator)
// =============================================================================

const jupiter: ToolDefinition[] = [
  {
    name: 'clodds_jupiter_quote',
    description: 'Get a Jupiter swap quote between two Solana tokens',
    skill: 'jupiter',
    subcommand: 'quote',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Input token symbol or mint' },
        to: { type: 'string', description: 'Output token symbol or mint' },
        amount: { type: 'string', description: 'Input amount (in input-token units)' },
      },
      required: ['from', 'to', 'amount'],
    },
    paramsToArgs: (p) => join(p.from, p.to, p.amount),
  },
  {
    name: 'clodds_jupiter_swap',
    description: 'Execute a Jupiter swap between two Solana tokens',
    skill: 'jupiter',
    subcommand: 'swap',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        amount: { type: 'string' },
        slippageBps: { type: 'string', description: 'Slippage in basis points (default 50)' },
      },
      required: ['from', 'to', 'amount'],
    },
    paramsToArgs: (p) => join(p.from, p.to, p.amount, p.slippageBps),
  },
];

// =============================================================================
// PUMPFUN
// =============================================================================

const pumpfun: ToolDefinition[] = [
  {
    name: 'clodds_pumpfun_buy',
    description: 'Buy a Pump.fun token via bonding curve',
    skill: 'pumpfun',
    subcommand: 'buy',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string', description: 'Pump token mint address' },
        solAmount: { type: 'string', description: 'SOL amount to spend' },
      },
      required: ['mint', 'solAmount'],
    },
    paramsToArgs: (p) => join(p.mint, p.solAmount),
  },
  {
    name: 'clodds_pumpfun_sell',
    description: 'Sell a Pump.fun token',
    skill: 'pumpfun',
    subcommand: 'sell',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' },
        tokenAmount: { type: 'string', description: 'Token amount (or "all")' },
      },
      required: ['mint', 'tokenAmount'],
    },
    paramsToArgs: (p) => join(p.mint, p.tokenAmount),
  },
  {
    name: 'clodds_pumpfun_balance',
    description: 'Show Pump.fun holdings for the configured wallet',
    skill: 'pumpfun',
    subcommand: 'balance',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
];

// =============================================================================
// SOLANA (trading-solana)
// =============================================================================

const solana: ToolDefinition[] = [
  {
    name: 'clodds_solana_balance',
    description: 'Get SOL and SPL token balances for the configured Solana wallet',
    skill: 'trade-sol',
    subcommand: 'balance',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: 'clodds_solana_wallet',
    description: 'Show the configured Solana wallet address',
    skill: 'trade-sol',
    subcommand: 'wallet',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: 'clodds_solana_swap',
    description: 'Swap tokens on Solana via Jupiter/Raydium/Orca',
    skill: 'trade-sol',
    subcommand: 'swap',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Input token symbol or mint' },
        to: { type: 'string', description: 'Output token symbol or mint' },
        amount: { type: 'string', description: 'Amount of input token' },
      },
      required: ['from', 'to', 'amount'],
    },
    paramsToArgs: (p) => join(p.from, p.to, p.amount),
  },
  {
    name: 'clodds_solana_quote',
    description: 'Get a swap quote on Solana without executing',
    skill: 'trade-sol',
    subcommand: 'quote',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Input token symbol or mint' },
        to: { type: 'string', description: 'Output token symbol or mint' },
        amount: { type: 'string', description: 'Amount of input token' },
      },
      required: ['from', 'to', 'amount'],
    },
    paramsToArgs: (p) => join(p.from, p.to, p.amount),
  },
];

// =============================================================================
// PREDICTION MARKETS (polymarket, kalshi) — identical subcommand surface
// =============================================================================

const predictionMarketShape = (skill: string, prefix: string, name: string): ToolDefinition[] => [
  {
    name: `${prefix}_markets`,
    description: `Search ${name} markets`,
    skill,
    subcommand: 'markets',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional search query' } },
    },
    paramsToArgs: (p) => join(p.query),
  },
  {
    name: `${prefix}_orderbook`,
    description: `Get ${name} orderbook for a market`,
    skill,
    subcommand: 'orderbook',
    inputSchema: {
      type: 'object',
      properties: { market: { type: 'string', description: 'Market ID or slug' } },
      required: ['market'],
    },
    paramsToArgs: (p) => join(p.market),
  },
  {
    name: `${prefix}_buy`,
    description: `Buy shares in a ${name} market outcome`,
    skill,
    subcommand: 'buy',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string' },
        outcome: { type: 'string', description: 'YES or NO (or outcome ID)' },
        amount: { type: 'string', description: 'USD amount' },
        price: { type: 'string', description: 'Limit price (0-1)' },
      },
      required: ['market', 'outcome', 'amount'],
    },
    paramsToArgs: (p) => join(p.market, p.outcome, p.amount, p.price),
  },
  {
    name: `${prefix}_sell`,
    description: `Sell shares in a ${name} market outcome`,
    skill,
    subcommand: 'sell',
    inputSchema: {
      type: 'object',
      properties: {
        market: { type: 'string' },
        outcome: { type: 'string' },
        amount: { type: 'string' },
        price: { type: 'string' },
      },
      required: ['market', 'outcome', 'amount'],
    },
    paramsToArgs: (p) => join(p.market, p.outcome, p.amount, p.price),
  },
  {
    name: `${prefix}_positions`,
    description: `List open ${name} positions`,
    skill,
    subcommand: 'positions',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: `${prefix}_balance`,
    description: `Get ${name} account balance`,
    skill,
    subcommand: 'balance',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
];

const polymarket = predictionMarketShape('trading-polymarket', 'clodds_polymarket', 'Polymarket');
const kalshi = predictionMarketShape('trading-kalshi', 'clodds_kalshi', 'Kalshi');

// =============================================================================
// PORTFOLIO
// =============================================================================

const portfolio: ToolDefinition[] = [
  {
    name: 'clodds_portfolio_summary',
    description: 'Get consolidated portfolio summary across all connected venues',
    skill: 'portfolio',
    subcommand: 'summary',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: 'clodds_portfolio_positions',
    description: 'List all open positions across connected venues',
    skill: 'portfolio',
    subcommand: 'positions',
    inputSchema: { type: 'object', properties: {} },
    paramsToArgs: () => '',
  },
  {
    name: 'clodds_portfolio_pnl',
    description: 'Show portfolio P&L breakdown',
    skill: 'portfolio',
    subcommand: 'pnl',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', description: 'Time window (e.g. 24h, 7d, 30d)' } },
    },
    paramsToArgs: (p) => join(p.period),
  },
];

// =============================================================================
// EXPORT
// =============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...binanceSpot,
  ...binanceFutures,
  ...bybitSpot,
  ...bybitFutures,
  ...mexcSpot,
  ...mexcFutures,
  ...hyperliquid,
  ...jupiter,
  ...pumpfun,
  ...solana,
  ...polymarket,
  ...kalshi,
  ...portfolio,
];

export const TOOL_DEFINITION_NAMES: Set<string> = new Set(TOOL_DEFINITIONS.map((t) => t.name));

export function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}
