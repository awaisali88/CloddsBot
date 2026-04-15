/**
 * Bybit Spot Skill
 */

import * as bs from '../../../exchanges/bybit-spot';
import { logger } from '../../../utils/logger';

function getConfig(): bs.BybitSpotConfig | null {
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

function fmt(n: number, d = 4): string {
  if (!isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(d);
}

const NEED = 'Set BYBIT_API_KEY and BYBIT_API_SECRET (with spot permission enabled).';

function parseSide(s?: string): 'Buy' | 'Sell' | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'BUY' || u === 'B') return 'Buy';
  if (u === 'SELL' || u === 'S') return 'Sell';
  return null;
}

async function balance(): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const list = await bs.getBalance(c);
  if (list.length === 0) return 'No spot balances';
  const lines = ['**Bybit Spot Balances**', ''];
  for (const b of list) {
    lines.push(`  ${b.coin}: ${fmt(b.total)} (free ${fmt(b.free)}, locked ${fmt(b.locked)})`);
  }
  return lines.join('\n');
}

async function price(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /bys price <symbol>';
  const p = await bs.getPrice(c, symbol.toUpperCase());
  return `${symbol.toUpperCase()}: $${fmt(p, 6)}`;
}

async function book(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /bys book <symbol>';
  const b = await bs.getOrderBook(c, symbol.toUpperCase(), 5);
  const lines = [`**${symbol.toUpperCase()} Order Book**`, ''];
  lines.push('  Asks:');
  for (const [px, qty] of b.asks.slice(0, 5).reverse()) lines.push(`    ${fmt(px, 6)} × ${fmt(qty)}`);
  lines.push('  Bids:');
  for (const [px, qty] of b.bids.slice(0, 5)) lines.push(`    ${fmt(px, 6)} × ${fmt(qty)}`);
  return lines.join('\n');
}

async function markets(search?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  let list = await bs.getMarkets(c);
  if (search) {
    const s = search.toUpperCase();
    list = list.filter((m) => m.symbol.includes(s));
  }
  const lines = [`**Bybit Spot Markets (${list.length})**`, ''];
  for (const m of list.slice(0, 30)) lines.push(`  ${m.symbol} (${m.baseAsset}/${m.quoteAsset})`);
  if (list.length > 30) lines.push(`  …and ${list.length - 30} more`);
  return lines.join('\n');
}

async function trade(side: 'Buy' | 'Sell', symbol?: string, qtyStr?: string, priceStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol || !qtyStr) return `Usage: /bys ${side.toLowerCase()} <symbol> <qty> [price]`;
  const qty = parseFloat(qtyStr);
  if (!isFinite(qty) || qty <= 0) return 'Invalid qty';
  const price = priceStr ? parseFloat(priceStr) : undefined;
  if (priceStr && (!price || !isFinite(price) || price <= 0)) return 'Invalid price';
  const sym = symbol.toUpperCase();
  const result = price
    ? await bs.placeLimitOrder(c, sym, side, qty, price)
    : await bs.placeMarketOrder(c, sym, side, qty);
  return `${side === 'Buy' ? '🟢' : '🔴'} ${side} ${sym} | ${qty} ${price ? `@ $${fmt(price, 6)}` : 'MARKET'} | order ${result.orderId} (${result.orderStatus})`;
}

async function limit(symbol?: string, sideStr?: string, qtyStr?: string, priceStr?: string): Promise<string> {
  const side = parseSide(sideStr);
  if (!side) return 'Usage: /bys limit <symbol> <buy|sell> <qty> <price>';
  return trade(side, symbol, qtyStr, priceStr);
}

async function stop(
  symbol?: string,
  sideStr?: string,
  qtyStr?: string,
  stopStr?: string,
  limitStr?: string
): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const side = parseSide(sideStr);
  if (!symbol || !side || !qtyStr || !stopStr || !limitStr) {
    return 'Usage: /bys stop <symbol> <buy|sell> <qty> <stopPrice> <limitPrice>';
  }
  const qty = parseFloat(qtyStr);
  const stopPx = parseFloat(stopStr);
  const limitPx = parseFloat(limitStr);
  if (![qty, stopPx, limitPx].every((n) => isFinite(n) && n > 0)) return 'Invalid numbers';
  const result = await bs.placeStopLimitOrder(c, symbol.toUpperCase(), side, qty, stopPx, limitPx);
  return `Stop-limit ${side} ${symbol.toUpperCase()} | ${qty} @ stop $${fmt(stopPx, 6)} → limit $${fmt(limitPx, 6)} | order ${result.orderId}`;
}

async function orders(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const list = await bs.getOpenOrders(c, symbol?.toUpperCase());
  if (list.length === 0) return 'No open spot orders';
  const lines = ['**Bybit Spot Open Orders**', ''];
  for (const o of list) {
    lines.push(`  [${o.orderId}] ${o.side} ${o.symbol} | ${o.qty} @ $${fmt(o.price, 6)} | ${o.orderType} (${o.orderStatus})`);
  }
  return lines.join('\n');
}

async function cancel(symbol?: string, orderId?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol || !orderId) return 'Usage: /bys cancel <symbol> <orderId>';
  await bs.cancelOrder(c, symbol.toUpperCase(), orderId);
  return `Cancelled ${symbol.toUpperCase()} order ${orderId}`;
}

async function cancelAll(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const n = await bs.cancelAllOrders(c, symbol?.toUpperCase());
  return `Cancelled ${n} order(s)${symbol ? ` on ${symbol.toUpperCase()}` : ''}`;
}

async function trades(symbol?: string, limitStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
  const list = await bs.getTradeHistory(c, symbol?.toUpperCase(), lim);
  if (list.length === 0) return 'No trades';
  const lines = ['**Bybit Spot Trades**', ''];
  for (const t of list) {
    const side = t.side === 'Buy' ? '🟢 BUY' : '🔴 SELL';
    lines.push(`  ${new Date(t.time).toLocaleString()} | ${side} ${t.symbol} ${fmt(t.qty)} @ $${fmt(t.price, 6)} (fee ${fmt(t.fee, 6)} ${t.feeAsset})`);
  }
  return lines.join('\n');
}

async function history(symbol?: string, limitStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
  const list = await bs.getOrderHistory(c, symbol?.toUpperCase(), lim);
  if (list.length === 0) return 'No order history';
  const lines = ['**Bybit Spot Order History**', ''];
  for (const o of list) {
    lines.push(`  [${o.orderId}] ${o.side} ${o.symbol} ${o.qty} @ $${fmt(o.price, 6)} | ${o.orderType} (${o.orderStatus})`);
  }
  return lines.join('\n');
}

const HELP = [
  '**Bybit Spot** (/bys)',
  '',
  '  /bys balance | /bys price <sym> | /bys book <sym> | /bys markets [search]',
  '  /bys buy <sym> <qty> [price] | /bys sell <sym> <qty> [price]',
  '  /bys limit <sym> <buy|sell> <qty> <price>',
  '  /bys stop <sym> <buy|sell> <qty> <stopPx> <limitPx>',
  '  /bys orders [sym] | /bys cancel <sym> <id> | /bys cancelall [sym]',
  '  /bys trades [sym] [limit] | /bys history [sym] [limit]',
].join('\n');

const skill = {
  name: 'bybit-spot',
  description: 'Bybit Spot trading (any pair, market/limit/stop)',
  commands: ['/bys', '/bybit-spot'],

  async handle(args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    try {
      switch (cmd) {
        case 'balance': case 'bal': return balance();
        case 'price': case 'p': return price(parts[1]);
        case 'book': case 'depth': return book(parts[1]);
        case 'markets': case 'm': return markets(parts[1]);
        case 'buy': return trade('Buy', parts[1], parts[2], parts[3]);
        case 'sell': return trade('Sell', parts[1], parts[2], parts[3]);
        case 'limit': return limit(parts[1], parts[2], parts[3], parts[4]);
        case 'stop': return stop(parts[1], parts[2], parts[3], parts[4], parts[5]);
        case 'orders': return orders(parts[1]);
        case 'cancel': return cancel(parts[1], parts[2]);
        case 'cancelall': return cancelAll(parts[1]);
        case 'trades': return trades(parts[1], parts[2]);
        case 'history': return history(parts[1], parts[2]);
        case undefined: case '': case 'help': default: return HELP;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, args }, 'Bybit Spot command failed');
      return `Error: ${message}`;
    }
  },
};

export default skill;
