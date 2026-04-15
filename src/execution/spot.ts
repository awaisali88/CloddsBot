/**
 * Spot Execution Service - Spot trading infrastructure
 *
 * Supports: Binance Spot, Bybit Spot, MEXC Spot, Hyperliquid Spot
 *
 * Differences from FuturesExecutionService:
 * - buy/sell instead of long/short
 * - No leverage, margin mode, funding, or liquidation
 * - Order types: MARKET, LIMIT, STOP_LIMIT
 *
 * Thin adapter over `trading/spot/SpotService` so callers can swap between
 * futures and spot execution paths uniformly.
 */

import { logger } from '../utils/logger';
import {
  SpotService,
  type SpotConfig,
  type SpotExchange,
  type SpotOrder,
  type SpotOrderRequest,
  type SpotBalance,
  setupFromEnv as setupSpotFromEnv,
} from '../trading/spot';

// =============================================================================
// TYPES
// =============================================================================

export type SpotPlatform = SpotExchange;
export type SpotSide = 'buy' | 'sell';
export type SpotOrderType = 'MARKET' | 'LIMIT' | 'STOP_LIMIT';

export interface SpotExecutionOrderRequest {
  platform: SpotPlatform;
  symbol: string;
  side: SpotSide;
  size: number;
  price?: number;
  stopPrice?: number;
  orderType?: SpotOrderType;
}

export interface SpotExecutionOrderResult {
  success: boolean;
  orderId?: string;
  filledSize?: number;
  avgFillPrice?: number;
  status?: SpotOrder['status'];
  error?: string;
}

export interface SpotExecutionService {
  buy(req: Omit<SpotExecutionOrderRequest, 'side'>): Promise<SpotExecutionOrderResult>;
  sell(req: Omit<SpotExecutionOrderRequest, 'side'>): Promise<SpotExecutionOrderResult>;
  placeOrder(req: SpotExecutionOrderRequest): Promise<SpotExecutionOrderResult>;
  placeLimitOrder(req: SpotExecutionOrderRequest & { price: number }): Promise<SpotExecutionOrderResult>;
  placeMarketOrder(req: Omit<SpotExecutionOrderRequest, 'price'>): Promise<SpotExecutionOrderResult>;
  placeStopLimit(
    req: SpotExecutionOrderRequest & { stopPrice: number; price: number }
  ): Promise<SpotExecutionOrderResult>;

  cancelOrder(platform: SpotPlatform, symbol: string, orderId: string): Promise<boolean>;
  cancelAllOrders(platform: SpotPlatform, symbol?: string): Promise<number>;

  getOpenOrders(platform: SpotPlatform, symbol?: string): Promise<SpotOrder[]>;
  getBalance(platform?: SpotPlatform): Promise<SpotBalance[]>;
  getTickerPrice(platform: SpotPlatform, symbol: string): Promise<number>;

  getConfiguredPlatforms(): SpotPlatform[];
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

class SpotExecutionImpl implements SpotExecutionService {
  constructor(private service: SpotService) {}

  buy(req: Omit<SpotExecutionOrderRequest, 'side'>): Promise<SpotExecutionOrderResult> {
    return this.placeOrder({ ...req, side: 'buy' });
  }

  sell(req: Omit<SpotExecutionOrderRequest, 'side'>): Promise<SpotExecutionOrderResult> {
    return this.placeOrder({ ...req, side: 'sell' });
  }

  async placeOrder(req: SpotExecutionOrderRequest): Promise<SpotExecutionOrderResult> {
    try {
      const orderType = req.orderType ?? (req.price ? (req.stopPrice ? 'STOP_LIMIT' : 'LIMIT') : 'MARKET');
      const spotReq: SpotOrderRequest = {
        symbol: req.symbol,
        side: req.side === 'buy' ? 'BUY' : 'SELL',
        type: orderType,
        size: req.size,
        price: req.price,
        stopPrice: req.stopPrice,
      };
      const order = await this.service.placeOrder(req.platform, spotReq);
      return {
        success: order.status !== 'REJECTED',
        orderId: order.id,
        filledSize: order.filledSize,
        avgFillPrice: order.avgFillPrice,
        status: order.status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, req }, 'Spot order failed');
      return { success: false, error: message };
    }
  }

  placeMarketOrder(req: Omit<SpotExecutionOrderRequest, 'price'>): Promise<SpotExecutionOrderResult> {
    return this.placeOrder({ ...req, orderType: 'MARKET' });
  }

  placeLimitOrder(req: SpotExecutionOrderRequest & { price: number }): Promise<SpotExecutionOrderResult> {
    return this.placeOrder({ ...req, orderType: 'LIMIT' });
  }

  placeStopLimit(
    req: SpotExecutionOrderRequest & { stopPrice: number; price: number }
  ): Promise<SpotExecutionOrderResult> {
    return this.placeOrder({ ...req, orderType: 'STOP_LIMIT' });
  }

  cancelOrder(platform: SpotPlatform, symbol: string, orderId: string): Promise<boolean> {
    return this.service.cancelOrder(platform, symbol, orderId).catch((err) => {
      logger.error({ err, platform, symbol, orderId }, 'Spot cancel failed');
      return false;
    });
  }

  cancelAllOrders(platform: SpotPlatform, symbol?: string): Promise<number> {
    return this.service.cancelAll(platform, symbol).catch((err) => {
      logger.error({ err, platform, symbol }, 'Spot cancelAll failed');
      return 0;
    });
  }

  getOpenOrders(platform: SpotPlatform, symbol?: string): Promise<SpotOrder[]> {
    return this.service.getOpenOrders(platform, symbol);
  }

  async getBalance(platform?: SpotPlatform): Promise<SpotBalance[]> {
    if (platform) return this.service.getBalance(platform);
    return this.service.getAllBalances();
  }

  getTickerPrice(platform: SpotPlatform, symbol: string): Promise<number> {
    return this.service.getTickerPrice(platform, symbol);
  }

  getConfiguredPlatforms(): SpotPlatform[] {
    return this.service.getExchanges();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSpotExecutionService(configs: SpotConfig[]): SpotExecutionService {
  return new SpotExecutionImpl(new SpotService(configs));
}

/**
 * Auto-configure from env vars (same set as the futures execution service).
 */
export async function setupFromEnv(): Promise<SpotExecutionService> {
  const { service } = await setupSpotFromEnv();
  return new SpotExecutionImpl(service);
}
