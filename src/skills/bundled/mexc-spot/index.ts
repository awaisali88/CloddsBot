/**
 * MEXC Spot Skill
 */

import * as ms from '../../../exchanges/mexc-spot';
import { logger } from '../../../utils/logger';

function getConfig(): ms.MexcSpotConfig | null {
  const apiKey = process.env.MEXC_API_KEY;
  const apiSecret = process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    dryRun: process.env.DRY_RUN === 'true',
  };
}

function fmt(n: number, d = 4): string {
  if (!isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(d);
}

const NEED = 'Set MEXC_API_KEY and MEXC_API_SECRET (with spot permission enabled).';

function parseSide(s?: string): 'BUY' | 'SELL' | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'BUY' || u === 'B') return 'BUY';
  if (u === 'SELL' || u === 'S') return 'SELL';
  return null;
}

async function balance(): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const list = await ms.getBalance(c);
  if (list.length === 0) return 'No spot balances';
  const lines = ['**MEXC Spot Balances**', ''];
  for (const b of list) {
    lines.push(`  ${b.asset}: ${fmt(b.total)} (free ${fmt(b.free)}, locked ${fmt(b.locked)})`);
  }
  return lines.join('\n');
}

async function price(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /ms price <symbol>';
  const p = await ms.getPrice(c, symbol.toUpperCase());
  return `${symbol.toUpperCase()}: $${fmt(p, 6)}`;
}

async function book(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /ms book <symbol>';
  const b = await ms.getOrderBook(c, symbol.toUpperCase(), 5);
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
  let list = await ms.getMarkets(c);
  if (search) {
    const s = search.toUpperCase();
    list = list.filter((m) => m.symbol.includes(s));
  }
  const lines = [`**MEXC Spot Markets (${list.length})**`, ''];
  for (const m of list.slice(0, 30)) lines.push(`  ${m.symbol} (${m.baseAsset}/${m.quoteAsset})`);
  if (list.length > 30) lines.push(`  …and ${list.length - 30} more`);
  return lines.join('\n');
}

async function trade(side: 'BUY' | 'SELL', symbol?: string, qtyStr?: string, priceStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol || !qtyStr) return `Usage: /ms ${side.toLowerCase()} <symbol> <qty> [price]`;
  const qty = parseFloat(qtyStr);
  if (!isFinite(qty) || qty <= 0) return 'Invalid qty';
  const price = priceStr ? parseFloat(priceStr) : undefined;
  if (priceStr && (!price || !isFinite(price) || price <= 0)) return 'Invalid price';
  const sym = symbol.toUpperCase();
  const result = price
    ? await ms.placeLimitOrder(c, sym, side, qty, price)
    : await ms.placeMarketOrder(c, sym, side, qty);
  return `${side === 'BUY' ? '🟢' : '🔴'} ${side} ${sym} | ${result.origQty} ${price ? `@ $${fmt(price, 6)}` : 'MARKET'} | order ${result.orderId} (${result.status})`;
}

async function limit(symbol?: string, sideStr?: string, qtyStr?: string, priceStr?: string): Promise<string> {
  const side = parseSide(sideStr);
  if (!side) return 'Usage: /ms limit <symbol> <buy|sell> <qty> <price>';
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
    return 'Usage: /ms stop <symbol> <buy|sell> <qty> <stopPrice> <limitPrice>';
  }
  const qty = parseFloat(qtyStr);
  const stopPx = parseFloat(stopStr);
  const limitPx = parseFloat(limitStr);
  if (![qty, stopPx, limitPx].every((n) => isFinite(n) && n > 0)) return 'Invalid numbers';
  const result = await ms.placeStopLimitOrder(c, symbol.toUpperCase(), side, qty, stopPx, limitPx);
  return `Stop-limit ${side} ${symbol.toUpperCase()} | ${qty} @ stop $${fmt(stopPx, 6)} → limit $${fmt(limitPx, 6)} | order ${result.orderId}`;
}

async function orders(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  const list = await ms.getOpenOrders(c, symbol?.toUpperCase());
  if (list.length === 0) return 'No open spot orders';
  const lines = ['**MEXC Spot Open Orders**', ''];
  for (const o of list) {
    lines.push(`  [${o.orderId}] ${o.side} ${o.symbol} | ${o.origQty} @ $${fmt(o.price, 6)} | ${o.type} (${o.status})`);
  }
  return lines.join('\n');
}

async function cancel(symbol?: string, orderId?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol || !orderId) return 'Usage: /ms cancel <symbol> <orderId>';
  await ms.cancelOrder(c, symbol.toUpperCase(), orderId);
  return `Cancelled ${symbol.toUpperCase()} order ${orderId}`;
}

async function cancelAll(symbol?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /ms cancelall <symbol>';
  const n = await ms.cancelAllOrders(c, symbol.toUpperCase());
  return `Cancelled ${n} order(s) on ${symbol.toUpperCase()}`;
}

async function trades(symbol?: string, limitStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /ms trades <symbol> [limit]';
  const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
  const list = await ms.getTradeHistory(c, symbol.toUpperCase(), lim);
  if (list.length === 0) return 'No trades';
  const lines = [`**${symbol.toUpperCase()} Trades**`, ''];
  for (const t of list) {
    const side = t.side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    lines.push(`  ${new Date(t.time).toLocaleString()} | ${side} ${fmt(t.qty)} @ $${fmt(t.price, 6)} (fee ${fmt(t.commission, 6)} ${t.commissionAsset})`);
  }
  return lines.join('\n');
}

async function history(symbol?: string, limitStr?: string): Promise<string> {
  const c = getConfig();
  if (!c) return NEED;
  if (!symbol) return 'Usage: /ms history <symbol> [limit]';
  const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
  const list = await ms.getOrderHistory(c, symbol.toUpperCase(), lim);
  if (list.length === 0) return 'No order history';
  const lines = [`**${symbol.toUpperCase()} Order History**`, ''];
  for (const o of list) {
    lines.push(`  [${o.orderId}] ${o.side} ${o.origQty} @ $${fmt(o.price, 6)} | ${o.type} (${o.status})`);
  }
  return lines.join('\n');
}

const HELP = [
  '**MEXC Spot** (/ms)',
  '',
  '  /ms balance | /ms price <sym> | /ms book <sym> | /ms markets [search]',
  '  /ms buy <sym> <qty> [price] | /ms sell <sym> <qty> [price]',
  '  /ms limit <sym> <buy|sell> <qty> <price>',
  '  /ms stop <sym> <buy|sell> <qty> <stopPx> <limitPx>',
  '  /ms orders [sym] | /ms cancel <sym> <id> | /ms cancelall <sym>',
  '  /ms trades <sym> [limit] | /ms history <sym> [limit]',
].join('\n');

const skill = {
  name: 'mexc-spot',
  description: 'MEXC Spot trading (any pair, market/limit/stop)',
  commands: ['/ms', '/mexc-spot'],

  async handle(args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    try {
      switch (cmd) {
        case 'balance': case 'bal': return balance();
        case 'price': case 'p': return price(parts[1]);
        case 'book': case 'depth': return book(parts[1]);
        case 'markets': case 'm': return markets(parts[1]);
        case 'buy': return trade('BUY', parts[1], parts[2], parts[3]);
        case 'sell': return trade('SELL', parts[1], parts[2], parts[3]);
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
      logger.error({ error: message, args }, 'MEXC Spot command failed');
      return `Error: ${message}`;
    }
  },
};

export default skill;
