/**
 * Unified Spot Trading Skill (/spot)
 *
 * Cross-exchange spot trading. Mirrors the layout of trading-futures but
 * without leverage/margin/funding.
 */

const SUPPORTED_EXCHANGES = ['binance', 'bybit', 'mexc', 'hyperliquid'] as const;
type Exchange = typeof SUPPORTED_EXCHANGES[number];

function helpText(): string {
  return [
    '**Spot Trading Commands**',
    '',
    '**Orders:**',
    '  /spot buy <symbol> <qty> [--price P] [--exchange X]',
    '  /spot sell <symbol> <qty> [--price P] [--exchange X]',
    '  /spot limit <symbol> <buy|sell> <qty> <price> [--exchange X]',
    '  /spot stop <symbol> <buy|sell> <qty> <stopPx> <limitPx> [--exchange X]',
    '  /spot cancel <symbol> <orderId> [--exchange X]',
    '  /spot cancelall [--symbol SYM] [--exchange X]',
    '',
    '**Info:**',
    '  /spot balance [--exchange X]',
    '  /spot price <symbol> [--exchange X]',
    '  /spot book <symbol> [--exchange X]',
    '  /spot markets [--exchange X] [--search BTC]',
    '  /spot orders [--symbol SYM] [--exchange X]',
    '  /spot trades [symbol] [--exchange X] [--limit 20]',
    '  /spot history [symbol] [--exchange X] [--limit 20]',
    '  /spot exchanges',
    '',
    'Exchanges: binance, bybit, mexc, hyperliquid',
    'Symbol formats: BTCUSDT (CEX) | HYPE/USDC (Hyperliquid spot)',
  ].join('\n');
}

function parseFlag(parts: string[], flag: string, def?: string): string | undefined {
  const idx = parts.indexOf(flag);
  if (idx === -1 || !parts[idx + 1]) return def;
  const val = parts[idx + 1];
  if (val.startsWith('--')) return def;
  return val;
}

function validateExchange(exchange: string, configured: string[]): string | null {
  if (!(SUPPORTED_EXCHANGES as readonly string[]).includes(exchange)) {
    return `Unknown exchange '${exchange}'. Supported: ${SUPPORTED_EXCHANGES.join(', ')}`;
  }
  if (!configured.includes(exchange)) {
    return `Exchange '${exchange}' not configured. Configured: ${configured.join(', ') || 'none'}`;
  }
  return null;
}

/**
 * For Hyperliquid keep the BASE/QUOTE form; for CEXs uppercase as-is.
 */
function normalizeSymbol(symbol: string, exchange: Exchange): string {
  if (exchange === 'hyperliquid') return symbol.toUpperCase();
  return symbol.toUpperCase();
}

function fmt(n: number, d = 4): string {
  if (!isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(d);
}

async function execute(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase() || 'help';

  if (cmd === 'help' || cmd === '') return helpText();

  const spotMod = await import('../../../trading/spot/index');
  const { service } = await spotMod.setupFromEnv();
  const configured = service.getExchanges();

  if (cmd === 'exchanges') {
    if (configured.length === 0) {
      return 'No spot exchanges configured. Set BINANCE_API_KEY / BYBIT_API_KEY / MEXC_API_KEY / HYPERLIQUID_WALLET.';
    }
    return `**Configured spot exchanges:** ${configured.join(', ')}`;
  }

  if (configured.length === 0) {
    return 'No spot exchanges configured. Set BINANCE_API_KEY / BYBIT_API_KEY / MEXC_API_KEY / HYPERLIQUID_WALLET.';
  }
  const defaultExchange = (configured[0] ?? 'binance') as Exchange;
  const exchange = (parseFlag(parts, '--exchange', defaultExchange) || defaultExchange) as Exchange;
  const exErr = validateExchange(exchange, configured);
  if (exErr && !['balance'].includes(cmd)) return exErr;

  switch (cmd) {
    case 'balance': {
      const flagEx = parseFlag(parts, '--exchange');
      if (flagEx) {
        const err = validateExchange(flagEx, configured);
        if (err) return err;
        const balances = await service.getBalance(flagEx as Exchange);
        if (balances.length === 0) return `No spot balances on ${flagEx}`;
        const lines = [`**${flagEx} Spot Balances**`, ''];
        for (const b of balances) lines.push(`  ${b.asset}: ${fmt(b.total)} (free ${fmt(b.free)})`);
        return lines.join('\n');
      }
      const all = await service.getAllBalances();
      if (all.length === 0) return 'No spot balances on any configured exchange';
      const lines = ['**Spot Balances (all exchanges)**', ''];
      const byEx = new Map<string, typeof all>();
      for (const b of all) {
        const arr = byEx.get(b.exchange) ?? [];
        arr.push(b);
        byEx.set(b.exchange, arr);
      }
      for (const [ex, list] of byEx) {
        lines.push(`  ${ex}:`);
        for (const b of list) lines.push(`    ${b.asset}: ${fmt(b.total)} (free ${fmt(b.free)})`);
      }
      return lines.join('\n');
    }

    case 'price': {
      const symbol = parts[1];
      if (!symbol) return 'Usage: /spot price <symbol> [--exchange X]';
      const p = await service.getTickerPrice(exchange, normalizeSymbol(symbol, exchange));
      return `${symbol.toUpperCase()} (${exchange}): $${fmt(p, 6)}`;
    }

    case 'book': {
      const symbol = parts[1];
      if (!symbol) return 'Usage: /spot book <symbol> [--exchange X]';
      const b = await service.getOrderBook(exchange, normalizeSymbol(symbol, exchange), 5);
      const lines = [`**${symbol.toUpperCase()} Order Book (${exchange})**`, ''];
      lines.push('  Asks:');
      for (const [px, qty] of b.asks.slice(0, 5).reverse()) lines.push(`    ${fmt(px, 6)} × ${fmt(qty)}`);
      lines.push('  Bids:');
      for (const [px, qty] of b.bids.slice(0, 5)) lines.push(`    ${fmt(px, 6)} × ${fmt(qty)}`);
      return lines.join('\n');
    }

    case 'markets': {
      const search = parseFlag(parts, '--search');
      let list = await service.getMarkets(exchange);
      if (search) {
        const s = search.toUpperCase();
        list = list.filter((m) => m.symbol.toUpperCase().includes(s));
      }
      const lines = [`**${exchange} Spot Markets (${list.length})**`, ''];
      for (const m of list.slice(0, 30)) lines.push(`  ${m.symbol} (${m.baseAsset}/${m.quoteAsset})`);
      if (list.length > 30) lines.push(`  …and ${list.length - 30} more`);
      return lines.join('\n');
    }

    case 'buy':
    case 'sell': {
      const symbol = parts[1];
      const qty = parseFloat(parts[2]);
      if (!symbol || !isFinite(qty) || qty <= 0) {
        return `Usage: /spot ${cmd} <symbol> <qty> [--price P] [--exchange X]`;
      }
      const priceStr = parseFlag(parts, '--price');
      const price = priceStr ? parseFloat(priceStr) : undefined;
      const order = await service.placeOrder(exchange, {
        symbol: normalizeSymbol(symbol, exchange),
        side: cmd === 'buy' ? 'BUY' : 'SELL',
        type: price ? 'LIMIT' : 'MARKET',
        size: qty,
        price,
      });
      const px = order.avgFillPrice || price || 0;
      return `${cmd === 'buy' ? '🟢' : '🔴'} ${cmd.toUpperCase()} ${order.symbol} (${exchange}) | ${order.size} ${px ? `@ $${fmt(px, 6)}` : 'MARKET'} | order ${order.id} (${order.status})`;
    }

    case 'limit': {
      const symbol = parts[1];
      const sideStr = parts[2]?.toUpperCase();
      const qty = parseFloat(parts[3]);
      const price = parseFloat(parts[4]);
      if (!symbol || (sideStr !== 'BUY' && sideStr !== 'SELL') || !isFinite(qty) || !isFinite(price)) {
        return 'Usage: /spot limit <symbol> <buy|sell> <qty> <price> [--exchange X]';
      }
      const order = await service.placeOrder(exchange, {
        symbol: normalizeSymbol(symbol, exchange),
        side: sideStr,
        type: 'LIMIT',
        size: qty,
        price,
      });
      return `${sideStr === 'BUY' ? '🟢' : '🔴'} LIMIT ${sideStr} ${order.symbol} (${exchange}) | ${qty} @ $${fmt(price, 6)} | order ${order.id} (${order.status})`;
    }

    case 'stop': {
      const symbol = parts[1];
      const sideStr = parts[2]?.toUpperCase();
      const qty = parseFloat(parts[3]);
      const stopPx = parseFloat(parts[4]);
      const limitPx = parseFloat(parts[5]);
      if (
        !symbol ||
        (sideStr !== 'BUY' && sideStr !== 'SELL') ||
        ![qty, stopPx, limitPx].every((n) => isFinite(n) && n > 0)
      ) {
        return 'Usage: /spot stop <symbol> <buy|sell> <qty> <stopPx> <limitPx> [--exchange X]';
      }
      const order = await service.placeOrder(exchange, {
        symbol: normalizeSymbol(symbol, exchange),
        side: sideStr,
        type: 'STOP_LIMIT',
        size: qty,
        price: limitPx,
        stopPrice: stopPx,
      });
      return `Stop-limit ${sideStr} ${order.symbol} (${exchange}) | ${qty} @ stop $${fmt(stopPx, 6)} → limit $${fmt(limitPx, 6)} | order ${order.id}`;
    }

    case 'orders': {
      const symbol = parseFlag(parts, '--symbol');
      const list = await service.getOpenOrders(exchange, symbol);
      if (list.length === 0) return `No open spot orders on ${exchange}`;
      const lines = [`**${exchange} Spot Open Orders**`, ''];
      for (const o of list) {
        lines.push(`  [${o.id}] ${o.side} ${o.symbol} | ${o.size} @ $${fmt(o.price ?? 0, 6)} | ${o.type} (${o.status})`);
      }
      return lines.join('\n');
    }

    case 'cancel': {
      const symbol = parts[1];
      const orderId = parts[2];
      if (!symbol || !orderId) return 'Usage: /spot cancel <symbol> <orderId> [--exchange X]';
      const ok = await service.cancelOrder(exchange, normalizeSymbol(symbol, exchange), orderId);
      return ok ? `Cancelled ${symbol.toUpperCase()} order ${orderId} on ${exchange}` : `Cancel failed for order ${orderId}`;
    }

    case 'cancelall': {
      const symbol = parseFlag(parts, '--symbol');
      const n = await service.cancelAll(exchange, symbol);
      return `Cancelled ${n} order(s) on ${exchange}${symbol ? ` for ${symbol.toUpperCase()}` : ''}`;
    }

    case 'trades': {
      const symbol = parts[1] && !parts[1].startsWith('--') ? parts[1] : undefined;
      const limitStr = parseFlag(parts, '--limit');
      const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
      const list = await service.getTradeHistory(exchange, symbol, lim);
      if (list.length === 0) return `No trades on ${exchange}`;
      const lines = [`**${exchange} Spot Trades**`, ''];
      for (const t of list) {
        lines.push(`  ${new Date(t.time).toLocaleString()} | ${t.side} ${t.symbol} ${fmt(t.qty)} @ $${fmt(t.price, 6)} (fee ${fmt(t.fee, 6)} ${t.feeAsset})`);
      }
      return lines.join('\n');
    }

    case 'history': {
      const symbol = parts[1] && !parts[1].startsWith('--') ? parts[1] : undefined;
      const limitStr = parseFlag(parts, '--limit');
      const lim = limitStr ? Math.max(1, Math.min(500, parseInt(limitStr, 10))) : 20;
      const list = await service.getOrderHistory(exchange, symbol, lim);
      if (list.length === 0) return `No order history on ${exchange}`;
      const lines = [`**${exchange} Spot Order History**`, ''];
      for (const o of list) {
        lines.push(`  [${o.id}] ${o.side} ${o.symbol} ${o.size} @ $${fmt(o.price ?? 0, 6)} | ${o.type} (${o.status})`);
      }
      return lines.join('\n');
    }

    default:
      return helpText();
  }
}

const skill = {
  name: 'trading-spot',
  description: 'Spot trading on Binance, Bybit, MEXC, Hyperliquid (any pair)',
  commands: ['/spot'],

  async handle(args: string): Promise<string> {
    try {
      return await execute(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Spot error: ${message}`;
    }
  },
};

export default skill;
