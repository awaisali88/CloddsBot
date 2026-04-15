---
name: binance-spot
description: Binance Spot trading - any pair, market/limit/stop orders, balances
emoji: "🪙"
commands:
  - /bs
  - /binance-spot
gates:
  envs:
    - BINANCE_API_KEY
---

# Binance Spot

Trade any spot pair on Binance. Uses the same `BINANCE_API_KEY` / `BINANCE_API_SECRET`
as the futures skill — the API key needs **spot trading permission** enabled on
Binance.

## Quick Start

```bash
export BINANCE_API_KEY="..."
export BINANCE_API_SECRET="..."

/bs balance
/bs price BTCUSDT
/bs buy BTCUSDT 0.001
/bs limit BTCUSDT sell 0.001 75000
```

## Commands

| Command | Description |
|---------|-------------|
| `/bs balance` | Spot wallet balances |
| `/bs price <symbol>` | Last price for a pair |
| `/bs book <symbol>` | Top-of-book depth |
| `/bs markets [search]` | List spot pairs (filterable) |
| `/bs buy <symbol> <qty> [price]` | Market or limit buy |
| `/bs sell <symbol> <qty> [price]` | Market or limit sell |
| `/bs limit <symbol> <buy\|sell> <qty> <price>` | Explicit limit order |
| `/bs stop <symbol> <buy\|sell> <qty> <stopPrice> <limitPrice>` | Stop-limit |
| `/bs orders [symbol]` | Open orders |
| `/bs cancel <symbol> <orderId>` | Cancel by id |
| `/bs cancelall <symbol>` | Cancel all for a symbol |
| `/bs trades <symbol> [limit]` | Recent trade history |
| `/bs history <symbol> [limit]` | Order history |
