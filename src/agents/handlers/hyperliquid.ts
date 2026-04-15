/**
 * Hyperliquid Handlers
 *
 * Platform handlers for Hyperliquid perpetual futures trading.
 * Migrated from inline switch cases in agents/index.ts.
 */

import type { ToolInput, HandlerResult, HandlersMap, HandlerContext } from './types';
import { errorResult } from './types';
import type { HyperliquidConfig } from '../../exchanges/hyperliquid';
import * as hyperliquid from '../../exchanges/hyperliquid';

// =============================================================================
// HELPERS
// =============================================================================

function getWallet(): string | null {
  return process.env.HYPERLIQUID_WALLET || null;
}

function getHyperliquidConfig(): { config: HyperliquidConfig; wallet: string } | null {
  const wallet = process.env.HYPERLIQUID_WALLET;
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY;
  if (!wallet || !privateKey) return null;
  return {
    config: {
      walletAddress: wallet,
      privateKey,
      dryRun: process.env.DRY_RUN === 'true',
    },
    wallet,
  };
}

// =============================================================================
// READ-ONLY HANDLERS
// =============================================================================

async function balanceHandler(
  _toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const wallet = getWallet();
  if (!wallet) return errorResult('Set HYPERLIQUID_WALLET');
  try {
    const state = await hyperliquid.getUserState(wallet);
    return JSON.stringify({
      accountValue: state.marginSummary.accountValue,
      marginUsed: state.marginSummary.totalMarginUsed,
      positions: state.assetPositions.length,
    });
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function positionsHandler(
  _toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const wallet = getWallet();
  if (!wallet) return errorResult('Set HYPERLIQUID_WALLET');
  try {
    const state = await hyperliquid.getUserState(wallet);
    const positions = state.assetPositions
      .filter(p => {
        const size = parseFloat(p.position.szi);
        return Number.isFinite(size) && size !== 0;
      })
      .map(p => ({
        coin: p.position.coin,
        size: parseFloat(p.position.szi),
        entryPrice: parseFloat(p.position.entryPx),
        unrealizedPnl: parseFloat(p.position.unrealizedPnl),
        liquidationPrice: parseFloat(p.position.liquidationPx),
      }));
    return JSON.stringify(positions);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function ordersHandler(
  _toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const wallet = getWallet();
  if (!wallet) return errorResult('Set HYPERLIQUID_WALLET');
  try {
    const orders = await hyperliquid.getOpenOrders(wallet);
    return JSON.stringify(orders.map(o => ({
      orderId: o.oid,
      coin: o.coin,
      side: o.side,
      price: parseFloat(o.limitPx),
      size: parseFloat(o.sz),
      timestamp: o.timestamp,
    })));
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function priceHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const coin = toolInput.coin as string;
  try {
    const mids = await hyperliquid.getAllMids();
    const price = mids[coin];
    if (price == null) {
      return JSON.stringify({ error: `No price for ${coin}` });
    }
    return JSON.stringify({ coin, price: parseFloat(price) });
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function fundingHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const coin = toolInput.coin as string | undefined;
  try {
    const rates = await hyperliquid.getFundingRates();
    if (coin) {
      const rate = rates.find(r => r.coin === coin);
      if (!rate) {
        return JSON.stringify({ error: `No funding rate for ${coin}` });
      }
      return JSON.stringify(rate);
    }
    // Return top 10 by funding rate
    const sorted = rates.sort((a, b) => Math.abs(parseFloat(b.funding)) - Math.abs(parseFloat(a.funding)));
    return JSON.stringify(sorted.slice(0, 10));
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// =============================================================================
// TRADING HANDLERS
// =============================================================================

async function longHandler(
  toolInput: ToolInput,
  context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string;
  const size = toolInput.size as number;
  const leverage = toolInput.leverage as number | undefined;
  try {
    if (leverage) {
      await hyperliquid.updateLeverage(env.config, coin, leverage);
    }
    const result = await hyperliquid.placePerpOrder(env.config, {
      coin,
      side: 'BUY',
      size,
      type: 'MARKET',
    });
    // Log trade to DB
    context.db.logHyperliquidTrade({
      userId: env.wallet.slice(0, 16),
      orderId: String(result.orderId || Date.now()),
      coin,
      side: 'BUY',
      size,
      price: 0,
      leverage,
      timestamp: new Date(),
    });
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function shortHandler(
  toolInput: ToolInput,
  context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string;
  const size = toolInput.size as number;
  const leverage = toolInput.leverage as number | undefined;
  try {
    if (leverage) {
      await hyperliquid.updateLeverage(env.config, coin, leverage);
    }
    const result = await hyperliquid.placePerpOrder(env.config, {
      coin,
      side: 'SELL',
      size,
      type: 'MARKET',
    });
    // Log trade to DB
    context.db.logHyperliquidTrade({
      userId: env.wallet.slice(0, 16),
      orderId: String(result.orderId || Date.now()),
      coin,
      side: 'SELL',
      size,
      price: 0,
      leverage,
      timestamp: new Date(),
    });
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function closeHandler(
  toolInput: ToolInput,
  context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string;
  try {
    // Get current position
    const state = await hyperliquid.getUserState(env.wallet);
    const position = state.assetPositions.find(p => p.position.coin === coin);
    if (!position || parseFloat(position.position.szi) === 0) {
      return JSON.stringify({ error: `No open position for ${coin}` });
    }
    const size = Math.abs(parseFloat(position.position.szi));
    const side = parseFloat(position.position.szi) > 0 ? 'SELL' : 'BUY';
    const result = await hyperliquid.placePerpOrder(env.config, {
      coin,
      side,
      size,
      type: 'MARKET',
      reduceOnly: true,
    });
    // Log trade to DB
    context.db.logHyperliquidTrade({
      userId: env.wallet.slice(0, 16),
      orderId: String(result.orderId || Date.now()),
      coin,
      side: side as 'BUY' | 'SELL',
      size,
      price: 0,
      timestamp: new Date(),
    });
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function cancelHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string;
  const orderId = toolInput.order_id as number;
  try {
    const result = await hyperliquid.cancelOrder(env.config, coin, orderId);
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function cancelAllHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string | undefined;
  try {
    const result = await hyperliquid.cancelAllOrders(env.config, coin);
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function leverageHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const coin = toolInput.coin as string;
  const leverage = toolInput.leverage as number;
  const isCross = (toolInput.is_cross as boolean) ?? true;
  try {
    const result = await hyperliquid.updateLeverage(env.config, coin, leverage, isCross);
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// =============================================================================
// EXPORT HANDLERS MAP
// =============================================================================

// =============================================================================
// SPOT HANDLERS
// =============================================================================

async function spotBalanceHandler(
  _toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const wallet = getWallet();
  if (!wallet) return errorResult('Set HYPERLIQUID_WALLET');
  try {
    const balances = await hyperliquid.getSpotBalances(wallet);
    return JSON.stringify({ balances });
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function spotPriceHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const pair = toolInput.pair as string;
  if (!pair) return errorResult('pair required (e.g. HYPE/USDC)');
  try {
    const price = await hyperliquid.getSpotPrice(pair);
    return JSON.stringify({ pair, price });
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function spotBookHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const pair = toolInput.pair as string;
  if (!pair) return errorResult('pair required');
  try {
    const book = await hyperliquid.getSpotOrderBook(pair);
    return JSON.stringify(book);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function spotMarketsHandler(
  _toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  try {
    const meta = await hyperliquid.getSpotMeta();
    const markets = meta.universe.map((u) => {
      const base = meta.tokens[u.tokens[0]]?.name;
      const quote = meta.tokens[u.tokens[1]]?.name;
      return { symbol: u.name, base, quote };
    });
    return JSON.stringify({ count: markets.length, markets: markets.slice(0, 50) });
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function spotBuyHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const pair = toolInput.pair as string;
  const size = toolInput.size as number;
  const price = toolInput.price as number | undefined;
  if (!pair || !size) return errorResult('pair and size required');
  try {
    const coin = await hyperliquid.resolveSpotCoin(pair);
    const limitPx = price ?? await hyperliquid.getSpotPrice(pair);
    const result = await hyperliquid.placeSpotOrder(env.config, {
      coin,
      side: 'BUY',
      price: limitPx,
      size,
      type: price ? 'LIMIT' : 'MARKET',
    });
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function spotSellHandler(
  toolInput: ToolInput,
  _context: HandlerContext
): Promise<HandlerResult> {
  const env = getHyperliquidConfig();
  if (!env) return errorResult('Set HYPERLIQUID_WALLET and HYPERLIQUID_PRIVATE_KEY');
  const pair = toolInput.pair as string;
  const size = toolInput.size as number;
  const price = toolInput.price as number | undefined;
  if (!pair || !size) return errorResult('pair and size required');
  try {
    const coin = await hyperliquid.resolveSpotCoin(pair);
    const limitPx = price ?? await hyperliquid.getSpotPrice(pair);
    const result = await hyperliquid.placeSpotOrder(env.config, {
      coin,
      side: 'SELL',
      price: limitPx,
      size,
      type: price ? 'LIMIT' : 'MARKET',
    });
    return JSON.stringify(result);
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// =============================================================================
// EXPORT HANDLERS MAP
// =============================================================================

export const hyperliquidHandlers: HandlersMap = {
  // Read-only (perps)
  hyperliquid_balance: balanceHandler,
  hyperliquid_positions: positionsHandler,
  hyperliquid_orders: ordersHandler,
  hyperliquid_price: priceHandler,
  hyperliquid_funding: fundingHandler,
  // Trading (perps)
  hyperliquid_long: longHandler,
  hyperliquid_short: shortHandler,
  hyperliquid_close: closeHandler,
  hyperliquid_cancel: cancelHandler,
  hyperliquid_cancel_all: cancelAllHandler,
  hyperliquid_leverage: leverageHandler,
  // Spot
  hyperliquid_spot_balance: spotBalanceHandler,
  hyperliquid_spot_price: spotPriceHandler,
  hyperliquid_spot_book: spotBookHandler,
  hyperliquid_spot_markets: spotMarketsHandler,
  hyperliquid_spot_buy: spotBuyHandler,
  hyperliquid_spot_sell: spotSellHandler,
};

export default hyperliquidHandlers;
