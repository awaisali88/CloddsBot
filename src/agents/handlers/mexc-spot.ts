/**
 * MEXC Spot Handlers
 *
 * HMAC-SHA256 signed calls against api.mexc.com (distinct from futures host).
 */

import type { ToolInput, HandlerResult, HandlersMap, HandlerContext } from './types';
import { errorResult } from './types';
import type { MexcSpotConfig } from '../../exchanges/mexc-spot';
import * as mexcSpot from '../../exchanges/mexc-spot';

function getCfg(): MexcSpotConfig | null {
  const apiKey = process.env.MEXC_API_KEY;
  const apiSecret = process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret, dryRun: process.env.DRY_RUN === 'true' };
}

const NEED = 'Set MEXC_API_KEY and MEXC_API_SECRET (with spot permission enabled).';

async function catching<T>(fn: () => Promise<T>): Promise<HandlerResult> {
  try {
    return JSON.stringify(await fn());
  } catch (err: unknown) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

function normalizeSide(s: unknown): 'BUY' | 'SELL' | null {
  if (typeof s !== 'string') return null;
  const u = s.toUpperCase();
  if (u === 'BUY' || u === 'B') return 'BUY';
  if (u === 'SELL' || u === 'S') return 'SELL';
  return null;
}

async function balanceHandler(_t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  return catching(async () => ({ balances: await mexcSpot.getBalance(cfg) }));
}

async function priceHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  return catching(async () => ({ symbol, price: await mexcSpot.getPrice(cfg, symbol) }));
}

async function bookHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof t.limit === 'number' ? t.limit : 20;
  return catching(() => mexcSpot.getOrderBook(cfg, symbol, limit));
}

async function marketsHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const search = (t.search as string | undefined)?.toUpperCase();
  return catching(async () => {
    let list = await mexcSpot.getMarkets(cfg);
    if (search) list = list.filter((m) => m.symbol.includes(search));
    return { count: list.length, markets: list.slice(0, 50) };
  });
}

async function ordersHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string | undefined;
  return catching(async () => ({ orders: await mexcSpot.getOpenOrders(cfg, symbol) }));
}

async function tradesHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof t.limit === 'number' ? t.limit : 20;
  return catching(async () => ({ trades: await mexcSpot.getTradeHistory(cfg, symbol, limit) }));
}

async function historyHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  const limit = typeof t.limit === 'number' ? t.limit : 20;
  return catching(async () => ({ orders: await mexcSpot.getOrderHistory(cfg, symbol, limit) }));
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
      ? await mexcSpot.placeLimitOrder(cfg, symbol, 'BUY', quantity, price)
      : await mexcSpot.placeMarketOrder(cfg, symbol, 'BUY', quantity);
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
      ? await mexcSpot.placeLimitOrder(cfg, symbol, 'SELL', quantity, price)
      : await mexcSpot.placeMarketOrder(cfg, symbol, 'SELL', quantity);
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
    order: await mexcSpot.placeLimitOrder(cfg, symbol, side, quantity, price),
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
    order: await mexcSpot.placeStopLimitOrder(cfg, symbol, side, quantity, stopPrice, limitPrice),
  }));
}

async function cancelHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  const orderId = t.orderId as string;
  if (!symbol || !orderId) return errorResult('symbol and orderId required');
  return catching(async () => ({ cancelled: await mexcSpot.cancelOrder(cfg, symbol, orderId) }));
}

async function cancelAllHandler(t: ToolInput, _c: HandlerContext): Promise<HandlerResult> {
  const cfg = getCfg();
  if (!cfg) return errorResult(NEED);
  const symbol = t.symbol as string;
  if (!symbol) return errorResult('symbol required');
  return catching(async () => ({ cancelled: await mexcSpot.cancelAllOrders(cfg, symbol) }));
}

export const mexcSpotHandlers: HandlersMap = {
  mexc_spot_balance: balanceHandler,
  mexc_spot_price: priceHandler,
  mexc_spot_book: bookHandler,
  mexc_spot_markets: marketsHandler,
  mexc_spot_orders: ordersHandler,
  mexc_spot_trades: tradesHandler,
  mexc_spot_history: historyHandler,
  mexc_spot_buy: buyHandler,
  mexc_spot_sell: sellHandler,
  mexc_spot_limit: limitHandler,
  mexc_spot_stop_limit: stopLimitHandler,
  mexc_spot_cancel: cancelHandler,
  mexc_spot_cancel_all: cancelAllHandler,
};

export default mexcSpotHandlers;
