---
name: mexc-spot
description: MEXC Spot trading - any pair, market/limit/stop orders, balances
emoji: "🟦"
commands:
  - /ms
  - /mexc-spot
gates:
  envs:
    - MEXC_API_KEY
---

# MEXC Spot

Trade any spot pair on MEXC. Uses the same `MEXC_API_KEY` / `MEXC_API_SECRET`
as the futures skill — but spot calls hit the separate `api.mexc.com` endpoint.

```bash
/ms balance
/ms price BTCUSDT
/ms buy BTCUSDT 0.001
/ms limit ETHUSDT sell 0.05 4500
```

## Commands

| Command | Description |
|---------|-------------|
| `/ms balance` | Spot wallet balances |
| `/ms price <symbol>` | Last price |
| `/ms book <symbol>` | Top-of-book depth |
| `/ms markets [search]` | Available spot pairs |
| `/ms buy <symbol> <qty> [price]` | Market or limit buy |
| `/ms sell <symbol> <qty> [price]` | Market or limit sell |
| `/ms limit <symbol> <buy\|sell> <qty> <price>` | Explicit limit |
| `/ms stop <symbol> <buy\|sell> <qty> <stopPx> <limitPx>` | Stop-limit |
| `/ms orders [symbol]` | Open orders |
| `/ms cancel <symbol> <orderId>` | Cancel by id |
| `/ms cancelall <symbol>` | Cancel all for a symbol |
| `/ms trades <symbol> [limit]` | Execution history |
| `/ms history <symbol> [limit]` | Order history |
