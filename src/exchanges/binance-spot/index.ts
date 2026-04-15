/**
 * Binance Spot Integration
 *
 * Spot trading on Binance with full market/limit/stop order support.
 * Uses the same API key as Binance Futures (key needs spot permission enabled).
 */

import { MainClient } from 'binance';
import { logger } from '../../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface BinanceSpotConfig {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  dryRun?: boolean;
}

export interface SpotBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface SpotOrderResult {
  orderId: number;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  origQty: number;
  executedQty: number;
  cumulativeQuoteQty: number;
  status: string;
  timeInForce?: string;
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
  lastUpdateId: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}

export interface SpotTrade {
  id: number;
  orderId: number;
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
// CLIENT
// =============================================================================

let client: MainClient | null = null;
let currentConfig: BinanceSpotConfig | null = null;

function getClient(config: BinanceSpotConfig): MainClient {
  if (client && currentConfig?.apiKey === config.apiKey) {
    return client;
  }
  client = new MainClient({
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    baseUrl: config.testnet ? 'https://testnet.binance.vision' : undefined,
  });
  currentConfig = config;
  return client;
}

// =============================================================================
// MARKET DATA
// =============================================================================

export async function getPrice(config: BinanceSpotConfig, symbol: string): Promise<number> {
  const c = getClient(config);
  const ticker = await c.getSymbolPriceTicker({ symbol }) as { symbol: string; price: string } | Array<{ symbol: string; price: string }>;
  const row = Array.isArray(ticker) ? ticker[0] : ticker;
  const price = parseFloat(String(row?.price));
  if (Number.isNaN(price)) throw new Error(`Invalid price for ${symbol}`);
  return price;
}

export async function getOrderBook(
  config: BinanceSpotConfig,
  symbol: string,
  limit: 5 | 10 | 20 | 50 | 100 | 500 | 1000 | 5000 = 20
): Promise<SpotOrderBook> {
  const c = getClient(config);
  const book = await c.getOrderBook({ symbol, limit });
  return {
    symbol,
    lastUpdateId: book.lastUpdateId,
    bids: book.bids.map((b) => [parseFloat(String(b[0])), parseFloat(String(b[1]))]),
    asks: book.asks.map((a) => [parseFloat(String(a[0])), parseFloat(String(a[1]))]),
  };
}

export async function getMarkets(config: BinanceSpotConfig): Promise<SpotMarket[]> {
  const c = getClient(config);
  const info = await c.getExchangeInfo();
  return info.symbols
    .filter((s) => s.status === 'TRADING')
    .map((s) => {
      const filters = (s.filters ?? []) as unknown as Array<Record<string, string>>;
      const priceFilter = filters.find((f) => f.filterType === 'PRICE_FILTER');
      const lotFilter = filters.find((f) => f.filterType === 'LOT_SIZE');
      const notional = filters.find(
        (f) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL'
      );
      return {
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        status: s.status,
        tickSize: parseFloat(priceFilter?.tickSize ?? '0'),
        lotSize: parseFloat(lotFilter?.stepSize ?? '0'),
        minNotional: parseFloat(notional?.minNotional ?? notional?.notional ?? '0'),
      };
    });
}

// =============================================================================
// ACCOUNT
// =============================================================================

export async function getBalance(config: BinanceSpotConfig): Promise<SpotBalance[]> {
  const c = getClient(config);
  const account = await c.getAccountInformation();
  return account.balances
    .map((b) => {
      const free = parseFloat(String(b.free));
      const locked = parseFloat(String(b.locked));
      return { asset: b.asset, free, locked, total: free + locked };
    })
    .filter((b) => b.total > 0);
}

export async function getOpenOrders(
  config: BinanceSpotConfig,
  symbol?: string
): Promise<SpotOrderResult[]> {
  const c = getClient(config);
  const orders = symbol
    ? await c.getOpenOrders({ symbol })
    : await c.getOpenOrders();
  return orders.map((o) => toOrderResult(o as unknown as Record<string, unknown>));
}

export async function getOrderHistory(
  config: BinanceSpotConfig,
  symbol: string,
  limit = 50
): Promise<SpotOrderResult[]> {
  const c = getClient(config);
  const orders = await c.getAllOrders({ symbol, limit });
  return orders.map((o) => toOrderResult(o as unknown as Record<string, unknown>));
}

export async function getTradeHistory(
  config: BinanceSpotConfig,
  symbol: string,
  limit = 50
): Promise<SpotTrade[]> {
  const c = getClient(config);
  const trades = await c.getAccountTradeList({ symbol, limit });
  return trades.map((t) => ({
    id: t.id,
    orderId: t.orderId,
    symbol: t.symbol,
    side: t.isBuyer ? 'BUY' : 'SELL',
    price: parseFloat(String(t.price)),
    qty: parseFloat(String(t.qty)),
    quoteQty: parseFloat(String(t.quoteQty)),
    commission: parseFloat(String(t.commission)),
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
    orderId: Number(o.orderId),
    clientOrderId: o.clientOrderId as string | undefined,
    symbol: String(o.symbol),
    side: String(o.side) as 'BUY' | 'SELL',
    type: String(o.type),
    price: parseFloat(String(o.price ?? 0)),
    origQty: parseFloat(String(o.origQty ?? 0)),
    executedQty: parseFloat(String(o.executedQty ?? 0)),
    cumulativeQuoteQty: parseFloat(String(o.cummulativeQuoteQty ?? o.cumulativeQuoteQty ?? 0)),
    status: String(o.status ?? 'NEW'),
    timeInForce: o.timeInForce as string | undefined,
  };
}

export async function placeMarketOrder(
  config: BinanceSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, quantity }, '[DRY RUN] Spot market order');
    return {
      orderId: Date.now(),
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
  const c = getClient(config);
  const result = await c.submitNewOrder({
    symbol,
    side,
    type: 'MARKET',
    quantity,
  });
  return toOrderResult(result as unknown as Record<string, unknown>);
}

export async function placeLimitOrder(
  config: BinanceSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
  params?: { timeInForce?: 'GTC' | 'IOC' | 'FOK' }
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, quantity, price }, '[DRY RUN] Spot limit order');
    return {
      orderId: Date.now(),
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
  const c = getClient(config);
  const result = await c.submitNewOrder({
    symbol,
    side,
    type: 'LIMIT',
    quantity,
    price,
    timeInForce: params?.timeInForce ?? 'GTC',
  });
  return toOrderResult(result as unknown as Record<string, unknown>);
}

export async function placeStopLimitOrder(
  config: BinanceSpotConfig,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  stopPrice: number,
  limitPrice: number
): Promise<SpotOrderResult> {
  if (config.dryRun) {
    logger.info({ symbol, side, quantity, stopPrice, limitPrice }, '[DRY RUN] Spot stop-limit');
    return {
      orderId: Date.now(),
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
  const c = getClient(config);
  const result = await c.submitNewOrder({
    symbol,
    side,
    type: 'STOP_LOSS_LIMIT',
    quantity,
    price: limitPrice,
    stopPrice,
    timeInForce: 'GTC',
  });
  return toOrderResult(result as unknown as Record<string, unknown>);
}

export async function cancelOrder(
  config: BinanceSpotConfig,
  symbol: string,
  orderId: number
): Promise<boolean> {
  if (config.dryRun) {
    logger.info({ symbol, orderId }, '[DRY RUN] Cancel spot order');
    return true;
  }
  const c = getClient(config);
  await c.cancelOrder({ symbol, orderId });
  return true;
}

export async function cancelAllOrders(
  config: BinanceSpotConfig,
  symbol: string
): Promise<number> {
  if (config.dryRun) {
    logger.info({ symbol }, '[DRY RUN] Cancel all spot orders');
    return 0;
  }
  const c = getClient(config);
  const result = await c.cancelAllSymbolOrders({ symbol });
  return Array.isArray(result) ? result.length : 0;
}
