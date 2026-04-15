---
name: trading-spot
description: "Trade spot pairs on Binance, Bybit, MEXC, Hyperliquid - any pair, market/limit/stop"
emoji: "🪙"
gates:
  envs:
    anyOf:
      - BINANCE_API_KEY
      - BYBIT_API_KEY
      - MEXC_API_KEY
      - HYPERLIQUID_PRIVATE_KEY
---

# Spot Trading

Cross-exchange spot trading. Same env vars as `/futures` — `BINANCE_API_KEY`,
`BYBIT_API_KEY`, `MEXC_API_KEY` (your spot permission must be enabled),
`HYPERLIQUID_WALLET` + `HYPERLIQUID_PRIVATE_KEY`.

For DEX swaps (Solana, EVM), use `/jupiter`, `/raydium`, `/uniswap`, `/1inch`.

## Commands

```
/spot balance [--exchange X]
/spot price <symbol> [--exchange X]
/spot book <symbol> [--exchange X]
/spot markets [--exchange X] [--search BTC]
/spot buy <symbol> <qty> [--price P] [--exchange X]
/spot sell <symbol> <qty> [--price P] [--exchange X]
/spot limit <symbol> <buy|sell> <qty> <price> [--exchange X]
/spot stop <symbol> <buy|sell> <qty> <stopPx> <limitPx> [--exchange X]
/spot orders [--symbol SYM] [--exchange X]
/spot cancel <symbol> <orderId> [--exchange X]
/spot cancelall [--symbol SYM] [--exchange X]
/spot trades [symbol] [--exchange X] [--limit 20]
/spot history [symbol] [--exchange X] [--limit 20]
/spot exchanges
```

## Symbol formats

- Binance / Bybit / MEXC: `BTCUSDT`, `ETHUSDT`, `SOLUSDC`
- Hyperliquid spot: `HYPE/USDC`, `PURR/USDC` (or bare `HYPE` — auto-resolves)

## Examples

```
/spot balance                                    # all exchanges
/spot price BTCUSDT --exchange binance
/spot buy BTCUSDT 0.001                          # market buy on default exchange
/spot limit ETHUSDT sell 0.05 4500 --exchange bybit
/spot buy HYPE/USDC 5 --exchange hyperliquid
```
