---
name: bybit-spot
description: Bybit Spot trading - any pair, market/limit/stop orders, balances
emoji: "🟧"
commands:
  - /bys
  - /bybit-spot
gates:
  envs:
    - BYBIT_API_KEY
---

# Bybit Spot

Trade any spot pair on Bybit. Reuses the unified `BYBIT_API_KEY` /
`BYBIT_API_SECRET` (the same keys also work for futures via the `bybit` skill —
the API call category is set per-request).

```bash
/bys balance
/bys price BTCUSDT
/bys buy BTCUSDT 0.001
/bys limit ETHUSDT sell 0.05 4500
```

## Commands

| Command | Description |
|---------|-------------|
| `/bys balance` | Spot wallet balances |
| `/bys price <symbol>` | Last price |
| `/bys book <symbol>` | Top-of-book depth |
| `/bys markets [search]` | Available spot pairs |
| `/bys buy <symbol> <qty> [price]` | Market or limit buy |
| `/bys sell <symbol> <qty> [price]` | Market or limit sell |
| `/bys limit <symbol> <buy\|sell> <qty> <price>` | Explicit limit |
| `/bys stop <symbol> <buy\|sell> <qty> <stopPx> <limitPx>` | Stop-limit |
| `/bys orders [symbol]` | Open orders |
| `/bys cancel <symbol> <orderId>` | Cancel by id |
| `/bys cancelall [symbol]` | Cancel all |
| `/bys trades [symbol] [limit]` | Execution history |
| `/bys history [symbol] [limit]` | Order history |
