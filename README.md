# EVE FINANCE — White-Label Trading Platform

**Build your own brokerage.** Multi-currency, real-time HK/US stock trading, FX conversion, double-entry ledger, and admin ops — all behind a single API.

> **Production-ready v3.0** | Running on [sub.readinghero.xyz](https://sub.readinghero.xyz/eve-finance/v3/health)

---

## Architecture

| Component | Stack |
|-----------|-------|
| API | FastAPI (Python 3.10+) |
| Database | SQLite (dev) → PostgreSQL (prod) |
| Auth | OAuth2 Bearer Token / Anonymous Demo |
| US Stocks | Alpaca Markets (real-time) |
| HK Stocks | Eastmoney + Tencent (real-time, no API key) |
| Realtime | WebSocket (channel-based subscriptions) |
| Webhooks | HMAC-SHA256 signed delivery |

## Services

| Version | Port | HTTPS Endpoint | Status |
|---------|------|----------------|--------|
| v3.0 (current) | `:8802` | `/eve-finance/v3/` | ✅ Active |
| v2.1 (legacy) | `:8800` | `/eve-finance/` | ✅ Compatible |

## Quick Start

```bash
# No API key needed — anonymous demo accounts pre-loaded
# USD $100,000 + HKD HK$1,000,000 paper balance

# 1. List accounts
curl https://sub.readinghero.xyz/eve-finance/v3/accounts

# 2. Search assets
curl "https://sub.readinghero.xyz/eve-finance/v3/assets?query=0700&market=HK"

# 3. Get real-time quotes
curl "https://sub.readinghero.xyz/eve-finance/v3/market/quotes?symbols=AAPL,0700.HK"

# 4. Preview an order
curl -X POST https://sub.readinghero.xyz/eve-finance/v3/orders/preview \
  -H "Content-Type: application/json" \
  -d '{"account_id":"acc_...","symbol":"0700.HK","side":"buy","qty":"100"}'

# 5. Place an order (paper trade — HK fills locally with live prices)
curl -X POST https://sub.readinghero.xyz/eve-finance/v3/orders \
  -H "Content-Type: application/json" \
  -d '{"account_id":"acc_...","symbol":"0700.HK","side":"buy","qty":"100"}'

# 6. Account summary (NAV, cash by currency, positions)
curl https://sub.readinghero.xyz/eve-finance/v3/accounts/{id}/summary
```

## API Overview

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v3/oauth/token` | OAuth2 client_credentials |
| — | *Anonymous* | No auth required for demo |

### Market Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v3/assets` | Asset search (US/HK, lot_size, trade status) |
| `GET` | `/v3/market/quotes` | Real-time quotes (Alpaca US + Tencent HK) |
| `GET` | `/v3/market/snapshots` | Stock snapshots (price, change, volume) |
| `GET` | `/v3/market/bars` | Historical OHLCV bars |
| `GET` | `/v3/market/clock` | Market status US + HK |

### Accounts & Ledger

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v3/accounts` | List trading accounts |
| `GET` | `/v3/accounts/{id}/summary` | Net liquidation, cash breakdown, NAV |
| `GET` | `/v3/accounts/{id}/ledger` | Immutable double-entry ledger |

### Trading

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v3/orders/preview` | Pre-trade validation + fee estimate |
| `POST` | `/v3/orders` | Submit order (market/limit/stop) |
| `PATCH` | `/v3/orders/{id}` | Modify open order |
| `DELETE` | `/v3/orders/{id}` | Cancel order |
| `DELETE` | `/v3/orders` | Cancel all open orders |
| `GET` | `/v3/orders` | Order history |
| `GET` | `/v3/fills` | Trade fills |
| `GET` | `/v3/positions` | Current positions |
| `DELETE` | `/v3/positions/{symbol}` | Close a position |

### FX

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v3/fx/rates` | Indicative FX rates |
| `POST` | `/v3/fx/quotes` | Executable FX quote (30s expiry) |
| `POST` | `/v3/fx/conversions` | Execute FX conversion |

### Funding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v3/funding/deposits` | Create deposit instruction |
| `GET` | `/v3/funding/deposits/{id}` | Deposit status |
| `POST` | `/v3/funding/withdrawals` | Withdrawal request |
| `GET` | `/v3/funding/withdrawals/{id}` | Withdrawal status |

### Fees

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v3/fees/estimate` | Detailed fee breakdown |

### WebSocket

```
ws://host:8802/v3/ws?token={bearer_token}
```

Subscribe to real-time channels: `orders:{account_id}`, `positions:{account_id}`, `quotes:{symbol}`

Events: `order.filled`, `order.accepted`, `order.cancelled`, `fx_conversion.completed`, `deposit.posted`, `withdrawal.created`

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v3/admin/clients` | Create client |
| `PATCH` | `/v3/admin/clients/{id}` | Update client |
| `POST` | `/v3/admin/accounts` | Create trading account |
| `POST` | `/v3/admin/ledger-adjustments` | Manual ledger adjustment |
| `POST` | `/v3/admin/deposits/{id}/approve` | Approve deposit |
| `POST` | `/v3/admin/withdrawals/{id}/approve` | Approve withdrawal |
| `GET` | `/v3/admin/deposits` | Deposit queue |
| `GET` | `/v3/admin/withdrawals` | Withdrawal queue |
| `POST` | `/v3/admin/reconciliation/run` | Run reconciliation |
| `GET` | `/v3/admin/reconciliation/breaks` | Reconciliation breaks |
| `POST` | `/v3/admin/kill-switch` | Emergency trading halt |
| `GET` | `/v3/admin/audit-events` | Immutable audit log |

## HK Stock Trading

HK stocks use **dynamic lot sizes** (not fixed at 100):

| Stock | Code | Lot Size |
|-------|------|----------|
| Tencent | `0700.HK` | 100 |
| Alibaba | `9988.HK` | 100 |
| Meituan | `3690.HK` | 100 |
| HSBC | `0005.HK` | 400 |
| AIA | `1299.HK` | 200 |
| Xiaomi | `1810.HK` | 200 |
| CCB | `0939.HK` | 1,000 |
| BOC | `3988.HK` | 1,000 |

**Fee structure:**

| Fee | Rate | Note |
|-----|------|------|
| Commission | 0.20% | Default |
| Stamp Duty | 0.13% | Buy only |
| SFC Levy | 0.00278% | Both sides |
| Trading Fee | 0.00565% | Both sides |
| Settlement | 0.002% (HK$2–100) | Both sides |

**Limit order behavior:** Buy limits below market and sell limits above market stay pending with reason in `status_history`.

## Idempotency

All state-changing endpoints accept `Idempotency-Key` headers for safe retries:

```bash
curl -X POST .../v3/orders \
  -H "Idempotency-Key: $(uuidgen)"
```

## Event System

WebSocket broadcasts + webhook delivery fire automatically on:
- `order.filled` / `order.accepted` / `order.cancelled`
- `fx_conversion.completed`
- `deposit.posted`
- `withdrawal.created`

Webhooks are HMAC-SHA256 signed with `X-EVE-Signature: v1={sig}` header.

## Error Format

All errors follow a standard envelope:

```json
{
  "detail": {
    "error": {
      "code": "UNKNOWN_SYMBOL",
      "message": "Symbol not found",
      "details": {},
      "retryable": false,
      "docs_path": "/errors/UNKNOWN_SYMBOL"
    }
  }
}
```

## Development

```bash
cd backend_v3
pip install -r requirements.txt
python main_v3.py
# → Listening on 0.0.0.0:8802
```

---

<p align="center">
  <b>EVE FINANCE</b> — Built for brokers, by traders.
</p>
