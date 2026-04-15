/**
 * Binance Spot Handlers
 *
 * Platform handlers for Binance Spot trading. Mirrors the binance.ts pattern
 * but against spot endpoints (api.binance.com) via the binance-spot module.
 */

import type { ToolInput, HandlerResult, HandlersMap, HandlerContext } from './types';
import { errorResult } from './types';
import type { BinanceSpotConfig } from '../../exchanges/binance-spot';
import * as binanceSpot from '../../exchanges/binance-spot';

// =============================================================================
// HELPERS
// =============================================================================

function getCfg(): BinanceSpotConfig | null {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    testnet: process.env.BINANCE_TESTNET === 'true',
    dryRun: process.env.DRY_RUN === 'true',
  };
}

const NEED = 'Set BINANCE_API_KEY and BINANCE_API_SECRET (with spot permission enabled).';

async function catching<T>(fn: () => Promise<T>): Promise<HandlerResult> {
  try {
    return JSON.stringify(await fn());
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

// =============================================================================
// READ-ONLY HANDLERS
// =============================================================================

async function balanceHandler(_toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  return catching(async () => ({ balances: await binanceSpot.getBalance(cfg) }));
}

async function priceHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  if (!symbol) return errorResult('symbol required');
  return catching(async () => ({ symbol, price: await binanceSpot.getPrice(cfg, symbol) }));
}

type BinanceBookLimit = 5 | 10 | 20 | 50 | 100 | 500 | 1000 | 5000;
function normalizeBookLimit(n: unknown): BinanceBookLimit {
  const allowed: BinanceBookLimit[] = [5, 10, 20, 50, 100, 500, 1000, 5000];
  const num = typeof n === 'number' ? n : 20;
  return (allowed as number[]).includes(num) ? (num as BinanceBookLimit) : 20;
}

async function bookHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = normalizeBookLimit(toolInput.limit);
  return catching(() => binanceSpot.getOrderBook(cfg, symbol, limit));
}

async function marketsHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const search = (toolInput.search as string | undefined)?.toUpperCase();
  return catching(async () => {
    let list = await binanceSpot.getMarkets(cfg);
    if (search) list = list.filter((m) => m.symbol.includes(search));
    return { count: list.length, markets: list.slice(0, 50) };
  });
}

async function ordersHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string | undefined;
  return catching(async () => ({ orders: await binanceSpot.getOpenOrders(cfg, symbol) }));
}

async function tradesHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof toolInput.limit === 'number' ? toolInput.limit : 20;
  return catching(async () => ({ trades: await binanceSpot.getTradeHistory(cfg, symbol, limit) }));
}

async function historyHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof toolInput.limit === 'number' ? toolInput.limit : 20;
  return catching(async () => ({ orders: await binanceSpot.getOrderHistory(cfg, symbol, limit) }));
}

// =============================================================================
// TRADING HANDLERS
// =============================================================================

async function buyHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  const quantity = toolInput.quantity as number;
  const price = toolInput.price as number | undefined;
  if (!symbol || !quantity) return errorResult('symbol and quantity required');
  return catching(async () => {
    const order = price
      ? await binanceSpot.placeLimitOrder(cfg, symbol, 'BUY', quantity, price)
      : await binanceSpot.placeMarketOrder(cfg, symbol, 'BUY', quantity);
    return { success: true, order };
  });
}

async function sellHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  const quantity = toolInput.quantity as number;
  const price = toolInput.price as number | undefined;
  if (!symbol || !quantity) return errorResult('symbol and quantity required');
  return catching(async () => {
    const order = price
      ? await binanceSpot.placeLimitOrder(cfg, symbol, 'SELL', quantity, price)
      : await binanceSpot.placeMarketOrder(cfg, symbol, 'SELL', quantity);
    return { success: true, order };
  });
}

async function limitHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  const side = (toolInput.side as string | undefined)?.toUpperCase() as 'BUY' | 'SELL' | undefined;
  const quantity = toolInput.quantity as number;
  const price = toolInput.price as number;
  if (!symbol || !side || !quantity || !price) {
    return errorResult('symbol, side, quantity, price required');
  }
  if (side !== 'BUY' && side !== 'SELL') return errorResult('side must be BUY or SELL');
  return catching(async () => ({
    success: true,
    order: await binanceSpot.placeLimitOrder(cfg, symbol, side, quantity, price),
  }));
}

async function stopLimitHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  const side = (toolInput.side as string | undefined)?.toUpperCase() as 'BUY' | 'SELL' | undefined;
  const quantity = toolInput.quantity as number;
  const stopPrice = toolInput.stopPrice as number;
  const limitPrice = toolInput.limitPrice as number;
  if (!symbol || !side || !quantity || !stopPrice || !limitPrice) {
    return errorResult('symbol, side, quantity, stopPrice, limitPrice required');
  }
  if (side !== 'BUY' && side !== 'SELL') return errorResult('side must be BUY or SELL');
  return catching(async () => ({
    success: true,
    order: await binanceSpot.placeStopLimitOrder(cfg, symbol, side, quantity, stopPrice, limitPrice),
  }));
}

async function cancelHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  const orderId = Number(toolInput.orderId);
  if (!symbol || !Number.isFinite(orderId)) return errorResult('symbol and numeric orderId required');
  return catching(async () => ({ cancelled: await binanceSpot.cancelOrder(cfg, symbol, orderId) }));
}

async function cancelAllHandler(toolInput: ToolInput, _context: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = toolInput.symbol as string;
  if (!symbol) return errorResult('symbol required');
  return catching(async () => ({ cancelled: await binanceSpot.cancelAllOrders(cfg, symbol) }));
}

// =============================================================================
// EXPORT
// =============================================================================

export const binanceSpotHandlers: HandlersMap = {
  binance_spot_balance: balanceHandler,
  binance_spot_price: priceHandler,
  binance_spot_book: bookHandler,
  binance_spot_markets: marketsHandler,
  binance_spot_orders: ordersHandler,
  binance_spot_trades: tradesHandler,
  binance_spot_history: historyHandler,
  binance_spot_buy: buyHandler,
  binance_spot_sell: sellHandler,
  binance_spot_limit: limitHandler,
  binance_spot_stop_limit: stopLimitHandler,
  binance_spot_cancel: cancelHandler,
  binance_spot_cancel_all: cancelAllHandler,
};

export default binanceSpotHandlers;
