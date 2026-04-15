/**
 * Bybit Spot Integration
 *
 * Spot trading on Bybit using the same RestClientV5 as the futures module
 * but with category: 'spot' on every call. Shares BYBIT_API_KEY/BYBIT_API_SECRET.
 */

import { RestClientV5 } from 'bybit-api';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface BybitSpotConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  dryRun?: boolean;
}

export interface SpotBalance {
  coin: string;
  free: number;
  locked: number;
  total: number;
}

export interface SpotOrderResult {
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: string;
  price: number;
  qty: number;
  cumExecQty: number;
  avgPrice: number;
  orderStatus: string;
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
  execId: string;
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  price: number;
  qty: number;
  fee: number;
  feeAsset: string;
  isMaker: boolean;
  time: number;
}

// =============================================================================
// CLIENT
// =============================================================================

let client: RestClientV5 | null = null;
let currentConfig: BybitSpotConfig | null = null;

function getClient(config: BybitSpotConfig): RestClientV5 {
  if (client && currentConfig?.apiKey === config.apiKey) return client;
  client = new RestClientV5({
    key: config.apiKey,
    secret: config.apiSecret,
    testnet: config.testnet,
  });
  currentConfig = config;
  return client;
}

// =============================================================================
// MARKET DATA
// =============================================================================

export async function getPrice(config: BybitSpotConfig, symbol: string): Promise<number> {
  const c = getClient(config);
  const result = await c.getTickers({ category: 'spot', symbol });
  if (!result.result?.list?.length) throw new Error(`No spot ticker for ${symbol}`);
  return parseFloat(result.result.list[0].lastPrice);
}

export async function getOrderBook(
  config: BybitSpotConfig,
  symbol: string,
  limit = 25
): Promise<SpotOrderBook> {
  const c = getClient(config);
  const result = await c.getOrderbook({ category: 'spot', symbol, limit });
  return {
    symbol,
    bids: result.result.b.map((b) => [parseFloat(b[0]), parseFloat(b[1])]),
    asks: result.result.a.map((a) => [parseFloat(a[0]), parseFloat(a[1])]),
    timestamp: result.result.ts,
  };
}

export async function getMarkets(config: BybitSpotConfig): Promise<SpotMarket[]> {
  const c = getClient(config);
  const result = await c.getInstrumentsInfo({ category: 'spot' });
  return result.result.list
    .filter((s) => s.status === 'Trading')
    .map((s) => {
      const lotFilter = (s as unknown as { lotSizeFilter?: { basePrecision?: string; minOrderQty?: string; minOrderAmt?: string } }).lotSizeFilter ?? {};
      const priceFilter = (s as unknown as { priceFilter?: { tickSize?: string } }).priceFilter ?? {};
      return {
        symbol: s.symbol,
        baseAsset: s.baseCoin,
        quoteAsset: s.quoteCoin,
        status: s.status,
        tickSize: parseFloat(priceFilter.tickSize ?? '0'),
        lotSize: parseFloat(lotFilter.basePrecision ?? lotFilter.minOrderQty ?? '0'),
        minNotional: parseFloat(lotFilter.minOrderAmt ?? '0'),
      };
    });
}

// =============================================================================
// ACCOUNT
// =============================================================================

export async function getBalance(config: BybitSpotConfig): Promise<SpotBalance[]> {
  const c = getClient(config);
  const result = await c.getWalletBalance({ accountType: 'UNIFIED' });
  const coins = result.result.list[0]?.coin || [];
  return coins
    .map((coin) => {
      const total = parseFloat(coin.walletBalance);
      const locked = parseFloat(coin.locked || '0');
      return {
        coin: coin.coin,
        free: Math.max(total - locked, 0),
        locked,
        total,
      };
    })
    .filter((b) => b.total > 0);
}

export async function getOpenOrders(
  config: BybitSpotConfig,
  symbol?: string
): Promise<SpotOrderResult[]> {
  const c = getClient(config);
  const params: { category: 'spot'; symbol?: string } = { category: 'spot' };
  if (symbol) params.symbol = symbol;
  const result = await c.getActiveOrders(params);
  return result.result.list.map((o) => toOrderResult(o as unknown as Record<string, unknown>));
}

export async function getOrderHistory(
  config: BybitSpotConfig,
  symbol?: string,
  limit = 50
): Promise<SpotOrderResult[]> {
  const c = getClient(config);
  const params: { category: 'spot'; symbol?: string; limit: number } = { category: 'spot', limit };
  if (symbol) params.symbol = symbol;
  const result = await c.getHistoricOrders(params);
  return result.result.list.map((o) => toOrderResult(o as unknown as Record<string, unknown>));
}

export async function getTradeHistory(
  config: BybitSpotConfig,
  symbol?: string,
  limit = 50
): Promise<SpotTrade[]> {
  const c = getClient(config);
  const params: { category: 'spot'; symbol?: string; limit: number } = { category: 'spot', limit };
  if (symbol) params.symbol = symbol;
  const result = await c.getExecutionList(params);
  return result.result.list.map((t) => ({
    execId: t.execId,
    orderId: t.orderId,
    symbol: t.symbol,
    side: t.side as 'Buy' | 'Sell',
    price: parseFloat(t.execPrice),
    qty: parseFloat(t.execQty),
    fee: parseFloat(t.execFee),
    feeAsset: t.feeCurrency || '',
    isMaker: t.isMaker ?? false,
    time: parseInt(t.execTime, 10),
  }));
}

// =============================================================================
// TRADING
// =============================================================================

function toOrderResult(o: Record<string, unknown>): SpotOrderResult {
  return {
    orderId: String(o.orderId),
    symbol: String(o.symbol),
    side: String(o.side) as 'Buy' | 'Sell',
    orderType: String(o.orderType ?? 'Market'),
    price: parseFloat(String(o.price ?? 0)),
    qty: parseFloat(String(o.qty ?? 0)),
    cumExecQty: parseFloat(String(o.cumExecQty ?? 0)),
    avgPrice: parseFloat(String(o.avgPrice ?? 0)),
    orderStatus: String(o.orderStatus ?? 'New'),
  };
}

export async function placeMarketOrder(
  config: BybitSpotConfig,
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: number
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, qty }, '[DRY RUN] Spot market order');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      orderType: 'Market',
      price: 0,
      qty,
      cumExecQty: qty,
      avgPrice: 0,
      orderStatus: 'DRY_RUN',
    };
  }
  const c = getClient(config);
  const result = await c.submitOrder({
    category: 'spot',
    symbol,
    side,
    orderType: 'Market',
    qty: String(qty),
  });
  return {
    orderId: result.result.orderId,
    symbol,
    side,
    orderType: 'Market',
    price: 0,
    qty,
    cumExecQty: 0,
    avgPrice: 0,
    orderStatus: 'Created',
  };
}

export async function placeLimitOrder(
  config: BybitSpotConfig,
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: number,
  price: number,
  params?: { timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'PostOnly' }
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, qty, price }, '[DRY RUN] Spot limit order');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      orderType: 'Limit',
      price,
      qty,
      cumExecQty: 0,
      avgPrice: 0,
      orderStatus: 'DRY_RUN',
    };
  }
  const c = getClient(config);
  const result = await c.submitOrder({
    category: 'spot',
    symbol,
    side,
    orderType: 'Limit',
    qty: String(qty),
    price: String(price),
    timeInForce: params?.timeInForce ?? 'GTC',
  });
  return {
    orderId: result.result.orderId,
    symbol,
    side,
    orderType: 'Limit',
    price,
    qty,
    cumExecQty: 0,
    avgPrice: 0,
    orderStatus: 'New',
  };
}

export async function placeStopLimitOrder(
  config: BybitSpotConfig,
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: number,
  triggerPrice: number,
  limitPrice: number
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, qty, triggerPrice, limitPrice }, '[DRY RUN] Spot stop-limit');
    return {
      orderId: Date.now().toString(),
      symbol,
      side,
      orderType: 'Limit',
      price: limitPrice,
      qty,
      cumExecQty: 0,
      avgPrice: 0,
      orderStatus: 'DRY_RUN',
    };
  }
  const c = getClient(config);
  const result = await c.submitOrder({
    category: 'spot',
    symbol,
    side,
    orderType: 'Limit',
    qty: String(qty),
    price: String(limitPrice),
    triggerPrice: String(triggerPrice),
    timeInForce: 'GTC',
  });
  return {
    orderId: result.result.orderId,
    symbol,
    side,
    orderType: 'Limit',
    price: limitPrice,
    qty,
    cumExecQty: 0,
    avgPrice: 0,
    orderStatus: 'New',
  };
}

export async function cancelOrder(
  config: BybitSpotConfig,
  symbol: string,
  orderId: string
): Promise<boolean> {
  if (config.dryRun) {
    logger.info({ symbol, orderId }, '[DRY RUN] Cancel spot order');
    return true;
  }
  const c = getClient(config);
  await c.cancelOrder({ category: 'spot', symbol, orderId });
  return true;
}

export async function cancelAllOrders(
  config: BybitSpotConfig,
  symbol?: string
): Promise<number> {
  if (config.dryRun) {
    logger.info({ symbol }, '[DRY RUN] Cancel all spot orders');
    return 0;
  }
  const c = getClient(config);
  const params: { category: 'spot'; symbol?: string } = { category: 'spot' };
  if (symbol) params.symbol = symbol;
  const result = await c.cancelAllOrders(params);
  return result.result.list?.length ?? 0;
}
