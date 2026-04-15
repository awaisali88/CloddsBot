/**
 * Unified Spot Trading Module
 *
 * Spot trading on Binance, Bybit, MEXC, Hyperliquid (and Drift via Solana DEX).
 * Mirrors the layout of `trading/futures/index.ts` but without leverage,
 * margin mode, funding, or liquidation concerns.
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

import * as binanceSpot from '../../exchanges/binance-spot';
import * as bybitSpot from '../../exchanges/bybit-spot';
import * as mexcSpot from '../../exchanges/mexc-spot';
import * as hyperliquid from '../../exchanges/hyperliquid';

// =============================================================================
// TYPES
// =============================================================================

export type SpotExchange = 'binance' | 'bybit' | 'mexc' | 'hyperliquid';
export type SpotOrderSide = 'BUY' | 'SELL';
export type SpotOrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';

export interface SpotCredentials {
  apiKey: string;
  apiSecret: string;
  walletAddress?: string; // hyperliquid
  testnet?: boolean;
}

export interface SpotConfig {
  exchange: SpotExchange;
  credentials: SpotCredentials;
  dryRun?: boolean;
}

export interface SpotBalance {
  exchange: SpotExchange;
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface SpotMarket {
  exchange: SpotExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: number;
  lotSize: number;
  minNotional: number;
}

export interface SpotOrder {
  id: string;
  exchange: SpotExchange;
  symbol: string;
  side: SpotOrderSide;
  type: SpotOrderType;
  size: number;
  price?: number;
  stopPrice?: number;
  status: 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | 'REJECTED' | 'DRY_RUN';
  filledSize: number;
  avgFillPrice: number;
  timestamp: number;
}

export interface SpotOrderRequest {
  symbol: string;
  side: SpotOrderSide;
  type: SpotOrderType;
  size: number;
  price?: number;
  stopPrice?: number;
}

export interface SpotOrderBook {
  exchange: SpotExchange;
  symbol: string;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  timestamp: number;
}

export interface SpotTrade {
  exchange: SpotExchange;
  id: string;
  orderId: string;
  symbol: string;
  side: SpotOrderSide;
  price: number;
  qty: number;
  fee: number;
  feeAsset: string;
  isMaker: boolean;
  time: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class SpotService extends EventEmitter {
  private configs = new Map<SpotExchange, SpotConfig>();

  constructor(configs: SpotConfig[] = []) {
    super();
    for (const c of configs) this.configs.set(c.exchange, c);
  }

  addExchange(config: SpotConfig): void {
    this.configs.set(config.exchange, config);
  }

  getExchanges(): SpotExchange[] {
    return Array.from(this.configs.keys());
  }

  hasExchange(exchange: SpotExchange): boolean {
    return this.configs.has(exchange);
  }

  private requireConfig(exchange: SpotExchange): SpotConfig {
    const c = this.configs.get(exchange);
    if (!c) throw new Error(`Spot exchange '${exchange}' not configured`);
    return c;
  }

  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------

  async placeOrder(exchange: SpotExchange, req: SpotOrderRequest): Promise<SpotOrder> {
    const config = this.requireConfig(exchange);
    let order: SpotOrder;

    if (exchange === 'binance') {
      const cfg = toBinanceCfg(config);
      const result =
        req.type === 'MARKET'
          ? await binanceSpot.placeMarketOrder(cfg, req.symbol, req.side, req.size)
          : req.type === 'LIMIT'
          ? await binanceSpot.placeLimitOrder(cfg, req.symbol, req.side, req.size, req.price ?? 0)
          : await binanceSpot.placeStopLimitOrder(
              cfg,
              req.symbol,
              req.side,
              req.size,
              req.stopPrice ?? 0,
              req.price ?? 0
            );
      order = {
        id: String(result.orderId),
        exchange,
        symbol: result.symbol,
        side: result.side,
        type: req.type,
        size: result.origQty,
        price: req.price,
        stopPrice: req.stopPrice,
        status: mapStatus(result.status),
        filledSize: result.executedQty,
        avgFillPrice: result.executedQty > 0 ? result.cumulativeQuoteQty / result.executedQty : 0,
        timestamp: Date.now(),
      };
    } else if (exchange === 'bybit') {
      const cfg = toBybitCfg(config);
      const side = req.side === 'BUY' ? 'Buy' : 'Sell';
      const result =
        req.type === 'MARKET'
          ? await bybitSpot.placeMarketOrder(cfg, req.symbol, side, req.size)
          : req.type === 'LIMIT'
          ? await bybitSpot.placeLimitOrder(cfg, req.symbol, side, req.size, req.price ?? 0)
          : await bybitSpot.placeStopLimitOrder(
              cfg,
              req.symbol,
              side,
              req.size,
              req.stopPrice ?? 0,
              req.price ?? 0
            );
      order = {
        id: result.orderId,
        exchange,
        symbol: result.symbol,
        side: req.side,
        type: req.type,
        size: result.qty,
        price: req.price,
        stopPrice: req.stopPrice,
        status: mapStatus(result.orderStatus),
        filledSize: result.cumExecQty,
        avgFillPrice: result.avgPrice,
        timestamp: Date.now(),
      };
    } else if (exchange === 'mexc') {
      const cfg = toMexcCfg(config);
      const result =
        req.type === 'MARKET'
          ? await mexcSpot.placeMarketOrder(cfg, req.symbol, req.side, req.size)
          : req.type === 'LIMIT'
          ? await mexcSpot.placeLimitOrder(cfg, req.symbol, req.side, req.size, req.price ?? 0)
          : await mexcSpot.placeStopLimitOrder(
              cfg,
              req.symbol,
              req.side,
              req.size,
              req.stopPrice ?? 0,
              req.price ?? 0
            );
      order = {
        id: result.orderId,
        exchange,
        symbol: result.symbol,
        side: result.side,
        type: req.type,
        size: result.origQty,
        price: req.price,
        stopPrice: req.stopPrice,
        status: mapStatus(result.status),
        filledSize: result.executedQty,
        avgFillPrice: result.executedQty > 0 ? result.cumulativeQuoteQty / result.executedQty : 0,
        timestamp: Date.now(),
      };
    } else {
      // hyperliquid
      const cfg = toHyperliquidCfg(config);
      const coin = await hyperliquid.resolveSpotCoin(req.symbol);
      const limitPx =
        req.price ??
        (req.type === 'MARKET' ? await hyperliquid.getSpotPrice(req.symbol) : 0);
      const result = await hyperliquid.placeSpotOrder(cfg, {
        coin,
        side: req.side,
        price: limitPx,
        size: req.size,
        type: req.type === 'MARKET' ? 'MARKET' : 'LIMIT',
      });
      order = {
        id: String(result.orderId ?? ''),
        exchange,
        symbol: req.symbol,
        side: req.side,
        type: req.type,
        size: req.size,
        price: req.price,
        status: result.success ? (req.type === 'MARKET' ? 'FILLED' : 'NEW') : 'REJECTED',
        filledSize: result.success && req.type === 'MARKET' ? req.size : 0,
        avgFillPrice: result.success && req.type === 'MARKET' ? limitPx : 0,
        timestamp: Date.now(),
      };
    }

    this.emit('order', order);
    return order;
  }

  buy(exchange: SpotExchange, symbol: string, size: number, price?: number): Promise<SpotOrder> {
    return this.placeOrder(exchange, {
      symbol,
      side: 'BUY',
      type: price ? 'LIMIT' : 'MARKET',
      size,
      price,
    });
  }

  sell(exchange: SpotExchange, symbol: string, size: number, price?: number): Promise<SpotOrder> {
    return this.placeOrder(exchange, {
      symbol,
      side: 'SELL',
      type: price ? 'LIMIT' : 'MARKET',
      size,
      price,
    });
  }

  async cancelOrder(exchange: SpotExchange, symbol: string, orderId: string): Promise<boolean> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') return binanceSpot.cancelOrder(toBinanceCfg(config), symbol, Number(orderId));
    if (exchange === 'bybit') return bybitSpot.cancelOrder(toBybitCfg(config), symbol, orderId);
    if (exchange === 'mexc') return mexcSpot.cancelOrder(toMexcCfg(config), symbol, orderId);
    // hyperliquid
    const coin = await hyperliquid.resolveSpotCoin(symbol);
    const result = await hyperliquid.cancelOrder(toHyperliquidCfg(config), coin, parseInt(orderId, 10));
    return result.success;
  }

  async cancelAll(exchange: SpotExchange, symbol?: string): Promise<number> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      if (!symbol) throw new Error('binance cancelAll requires a symbol');
      return binanceSpot.cancelAllOrders(toBinanceCfg(config), symbol);
    }
    if (exchange === 'bybit') return bybitSpot.cancelAllOrders(toBybitCfg(config), symbol);
    if (exchange === 'mexc') {
      if (!symbol) throw new Error('mexc cancelAll requires a symbol');
      return mexcSpot.cancelAllOrders(toMexcCfg(config), symbol);
    }
    // hyperliquid: cancel all orders (both perp and spot)
    const result = await hyperliquid.cancelAllOrders(toHyperliquidCfg(config));
    return result.success ? 1 : 0;
  }

  // ---------------------------------------------------------------------------
  // ACCOUNT / DATA
  // ---------------------------------------------------------------------------

  async getBalance(exchange: SpotExchange): Promise<SpotBalance[]> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      const list = await binanceSpot.getBalance(toBinanceCfg(config));
      return list.map((b) => ({ exchange, asset: b.asset, free: b.free, locked: b.locked, total: b.total }));
    }
    if (exchange === 'bybit') {
      const list = await bybitSpot.getBalance(toBybitCfg(config));
      return list.map((b) => ({ exchange, asset: b.coin, free: b.free, locked: b.locked, total: b.total }));
    }
    if (exchange === 'mexc') {
      const list = await mexcSpot.getBalance(toMexcCfg(config));
      return list.map((b) => ({ exchange, asset: b.asset, free: b.free, locked: b.locked, total: b.total }));
    }
    // hyperliquid
    const cfg = toHyperliquidCfg(config);
    const list = await hyperliquid.getSpotBalances(cfg.walletAddress);
    return list.map((b) => {
      const total = parseFloat(b.total);
      const hold = parseFloat(b.hold);
      return {
        exchange,
        asset: b.coin,
        free: Math.max(total - hold, 0),
        locked: hold,
        total,
      };
    });
  }

  async getAllBalances(): Promise<SpotBalance[]> {
    const out: SpotBalance[] = [];
    const results = await Promise.allSettled(
      this.getExchanges().map((e) => this.getBalance(e))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') out.push(...r.value);
      else logger.warn({ error: r.reason }, 'Failed to fetch spot balance');
    }
    return out;
  }

  async getOpenOrders(exchange: SpotExchange, symbol?: string): Promise<SpotOrder[]> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      const list = await binanceSpot.getOpenOrders(toBinanceCfg(config), symbol);
      return list.map((o) => binanceToOrder(o, exchange));
    }
    if (exchange === 'bybit') {
      const list = await bybitSpot.getOpenOrders(toBybitCfg(config), symbol);
      return list.map((o) => bybitToOrder(o, exchange));
    }
    if (exchange === 'mexc') {
      const list = await mexcSpot.getOpenOrders(toMexcCfg(config), symbol);
      return list.map((o) => mexcToOrder(o, exchange));
    }
    // hyperliquid: open orders are returned per-user
    const cfg = toHyperliquidCfg(config);
    const orders = await hyperliquid.getOpenOrders(cfg.walletAddress);
    return orders
      .filter((o) => !symbol || o.coin.toUpperCase().includes(symbol.toUpperCase()))
      .map((o) => ({
        id: String(o.oid),
        exchange,
        symbol: o.coin,
        side: o.side === 'B' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        size: parseFloat(o.sz),
        price: parseFloat(o.limitPx),
        status: 'NEW',
        filledSize: 0,
        avgFillPrice: 0,
        timestamp: o.timestamp,
      }));
  }

  async getOrderHistory(exchange: SpotExchange, symbol?: string, limit = 50): Promise<SpotOrder[]> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      if (!symbol) throw new Error('binance order history requires a symbol');
      const list = await binanceSpot.getOrderHistory(toBinanceCfg(config), symbol, limit);
      return list.map((o) => binanceToOrder(o, exchange));
    }
    if (exchange === 'bybit') {
      const list = await bybitSpot.getOrderHistory(toBybitCfg(config), symbol, limit);
      return list.map((o) => bybitToOrder(o, exchange));
    }
    if (exchange === 'mexc') {
      if (!symbol) throw new Error('mexc order history requires a symbol');
      const list = await mexcSpot.getOrderHistory(toMexcCfg(config), symbol, limit);
      return list.map((o) => mexcToOrder(o, exchange));
    }
    // hyperliquid: historical orders via SDK
    return [];
  }

  async getTradeHistory(exchange: SpotExchange, symbol?: string, limit = 50): Promise<SpotTrade[]> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      if (!symbol) throw new Error('binance trade history requires a symbol');
      const list = await binanceSpot.getTradeHistory(toBinanceCfg(config), symbol, limit);
      return list.map((t) => ({
        exchange,
        id: String(t.id),
        orderId: String(t.orderId),
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        qty: t.qty,
        fee: t.commission,
        feeAsset: t.commissionAsset,
        isMaker: t.isMaker,
        time: t.time,
      }));
    }
    if (exchange === 'bybit') {
      const list = await bybitSpot.getTradeHistory(toBybitCfg(config), symbol, limit);
      return list.map((t) => ({
        exchange,
        id: t.execId,
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.side === 'Buy' ? 'BUY' : 'SELL',
        price: t.price,
        qty: t.qty,
        fee: t.fee,
        feeAsset: t.feeAsset,
        isMaker: t.isMaker,
        time: t.time,
      }));
    }
    if (exchange === 'mexc') {
      if (!symbol) throw new Error('mexc trade history requires a symbol');
      const list = await mexcSpot.getTradeHistory(toMexcCfg(config), symbol, limit);
      return list.map((t) => ({
        exchange,
        id: t.id,
        orderId: t.orderId,
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        qty: t.qty,
        fee: t.commission,
        feeAsset: t.commissionAsset,
        isMaker: t.isMaker,
        time: t.time,
      }));
    }
    // hyperliquid: derive from user fills
    const cfg = toHyperliquidCfg(config);
    const fills = await hyperliquid.getUserFills(cfg.walletAddress);
    return fills
      .filter((f) => !symbol || f.coin.toUpperCase().includes(symbol.toUpperCase()))
      .slice(0, limit)
      .map((f) => ({
        exchange,
        id: f.hash,
        orderId: String(f.oid),
        symbol: f.coin,
        side: f.side === 'B' ? 'BUY' : 'SELL',
        price: parseFloat(f.px),
        qty: parseFloat(f.sz),
        fee: parseFloat(f.fee || '0'),
        feeAsset: 'USDC',
        isMaker: !f.crossed,
        time: f.time,
      }));
  }

  async getMarkets(exchange: SpotExchange): Promise<SpotMarket[]> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      const list = await binanceSpot.getMarkets(toBinanceCfg(config));
      return list.map((m) => ({ exchange, ...m }));
    }
    if (exchange === 'bybit') {
      const list = await bybitSpot.getMarkets(toBybitCfg(config));
      return list.map((m) => ({ exchange, ...m }));
    }
    if (exchange === 'mexc') {
      const list = await mexcSpot.getMarkets(toMexcCfg(config));
      return list.map((m) => ({ exchange, ...m }));
    }
    // hyperliquid
    const meta = await hyperliquid.getSpotMeta();
    return meta.universe.map((u) => {
      const baseToken = meta.tokens[u.tokens[0]];
      const quoteToken = meta.tokens[u.tokens[1]];
      return {
        exchange,
        symbol: u.name,
        baseAsset: baseToken?.name ?? '',
        quoteAsset: quoteToken?.name ?? '',
        tickSize: 0,
        lotSize: 0,
        minNotional: 0,
      };
    });
  }

  async getOrderBook(exchange: SpotExchange, symbol: string, limit?: number): Promise<SpotOrderBook> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') {
      const allowed = [5, 10, 20, 50, 100, 500, 1000, 5000] as const;
      type BinanceLimit = typeof allowed[number];
      const bLimit: BinanceLimit = (allowed as readonly number[]).includes(limit ?? 20)
        ? ((limit ?? 20) as BinanceLimit)
        : 20;
      const book = await binanceSpot.getOrderBook(toBinanceCfg(config), symbol, bLimit);
      return { exchange, symbol, bids: book.bids, asks: book.asks, timestamp: Date.now() };
    }
    if (exchange === 'bybit') {
      const book = await bybitSpot.getOrderBook(toBybitCfg(config), symbol, limit);
      return { exchange, symbol, bids: book.bids, asks: book.asks, timestamp: book.timestamp };
    }
    if (exchange === 'mexc') {
      const book = await mexcSpot.getOrderBook(toMexcCfg(config), symbol, limit);
      return { exchange, symbol, bids: book.bids, asks: book.asks, timestamp: book.timestamp };
    }
    const book = await hyperliquid.getSpotOrderBook(symbol);
    return {
      exchange,
      symbol,
      bids: book.levels[0].map((l) => [l.price, l.size]),
      asks: book.levels[1].map((l) => [l.price, l.size]),
      timestamp: book.time,
    };
  }

  async getTickerPrice(exchange: SpotExchange, symbol: string): Promise<number> {
    const config = this.requireConfig(exchange);
    if (exchange === 'binance') return binanceSpot.getPrice(toBinanceCfg(config), symbol);
    if (exchange === 'bybit') return bybitSpot.getPrice(toBybitCfg(config), symbol);
    if (exchange === 'mexc') return mexcSpot.getPrice(toMexcCfg(config), symbol);
    return hyperliquid.getSpotPrice(symbol);
  }
}

// =============================================================================
// CONFIG ADAPTERS
// =============================================================================

function toBinanceCfg(c: SpotConfig): binanceSpot.BinanceSpotConfig {
  return {
    apiKey: c.credentials.apiKey,
    apiSecret: c.credentials.apiSecret,
    testnet: c.credentials.testnet,
    dryRun: c.dryRun,
  };
}

function toBybitCfg(c: SpotConfig): bybitSpot.BybitSpotConfig {
  return {
    apiKey: c.credentials.apiKey,
    apiSecret: c.credentials.apiSecret,
    testnet: c.credentials.testnet,
    dryRun: c.dryRun,
  };
}

function toMexcCfg(c: SpotConfig): mexcSpot.MexcSpotConfig {
  return {
    apiKey: c.credentials.apiKey,
    apiSecret: c.credentials.apiSecret,
    dryRun: c.dryRun,
  };
}

function toHyperliquidCfg(c: SpotConfig): hyperliquid.HyperliquidConfig {
  if (!c.credentials.walletAddress) {
    throw new Error('Hyperliquid spot requires a walletAddress in credentials');
  }
  return {
    walletAddress: c.credentials.walletAddress,
    privateKey: c.credentials.apiSecret, // mapping: privateKey stored as apiSecret
    testnet: c.credentials.testnet,
    dryRun: c.dryRun,
  };
}

function mapStatus(status: string): SpotOrder['status'] {
  const upper = status.toUpperCase();
  if (upper === 'FILLED' || upper === 'PARTIALLY_FILLED') return upper as SpotOrder['status'];
  if (upper === 'CANCELED' || upper === 'CANCELLED') return 'CANCELED';
  if (upper === 'REJECTED') return 'REJECTED';
  if (upper === 'DRY_RUN') return 'DRY_RUN';
  return 'NEW';
}

function binanceToOrder(o: binanceSpot.SpotOrderResult, exchange: SpotExchange): SpotOrder {
  return {
    id: String(o.orderId),
    exchange,
    symbol: o.symbol,
    side: o.side,
    type: (o.type as SpotOrderType) || 'LIMIT',
    size: o.origQty,
    price: o.price,
    status: mapStatus(o.status),
    filledSize: o.executedQty,
    avgFillPrice: o.executedQty > 0 ? o.cumulativeQuoteQty / o.executedQty : 0,
    timestamp: Date.now(),
  };
}

function bybitToOrder(o: bybitSpot.SpotOrderResult, exchange: SpotExchange): SpotOrder {
  return {
    id: o.orderId,
    exchange,
    symbol: o.symbol,
    side: o.side === 'Buy' ? 'BUY' : 'SELL',
    type: (o.orderType.toUpperCase() as SpotOrderType) || 'LIMIT',
    size: o.qty,
    price: o.price,
    status: mapStatus(o.orderStatus),
    filledSize: o.cumExecQty,
    avgFillPrice: o.avgPrice,
    timestamp: Date.now(),
  };
}

function mexcToOrder(o: mexcSpot.SpotOrderResult, exchange: SpotExchange): SpotOrder {
  return {
    id: o.orderId,
    exchange,
    symbol: o.symbol,
    side: o.side,
    type: (o.type as SpotOrderType) || 'LIMIT',
    size: o.origQty,
    price: o.price,
    status: mapStatus(o.status),
    filledSize: o.executedQty,
    avgFillPrice: o.executedQty > 0 ? o.cumulativeQuoteQty / o.executedQty : 0,
    timestamp: Date.now(),
  };
}

// =============================================================================
// FACTORY & EASY SETUP
// =============================================================================

export function createSpotService(configs: SpotConfig[]): SpotService {
  return new SpotService(configs);
}

/**
 * Auto-configure SpotService from environment variables. Reuses the SAME
 * env vars as the futures module — Binance/Bybit/MEXC use a single API key
 * with permission flags; Hyperliquid uses wallet+private key.
 *
 * - BINANCE_API_KEY + BINANCE_API_SECRET  (key needs spot permission enabled)
 * - BYBIT_API_KEY + BYBIT_API_SECRET
 * - MEXC_API_KEY + MEXC_API_SECRET        (separate spot endpoint)
 * - HYPERLIQUID_WALLET + HYPERLIQUID_PRIVATE_KEY
 *
 * Optional:
 * - DRY_RUN=true
 */
export async function setupFromEnv(): Promise<{ service: SpotService }> {
  const configs: SpotConfig[] = [];
  const dryRun = process.env.DRY_RUN === 'true';

  if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
    configs.push({
      exchange: 'binance',
      credentials: {
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
        testnet: process.env.BINANCE_TESTNET === 'true',
      },
      dryRun,
    });
  }

  if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
    configs.push({
      exchange: 'bybit',
      credentials: {
        apiKey: process.env.BYBIT_API_KEY,
        apiSecret: process.env.BYBIT_API_SECRET,
        testnet: process.env.BYBIT_TESTNET === 'true',
      },
      dryRun,
    });
  }

  if (process.env.MEXC_API_KEY && process.env.MEXC_API_SECRET) {
    configs.push({
      exchange: 'mexc',
      credentials: {
        apiKey: process.env.MEXC_API_KEY,
        apiSecret: process.env.MEXC_API_SECRET,
      },
      dryRun,
    });
  }

  if (process.env.HYPERLIQUID_WALLET && process.env.HYPERLIQUID_PRIVATE_KEY) {
    configs.push({
      exchange: 'hyperliquid',
      credentials: {
        apiKey: process.env.HYPERLIQUID_WALLET,
        apiSecret: process.env.HYPERLIQUID_PRIVATE_KEY,
        walletAddress: process.env.HYPERLIQUID_WALLET,
      },
      dryRun,
    });
  }

  return { service: new SpotService(configs) };
}
