/**
 * MEXC Spot Integration
 *
 * Spot trading on MEXC. Uses api.mexc.com with HMAC-SHA256 query-string signing.
 * Note: distinct host from MEXC futures (contract.mexc.com).
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface MexcSpotConfig {
  apiKey: string;
  apiSecret: string;
  dryRun?: boolean;
}

export interface SpotBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface SpotOrderResult {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  origQty: number;
  executedQty: number;
  cumulativeQuoteQty: number;
  status: string;
}

export interface SpotMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  tickSize: number;
  lotSize: number;
  minNotional: number;
}

export interface SpotOrderBook {
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: number;
}

export interface SpotTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  quoteQty: number;
  commission: number;
  commissionAsset: string;
  isMaker: boolean;
  time: number;
}

// =============================================================================
// API HELPERS
// =============================================================================

const BASE_URL = 'https://api.mexc.com';

function sign(query: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function publicRequest<T>(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = buildQuery(params);
  const url = `${BASE_URL}${endpoint}${qs ? `?${qs}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MEXC spot API error: ${response.status} ${text}`);
  }
  return response.json() as Promise<T>;
}

async function signedRequest<T>(
  config: MexcSpotConfig,
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const timestamp = Date.now();
  const allParams = { ...params, timestamp, recvWindow: 5000 };
  const query = buildQuery(allParams);
  const signature = sign(query, config.apiSecret);
  const finalQuery = `${query}&signature=${signature}`;

  const url = `${BASE_URL}${endpoint}?${finalQuery}`;
  const response = await fetch(url, {
    method,
    headers: { 'X-MEXC-APIKEY': config.apiKey },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MEXC spot API error: ${response.status} ${text}`);
  }
  return response.json() as Promise<T>;
}

// =============================================================================
// MARKET DATA
// =============================================================================

export async function getPrice(_config: MexcSpotConfig, symbol: string): Promise<number> {
  const data = await publicRequest<{ symbol: string; price: string }>('/api/v3/ticker/price', { symbol });
  return parseFloat(data.price);
}

export async function getOrderBook(
  _config: MexcSpotConfig,
  symbol: string,
  limit = 20
): Promise<SpotOrderBook> {
  const data = await publicRequest<{ bids: [string, string][]; asks: [string, string][]; timestamp?: number }>(
    '/api/v3/depth',
    { symbol, limit }
  );
  return {
    symbol,
    bids: data.bids.map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: data.asks.map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
    timestamp: data.timestamp ?? Date.now(),
  };
}

export async function getMarkets(_config: MexcSpotConfig): Promise<SpotMarket[]> {
  const data = await publicRequest<{
    symbols: Array<{
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      status: string;
      baseAssetPrecision: number;
      quoteAssetPrecision: number;
      quoteAmountPrecision?: string;
    }>;
  }>('/api/v3/exchangeInfo');
  return data.symbols
    .filter((s) => s.status === '1' || s.status === 'ENABLED' || s.status === 'TRADING')
    .map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
      tickSize: 1 / Math.pow(10, s.quoteAssetPrecision || 8),
      lotSize: 1 / Math.pow(10, s.baseAssetPrecision || 8),
      minNotional: parseFloat(s.quoteAmountPrecision ?? '0'),
    }));
}

// =============================================================================
// ACCOUNT
// =============================================================================

export async function getBalance(config: MexcSpotConfig): Promise<SpotBalance[]> {
  const data = await signedRequest<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
    config,
    'GET',
    '/api/v3/account'
  );
  return data.balances
    .map((b) => {
      const free = parseFloat(b.free);
      const locked = parseFloat(b.locked);
      return { asset: b.asset, free, locked, total: free + locked };
    })
    .filter((b) => b.total > 0);
}

export async function getOpenOrders(
  config: MexcSpotConfig,
  symbol?: string
): Promise<SpotOrderResult[]> {
  const params: Record<string, string | number | undefined> = {};
  if (symbol) params.symbol = symbol;
  const data = await signedRequest<Array<Record<string, unknown>>>(config, 'GET', '/api/v3/openOrders', params);
  return data.map(toOrderResult);
}

export async function getOrderHistory(
  config: MexcSpotConfig,
  symbol: string,
  limit = 50
): Promise<SpotOrderResult[]> {
  const data = await signedRequest<Array<Record<string, unknown>>>(
    config,
    'GET',
    '/api/v3/allOrders',
    { symbol, limit }
  );
  return data.map(toOrderResult);
}

export async function getTradeHistory(
  config: MexcSpotConfig,
  symbol: string,
  limit = 50
): Promise<SpotTrade[]> {
  const data = await signedRequest<Array<{
    id: string;
    orderId: string;
    symbol: string;
    isBuyer: boolean;
    price: string;
    qty: string;
    quoteQty: string;
    commission: string;
    commissionAsset: string;
    isMaker: boolean;
    time: number;
  }>>(config, 'GET', '/api/v3/myTrades', { symbol, limit });
  return data.map((t) => ({
    id: String(t.id),
    orderId: String(t.orderId),
    symbol: t.symbol,
    side: t.isBuyer ? 'BUY' : 'SELL',
    price: parseFloat(t.price),
    qty: parseFloat(t.qty),
    quoteQty: parseFloat(t.quoteQty),
    commission: parseFloat(t.commission),
    commissionAsset: t.commissionAsset,
    isMaker: !!t.isMaker,
    time: t.time,
  }));
}

// =============================================================================
// TRADING
// =============================================================================

function toOrderResult(o: Record<string, unknown>): SpotOrderResult {
  return {
    orderId: String(o.orderId),
    symbol: String(o.symbol),
    side: String(o.side) as 'BUY' | 'SELL',
    type: String(o.type ?? 'MARKET'),
    price: parseFloat(String(o.price ?? 0)),
    origQty: parseFloat(String(o.origQty ?? 0)),
    executedQty: parseFloat(String(o.executedQty ?? 0)),
    cumulativeQuoteQty: parseFloat(String(o.cummulativeQuoteQty ?? o.cumulativeQuoteQty ?? 0)),
    status: String(o.status ?? 'NEW'),
  };
}

export async function placeMarketOrder(
  config: MexcSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, quantity }, '[DRY RUN] MEXC spot market order');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      type: 'MARKET',
      price: 0,
      origQty: quantity,
      executedQty: quantity,
      cumulativeQuoteQty: 0,
      status: 'DRY_RUN',
    };
  }
  const data = await signedRequest<Record<string, unknown>>(config, 'POST', '/api/v3/order', {
    symbol,
    side,
    type: 'MARKET',
    quantity,
  });
  return toOrderResult(data);
}

export async function placeLimitOrder(
  config: MexcSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  params?: { timeInForce?: 'GTC' | 'IOC' | 'FOK' }
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, quantity, price }, '[DRY RUN] MEXC spot limit order');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      type: 'LIMIT',
      price,
      origQty: quantity,
      executedQty: 0,
      cumulativeQuoteQty: 0,
      status: 'DRY_RUN',
    };
  }
  const data = await signedRequest<Record<string, unknown>>(config, 'POST', '/api/v3/order', {
    symbol,
    side,
    type: 'LIMIT',
    quantity,
    price,
    timeInForce: params?.timeInForce ?? 'GTC',
  });
  return toOrderResult(data);
}

export async function placeStopLimitOrder(
  config: MexcSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  stopPrice: number,
  limitPrice: number
): Promise<SpotOrderResult> {
  // MEXC spot uses STOP_LOSS_LIMIT / TAKE_PROFIT_LIMIT depending on side direction
  if (config.dryRun) {
    logger.info({ symbol, side, quantity, stopPrice, limitPrice }, '[DRY RUN] MEXC spot stop-limit');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      price: limitPrice,
      origQty: quantity,
      executedQty: 0,
      cumulativeQuoteQty: 0,
      status: 'DRY_RUN',
    };
  }
  const data = await signedRequest<Record<string, unknown>>(config, 'POST', '/api/v3/order', {
    symbol,
    side,
    type: 'STOP_LOSS_LIMIT',
    quantity,
    price: limitPrice,
    stopPrice,
    timeInForce: 'GTC',
  });
  return toOrderResult(data);
}

export async function cancelOrder(
  config: MexcSpotConfig,
  symbol: string,
  orderId: string
): Promise<boolean> {
  if (config.dryRun) {
    logger.info({ symbol, orderId }, '[DRY RUN] Cancel MEXC spot order');
    return true;
  }
  await signedRequest(config, 'DELETE', '/api/v3/order', { symbol, orderId });
  return true;
}

export async function cancelAllOrders(
  config: MexcSpotConfig,
  symbol: string
): Promise<number> {
  if (config.dryRun) {
    logger.info({ symbol }, '[DRY RUN] Cancel all MEXC spot orders');
    return 0;
  }
  const data = await signedRequest<unknown[]>(config, 'DELETE', '/api/v3/openOrders', { symbol });
  return Array.isArray(data) ? data.length : 0;
}
