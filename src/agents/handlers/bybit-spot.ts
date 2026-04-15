/**
 * Bybit Spot Handlers
 *
 * Uses RestClientV5 with category:'spot'. Shares BYBIT_API_KEY with futures.
 */

import type { ToolInput, HandlerResult, HandlersMap, HandlerContext } from './types';
import { errorResult } from './types';
import type { BybitSpotConfig } from '../../exchanges/bybit-spot';
import * as bybitSpot from '../../exchanges/bybit-spot';

function getCfg(): BybitSpotConfig | null {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    testnet: process.env.BYBIT_TESTNET === 'true',
    dryRun: process.env.DRY_RUN === 'true',
  };
}

const NEED = 'Set BYBIT_API_KEY and BYBIT_API_SECRET (with spot permission enabled).';

async function catching<T>(fn: () => Promise<T>): Promise<HandlerResult> {
  try {
    return JSON.stringify(await fn());
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

function normalizeSide(s: unknown): 'Buy' | 'Sell' | null {
  if (typeof s !== 'string') return null;
  const u = s.toUpperCase();
  if (u === 'BUY' || u === 'B') return 'Buy';
  if (u === 'SELL' || u === 'S') return 'Sell';
  return null;
}

async function balanceHandler(_t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  return catching(async () => ({ balances: await bybitSpot.getBalance(cfg) }));
}

async function priceHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  return catching(async () => ({ symbol, price: await bybitSpot.getPrice(cfg, symbol) }));
}

async function bookHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof t.limit === 'number' ? t.limit : 25;
  return catching(() => bybitSpot.getOrderBook(cfg, symbol, limit));
}

async function marketsHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const search = (t.search as string | undefined)?.toUpperCase();
  return catching(async () => {
    let list = await bybitSpot.getMarkets(cfg);
    if (search) list = list.filter((m) => m.symbol.includes(search));
    return { count: list.length, markets: list.slice(0, 50) };
  });
}

async function ordersHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string | undefined;
  return catching(async () => ({ orders: await bybitSpot.getOpenOrders(cfg, symbol) }));
}

async function tradesHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string | undefined;
  const limit = typeof t.limit === 'number' ? t.limit : 20;
  return catching(async () => ({ trades: await bybitSpot.getTradeHistory(cfg, symbol, limit) }));
}

async function historyHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string | undefined;
  const limit = typeof t.limit === 'number' ? t.limit : 20;
  return catching(async () => ({ orders: await bybitSpot.getOrderHistory(cfg, symbol, limit) }));
}

async function buyHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const quantity = t.quantity as number;
  const price = t.price as number | undefined;
  if (!symbol || !quantity) return errorResult('symbol and quantity required');
  return catching(async () => {
    const order = price
      ? await bybitSpot.placeLimitOrder(cfg, symbol, 'Buy', quantity, price)
      : await bybitSpot.placeMarketOrder(cfg, symbol, 'Buy', quantity);
    return { success: true, order };
  });
}

async function sellHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const quantity = t.quantity as number;
  const price = t.price as number | undefined;
  if (!symbol || !quantity) return errorResult('symbol and quantity required');
  return catching(async () => {
    const order = price
      ? await bybitSpot.placeLimitOrder(cfg, symbol, 'Sell', quantity, price)
      : await bybitSpot.placeMarketOrder(cfg, symbol, 'Sell', quantity);
    return { success: true, order };
  });
}

async function limitHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const side = normalizeSide(t.side);
  const quantity = t.quantity as number;
  const price = t.price as number;
  if (!symbol || !side || !quantity || !price) return errorResult('symbol, side, quantity, price required');
  return catching(async () => ({
    success: true,
    order: await bybitSpot.placeLimitOrder(cfg, symbol, side, quantity, price),
  }));
}

async function stopLimitHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const side = normalizeSide(t.side);
  const quantity = t.quantity as number;
  const stopPrice = t.stopPrice as number;
  const limitPrice = t.limitPrice as number;
  if (!symbol || !side || !quantity || !stopPrice || !limitPrice) {
    return errorResult('symbol, side, quantity, stopPrice, limitPrice required');
  }
  return catching(async () => ({
    success: true,
    order: await bybitSpot.placeStopLimitOrder(cfg, symbol, side, quantity, stopPrice, limitPrice),
  }));
}

async function cancelHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const orderId = t.orderId as string;
  if (!symbol || !orderId) return errorResult('symbol and orderId required');
  return catching(async () => ({ cancelled: await bybitSpot.cancelOrder(cfg, symbol, orderId) }));
}

async function cancelAllHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string | undefined;
  return catching(async () => ({ cancelled: await bybitSpot.cancelAllOrders(cfg, symbol) }));
}

export const bybitSpotHandlers: HandlersMap = {
  bybit_spot_balance: balanceHandler,
  bybit_spot_price: priceHandler,
  bybit_spot_book: bookHandler,
  bybit_spot_markets: marketsHandler,
  bybit_spot_orders: ordersHandler,
  bybit_spot_trades: tradesHandler,
  bybit_spot_history: historyHandler,
  bybit_spot_buy: buyHandler,
  bybit_spot_sell: sellHandler,
  bybit_spot_limit: limitHandler,
  bybit_spot_stop_limit: stopLimitHandler,
  bybit_spot_cancel: cancelHandler,
  bybit_spot_cancel_all: cancelAllHandler,
};

export default bybitSpotHandlers;
