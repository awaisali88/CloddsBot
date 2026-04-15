/**
 * Spot client smoke tests
 *
 * Verifies dry-run paths, MEXC HMAC signing, and unified SpotService routing.
 * No live network calls — `fetch` is stubbed where signed requests would fire.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

import * as binanceSpot from '../src/exchanges/binance-spot';
import * as bybitSpot from '../src/exchanges/bybit-spot';
import * as mexcSpot from '../src/exchanges/mexc-spot';
import { SpotService } from '../src/trading/spot';

// ---------------------------------------------------------------------------
// DRY-RUN: order placement returns DRY_RUN status, never touches the network
// ---------------------------------------------------------------------------

describe('binance-spot dry-run', () => {
  const cfg: binanceSpot.BinanceSpotConfig = {
    apiKey: 'test',
    apiSecret: 'test',
    dryRun: true,
  };

  it('placeMarketOrder returns DRY_RUN', async () => {
    const r = await binanceSpot.placeMarketOrder(cfg, 'BTCUSDT', 'BUY', 0.001);
    assert.strictEqual(r.status, 'DRY_RUN');
    assert.strictEqual(r.symbol, 'BTCUSDT');
    assert.strictEqual(r.side, 'BUY');
    assert.strictEqual(r.origQty, 0.001);
  });

  it('placeLimitOrder returns DRY_RUN', async () => {
    const r = await binanceSpot.placeLimitOrder(cfg, 'BTCUSDT', 'SELL', 0.5, 75000);
    assert.strictEqual(r.status, 'DRY_RUN');
    assert.strictEqual(r.price, 75000);
  });

  it('placeStopLimitOrder returns DRY_RUN', async () => {
    const r = await binanceSpot.placeStopLimitOrder(cfg, 'BTCUSDT', 'SELL', 0.5, 70000, 69900);
    assert.strictEqual(r.status, 'DRY_RUN');
  });

  it('cancelOrder returns true in dry-run', async () => {
    assert.strictEqual(await binanceSpot.cancelOrder(cfg, 'BTCUSDT', 1), true);
  });
});

describe('bybit-spot dry-run', () => {
  const cfg: bybitSpot.BybitSpotConfig = {
    apiKey: 'test',
    apiSecret: 'test',
    dryRun: true,
  };

  it('placeMarketOrder uses category:spot path', async () => {
    const r = await bybitSpot.placeMarketOrder(cfg, 'BTCUSDT', 'Buy', 0.001);
    assert.strictEqual(r.orderStatus, 'DRY_RUN');
    assert.strictEqual(r.side, 'Buy');
  });

  it('placeLimitOrder returns DRY_RUN', async () => {
    const r = await bybitSpot.placeLimitOrder(cfg, 'BTCUSDT', 'Sell', 0.5, 75000);
    assert.strictEqual(r.orderStatus, 'DRY_RUN');
    assert.strictEqual(r.price, 75000);
  });
});

describe('mexc-spot dry-run', () => {
  const cfg: mexcSpot.MexcSpotConfig = {
    apiKey: 'test',
    apiSecret: 'test',
    dryRun: true,
  };

  it('placeMarketOrder returns DRY_RUN', async () => {
    const r = await mexcSpot.placeMarketOrder(cfg, 'BTCUSDT', 'BUY', 0.001);
    assert.strictEqual(r.status, 'DRY_RUN');
  });

  it('placeStopLimitOrder returns DRY_RUN', async () => {
    const r = await mexcSpot.placeStopLimitOrder(cfg, 'BTCUSDT', 'SELL', 0.5, 70000, 69900);
    assert.strictEqual(r.status, 'DRY_RUN');
  });
});

// ---------------------------------------------------------------------------
// MEXC HMAC: verify our query-string signing matches the documented scheme
// ---------------------------------------------------------------------------

describe('mexc-spot HMAC signing', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('appends signature=<hmac-sha256> to query string and sends X-MEXC-APIKEY header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = (async (input: unknown, init: unknown) => {
      capturedUrl = String(input);
      const headers = (init as { headers?: Record<string, string> })?.headers ?? {};
      capturedHeaders = headers;
      return new Response(JSON.stringify({ balances: [] }), { status: 200 });
    }) as typeof fetch;

    await mexcSpot.getBalance({ apiKey: 'TESTKEY', apiSecret: 'SECRET' });

    assert.ok(capturedUrl.startsWith('https://api.mexc.com/api/v3/account?'));
    assert.match(capturedUrl, /timestamp=\d+/);
    assert.match(capturedUrl, /recvWindow=5000/);
    assert.match(capturedUrl, /&signature=[a-f0-9]{64}$/);
    assert.strictEqual(capturedHeaders['X-MEXC-APIKEY'], 'TESTKEY');

    // Recompute signature from the query slice and confirm it matches
    const queryWithoutSig = capturedUrl.split('?')[1].replace(/&signature=[a-f0-9]+$/, '');
    const expected = crypto.createHmac('sha256', 'SECRET').update(queryWithoutSig).digest('hex');
    assert.match(capturedUrl, new RegExp(`signature=${expected}$`));
  });
});

// ---------------------------------------------------------------------------
// Unified SpotService routing
// ---------------------------------------------------------------------------

describe('SpotService routing', () => {
  let svc: SpotService;

  beforeEach(() => {
    svc = new SpotService([
      { exchange: 'binance', credentials: { apiKey: 'k', apiSecret: 's' }, dryRun: true },
      { exchange: 'bybit', credentials: { apiKey: 'k', apiSecret: 's' }, dryRun: true },
      { exchange: 'mexc', credentials: { apiKey: 'k', apiSecret: 's' }, dryRun: true },
    ]);
  });

  it('exposes configured exchanges', () => {
    assert.deepStrictEqual(svc.getExchanges(), ['binance', 'bybit', 'mexc']);
  });

  it('throws on unconfigured exchange', async () => {
    await assert.rejects(
      () => svc.placeOrder('hyperliquid', { symbol: 'HYPE', side: 'BUY', type: 'MARKET', size: 1 }),
      /not configured/
    );
  });

  it('routes binance market buy through dry-run client', async () => {
    const order = await svc.placeOrder('binance', {
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      size: 0.001,
    });
    assert.strictEqual(order.exchange, 'binance');
    assert.strictEqual(order.status, 'DRY_RUN');
    assert.strictEqual(order.size, 0.001);
  });

  it('buy()/sell() pick MARKET when no price, LIMIT when price is given', async () => {
    const market = await svc.buy('binance', 'BTCUSDT', 0.001);
    assert.strictEqual(market.type, 'MARKET');
    const limit = await svc.sell('binance', 'BTCUSDT', 0.001, 75000);
    assert.strictEqual(limit.type, 'LIMIT');
    assert.strictEqual(limit.price, 75000);
  });

  it('routes bybit STOP_LIMIT through Buy/Sell mapping', async () => {
    const order = await svc.placeOrder('bybit', {
      symbol: 'BTCUSDT',
      side: 'SELL',
      type: 'STOP_LIMIT',
      size: 0.5,
      price: 69900,
      stopPrice: 70000,
    });
    assert.strictEqual(order.exchange, 'bybit');
    assert.strictEqual(order.side, 'SELL');
    assert.strictEqual(order.status, 'DRY_RUN');
  });
});
