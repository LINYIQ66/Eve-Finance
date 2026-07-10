"""
EVE FINANCE v3.0 — Main API Router
"""

import json, hashlib, time, uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_FLOOR
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import asyncio

from models_v3 import (
    get_db, V3Client, V3Account, V3Asset, V3Order, V3Fill, V3Position,
    V3LedgerTransaction, V3LedgerEntry, V3FundingInstruction, V3FxQuote,
    V3FxConversion, V3FeeRule, V3AuditEvent, V3IdempotencyKey, V3WebhookConfig,
    Tenant, get_cash_balances, seed_v3, gen_id,
)
from auth_v3 import get_authenticated_client, require_scope, require_admin, issue_token
from errors import eve_success, eve_paginated, eve_error, raise_eve
from schemas_v3 import *
from ws_manager_v3 import ws_manager
from webhook_v3 import fire_webhook_sync

from models_v3 import Tenant, gen_api_key, gen_secret

# ═══════════════════════════════════════════════
# QUOTE CACHE (3s TTL)
# ═══════════════════════════════════════════════
_quote_cache = {}
_quote_cache_time = {}

def get_cached_quote(symbols: str):
    """Return cached quote data if fresh (<3s)."""
    key = symbols.upper().replace(" ", "")
    now = time.time()
    entry = _quote_cache.get(key)
    ts = _quote_cache_time.get(key, 0)
    if entry and (now - ts) < 3:
        return entry
    return None

def set_quote_cache(symbols: str, data):
    key = symbols.upper().replace(" ", "")
    _quote_cache[key] = data
    _quote_cache_time[key] = time.time()


router = APIRouter(prefix="/v3")


def fire_broadcast(channel: str, event: str, data: dict):
    """Fire-and-forget WebSocket broadcast."""
    asyncio.ensure_future(ws_manager.broadcast(channel, event, data))

def fire_account_broadcast(account_id: str, event: str, data: dict):
    """Fire-and-forget account-level WebSocket broadcast and webhook.
    Works in both sync and async contexts."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(ws_manager.broadcast_account_event(account_id, event, data))
        else:
            asyncio.run(ws_manager.broadcast_account_event(account_id, event, data))
    except RuntimeError:
        asyncio.run(ws_manager.broadcast_account_event(account_id, event, data))
    fire_webhook_sync(event, data)


# ════════════════════════════════════════
# IDEMPOTENCY MIDDLEWARE HELPERS
# ════════════════════════════════════════

def check_idempotency(key: str, endpoint: str, db: Session):
    if not key:
        return None
    existing = db.query(V3IdempotencyKey).filter(
        V3IdempotencyKey.idempotency_key == key
    ).first()
    return existing

def store_idempotency(key: str, endpoint: str, payload_hash: str, response: dict, status_code: int, db: Session):
    if not key:
        return
    existing = db.query(V3IdempotencyKey).filter(
        V3IdempotencyKey.idempotency_key == key
    ).first()
    if existing:
        return
    entry = V3IdempotencyKey(
        idempotency_key=key,
        endpoint=endpoint,
        request_hash=payload_hash,
        response_body=response,
        status_code=status_code,
    )
    db.add(entry)
    db.commit()


def compute_hash(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def audit_log(db, actor, action, object_type, object_id, reason=None, request_id=None, before_hash=None, after_hash=None):
    """Create an immutable audit event."""
    event = V3AuditEvent(
        actor=actor,
        action=action,
        object_type=object_type,
        object_id=object_id,
        before_hash=before_hash,
        after_hash=after_hash,
        reason=reason,
        request_id=request_id,
    )
    db.add(event)
    db.flush()


# ════════════════════════════════════════
# HELPER: get account with auth check
# ════════════════════════════════════════

def resolve_account(account_id: str, auth: dict, db: Session) -> V3Account:
    acct = db.query(V3Account).filter(V3Account.id == account_id).first()
    if not acct:
        raise_eve("UNKNOWN_ACCOUNT")
    if acct.client_id != auth["client"].id:
        raise_eve("PERMISSION_DENIED")
    if acct.status != "active":
        raise_eve("ACCOUNT_SUSPENDED")
    return acct




def append_status(order, status: str, reason: str = None):
    """Append to order.status_history with proper SQLAlchemy JSON dirty marking."""
    from sqlalchemy.orm.attributes import flag_modified
    entry = {"status": status, "at": utcnow_str()}
    if reason:
        entry["reason"] = reason
    if order.status_history is None:
        order.status_history = []
    order.status_history.append(entry)
    flag_modified(order, "status_history")


def utcnow_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"




# ═══════════════════════════════════════════════
# AUTH: REGISTER (creates client + accounts)
# ═══════════════════════════════════════════════

@router.post("/auth/register")
def register_client(
    name: str = "Demo User",
    country: str = "HK",
    db: Session = Depends(get_db),
):
    """Register new demo accounts under Anonymous Demo client. No OAuth needed."""
    import secrets
    tenant = db.query(Tenant).first()
    client = db.query(V3Client).filter(V3Client.legal_name == "Anonymous Demo").first()
    if not client or not tenant:
        raise_eve("SERVICE_UNAVAILABLE", "Demo mode not configured")

    total_acc = db.query(V3Account).count()
    ref_id = secrets.token_hex(8)

    acct_usd = V3Account(
        tenant_id=tenant.id, client_id=client.id,
        account_number=f"EVE-{country}-{total_acc+1:04d}",
        type="cash", base_currency="USD",
        status="active", trading_permissions={"markets": ["US", "HK"], "order_types": ["market", "limit", "stop"]},
    )
    db.add(acct_usd)

    acct_hkd = V3Account(
        tenant_id=tenant.id, client_id=client.id,
        account_number=f"EVE-{country}-{total_acc+2:04d}",
        type="cash", base_currency="HKD",
        status="active", trading_permissions={"markets": ["HK"], "order_types": ["market", "limit", "stop"]},
    )
    db.add(acct_hkd)
    db.flush()

    # Seed with demo balance
    usd_ltx = V3LedgerTransaction(
        account_id=acct_usd.id, journal_type="deposit", status="posted",
        reference_type="seed", reference_id=ref_id,
    )
    db.add(usd_ltx)
    db.flush()
    db.add(V3LedgerEntry(
        transaction_id=usd_ltx.id, account_id=acct_usd.id,
        currency="USD", direction="credit",
        amount="100000.00", entry_type="principal",
        value_date=datetime.now(timezone.utc),
    ))

    hkd_ltx = V3LedgerTransaction(
        account_id=acct_hkd.id, journal_type="deposit", status="posted",
        reference_type="seed", reference_id=ref_id,
    )
    db.add(hkd_ltx)
    db.flush()
    db.add(V3LedgerEntry(
        transaction_id=hkd_ltx.id, account_id=acct_hkd.id,
        currency="HKD", direction="credit",
        amount="1000000.00", entry_type="principal",
        value_date=datetime.now(timezone.utc),
    ))

    db.commit()
    db.refresh(acct_usd)
    db.refresh(acct_hkd)

    return eve_success({
        "accounts": [
            {"id": acct_usd.id, "currency": "USD", "number": acct_usd.account_number},
            {"id": acct_hkd.id, "currency": "HKD", "number": acct_hkd.account_number},
        ],
    })


# ═══════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════

@router.get("/health")
def health():
    return eve_success({
        "status": "ok",
        "service": "EVE FINANCE",
        "version": "3.0.0",
        "supported_markets": ["US", "HK"],
        "supported_currencies": ["USD", "HKD"],
    })


# ═══════════════════════════════════════════════

# WEBSOCKET

# ═══════════════════════════════════════════════



@router.websocket("/ws")

async def websocket_endpoint(websocket: WebSocket, token: str = ""):

    conn = await ws_manager.connect(websocket, token)

    if conn is None:

        return

    for conn_id, c in list(ws_manager.connections.items()):

        if c.websocket == websocket:

            await ws_manager.handle_messages(conn_id)

            break




# ═══════════════════════════════════════════════
# OAUTH
# ═══════════════════════════════════════════════

@router.post("/oauth/token")
def oauth_token(
    grant_type: str = "client_credentials",
    scope: str = "market:read accounts:read",
    authorization: str = Header(""),
    db: Session = Depends(get_db),
):
    # Require valid client_id:client_secret via Basic auth
    import base64
    if authorization.startswith("Basic "):
        try:
            decoded = base64.b64decode(authorization[6:]).decode()
            client_id, client_secret = decoded.split(":", 1)
        except Exception:
            raise_eve("AUTHENTICATION_REQUIRED", "Invalid Authorization header format")
        client = db.query(V3Client).filter(V3Client.id == client_id, V3Client.api_secret == client_secret).first()
        if not client:
            raise_eve("AUTHENTICATION_REQUIRED", "Invalid client credentials")
    else:
        # Anonymous fallback for demo
        client = db.query(V3Client).filter(V3Client.legal_name == "Anonymous Demo").first()
        if not client:
            raise_eve("AUTHENTICATION_REQUIRED", "No demo client available")
    scopes = scope.split()
    return issue_token(client.id, scopes)


# ═══════════════════════════════════════════════
# ASSETS
# ═══════════════════════════════════════════════

@router.get("/assets")
def search_assets(
    query: str = "",
    market: str = "",
    status: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    q = db.query(V3Asset)
    if query:
        q = q.filter(
            V3Asset.symbol.ilike(f"%{query}%") |
            V3Asset.name.ilike(f"%{query}%")
        )
    if market:
        if market == "HK":
            q = q.filter(V3Asset.exchange == "SEHK")
        elif market == "US":
            q = q.filter(V3Asset.exchange.in_(["NASDAQ", "NYSE", "AMEX", "ARCA"]))
    if status:
        q = q.filter(V3Asset.trade_status == status)
    assets = q.limit(50).all()
    return eve_success([AssetOut.from_orm(a) for a in assets])


# ═══════════════════════════════════════════════
# MARKET DATA
# ═══════════════════════════════════════════════

@router.get("/market/quotes")
def get_quotes(
    symbols: str = Query(...),
    fields: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    # Cache (3s TTL)
    cached = get_cached_quote(symbols)
    if cached:
        return cached
    """Get latest quotes. Uses eve-stock-app for HK, Alpaca for US."""
    import httpx
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    results = []

    for sym in symbol_list:
        asset = db.query(V3Asset).filter(V3Asset.symbol == sym).first()
        if not asset:
            continue
        last_price = "0.00"
        bid = "0.00"
        ask = "0.00"
        bid_size = "0"
        ask_size = "0"

        if sym.endswith(".HK"):
            # HK: eve-stock-app
            hk_code = sym.replace(".HK", "").zfill(5)
            try:
                r = httpx.get(f"http://127.0.0.1:8801/api/hk/quote", params={"codes": hk_code}, timeout=5)
                if r.status_code == 200:
                    quotes = r.json().get("quotes", [])
                    if quotes:
                        last_price = str(quotes[0].get("price", 0))
                        bid = str(quotes[0].get("bid", 0))
                        ask = str(quotes[0].get("ask", 0))
                        bid_size = str(quotes[0].get("bid_size", 0))
                        ask_size = str(quotes[0].get("ask_size", 0))
            except Exception:
                pass
        else:
            # US: Alpaca
            try:
                r = httpx.get(
                    f"https://data.alpaca.markets/v2/stocks/{sym}/quotes/latest",
                    headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                             "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                    timeout=5
                )
                if r.status_code == 200:
                    q = r.json().get("quote", {})
                    bid = str(q.get("bp", 0))
                    ask = str(q.get("ap", 0))
                    bid_size = str(q.get("bs", 0))
                    ask_size = str(q.get("as", 0))
                    # Get last trade
                    tr = httpx.get(
                        f"https://data.alpaca.markets/v2/stocks/{sym}/trades/latest",
                        headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                                 "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                        timeout=5
                    )
                    if tr.status_code == 200:
                        t = tr.json().get("trade", {})
                        last_price = str(t.get("p", 0))
            except Exception:
                pass

        results.append({
            "symbol": sym,
            "currency": asset.currency,
            "last": last_price,
            "bid": bid,
            "ask": ask,
            "bid_size": bid_size,
            "ask_size": ask_size,
            "lot_size": asset.lot_size,
            "delayed": False,
            "as_of": utcnow_str(),
        })
    set_quote_cache(symbols, eve_success(results))
    return eve_success(results)


@router.get("/market/clock")
def market_clock(auth: dict = Depends(get_authenticated_client)):
    """Market clock for US + HK."""
    import pytz
    from datetime import datetime
    now_utc = datetime.now(timezone.utc)
    now_et = now_utc.astimezone(pytz.timezone("US/Eastern"))
    now_hkt = now_utc.astimezone(pytz.timezone("Asia/Hong_Kong"))

    def is_market_open(dt, open_h, open_m, close_h, close_m):
        minutes = dt.hour * 60 + dt.minute
        open_min = open_h * 60 + open_m
        close_min = close_h * 60 + close_m
        return open_min <= minutes < close_min and dt.weekday() < 5

    return eve_success({
        "us": {
            "open": is_market_open(now_et, 9, 30, 16, 0),
            "timezone": "US/Eastern",
            "local_time": now_et.strftime("%H:%M"),
        },
        "hk": {
            "open": is_market_open(now_hkt, 9, 30, 16, 0),
            "timezone": "Asia/Hong_Kong",
            "local_time": now_hkt.strftime("%H:%M"),
        },
    })


# ═══════════════════════════════════════════════
# ACCOUNTS
# ═══════════════════════════════════════════════

@router.get("/accounts")
def list_accounts(auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    accounts = db.query(V3Account).filter(V3Account.client_id == auth["client"].id).all()
    return eve_success([AccountOut.from_orm(a) for a in accounts])


@router.get("/accounts/{account_id}/summary")
def account_summary(
    account_id: str,
    base_currency: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    acct = resolve_account(account_id, auth, db)
    balances = get_cash_balances(db, acct.id)

    # Positions
    positions = db.query(V3Position).filter(V3Position.account_id == acct.id).all()
    pos_value = Decimal("0")
    pos_list = []
    for p in positions:
        mv = Decimal(p.market_value or "0")
        pos_value += mv
        pos_list.append(PositionOut(
            symbol=p.symbol, qty=p.qty or "0",
            avg_entry_price=p.avg_entry_price or "0",
            market_value=p.market_value or "0",
            unrealized_pl=p.unrealized_pl or "0",
            unrealized_plpc=p.unrealized_plpc or "0",
        ))

    cash_total = Decimal("0")
    cash_by_ccy = []
    for ccy, bal in balances.items():
        total = Decimal(bal["total"])
        cash_total += total
        cash_by_ccy.append(CashBalanceOut(
            currency=ccy,
            total=bal["total"],
            available=bal["available"],
            withdrawable=bal["withdrawable"],
            reserved=bal["reserved"],
        ))

    net_liq = cash_total + pos_value
    bp = cash_total * Decimal("1.2")  # simplified

    return eve_success(AccountSummaryOut(
        account_id=acct.id,
        base_currency=acct.base_currency,
        net_liquidation=f"{net_liq:.2f}",
        cash_total=f"{cash_total:.2f}",
        positions_market_value=f"{pos_value:.2f}",
        buying_power=f"{bp:.2f}",
        cash_by_currency=cash_by_ccy,
        valuation_fx_time=utcnow_str(),
    ))


@router.get("/accounts/{account_id}/ledger")
def get_ledger(
    account_id: str,
    currency: str = "",
    from_date: str = "",
    to_date: str = "",
    limit: int = 100,
    cursor: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    acct = resolve_account(account_id, auth, db)
    q = db.query(V3LedgerEntry).filter(V3LedgerEntry.account_id == acct.id)
    if currency:
        q = q.filter(V3LedgerEntry.currency == currency)
    entries = q.order_by(V3LedgerEntry.posted_at.desc()).limit(limit + 1).all()

    has_more = len(entries) > limit
    if has_more:
        entries = entries[:limit]

    return eve_success(
        [
            LedgerEntryOut(
                entry_id=e.id,
                transaction_id=e.transaction_id,
                account_id=e.account_id,
                currency=e.currency,
                direction=e.direction,
                amount=e.amount,
                entry_type=e.entry_type,
                reference_type=None,
                reference_id=None,
                posted_at=e.posted_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                value_date=e.value_date,
                running_balance=e.running_balance,
            )
            for e in entries
        ],
        meta={"has_more": has_more, "limit": limit},
    )


# ═══════════════════════════════════════════════
# POSITIONS
# ═══════════════════════════════════════════════

@router.get("/positions")
def list_positions(
    account_id: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if account_id:
        acct = resolve_account(account_id, auth, db)
        positions = db.query(V3Position).filter(V3Position.account_id == acct.id).all()
    else:
        positions = db.query(V3Position).join(V3Account).filter(
            V3Account.client_id == auth["client"].id
        ).all()
    return eve_success([PositionOut(
        symbol=p.symbol, qty=p.qty or "0",
        avg_entry_price=p.avg_entry_price or "0",
        market_value=p.market_value or "0",
        unrealized_pl=p.unrealized_pl or "0",
        unrealized_plpc=p.unrealized_plpc or "0",
    ) for p in positions])


# ═══════════════════════════════════════════════
# FX RATES
# ═══════════════════════════════════════════════

@router.get("/fx/rates")
def get_fx_rates(
    base: str = "USD",
    quotes: str = "HKD,SGD,EUR",
    auth: dict = Depends(get_authenticated_client),
):
    """Indicative FX rates."""
    import httpx
    try:
        r = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        if r.status_code != 200:
            raise_eve("UPSTREAM_UNAVAILABLE", "FX rate service unavailable")
        usd_rates = r.json().get("rates", {})
    except Exception:
        usd_rates = {"HKD": 7.85, "SGD": 1.287, "EUR": 0.92}

    quote_list = [q.strip() for q in quotes.split(",") if q.strip()]
    rates = []
    for qc in quote_list:
        rate = usd_rates.get(qc, 1.0)
        bid = float(rate) * 0.999
        ask = float(rate) * 1.001
        rates.append({
            "quote": qc,
            "bid": f"{bid:.4f}",
            "ask": f"{ask:.4f}",
            "mid": f"{rate:.4f}",
            "as_of": utcnow_str(),
        })
    return eve_success({
        "base": base,
        "rates": rates,
        "source": "upstream_aggregated",
    })


@router.post("/fx/quotes")
def create_fx_quote(
    body: FxQuoteReq,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    """Create an executable FX quote."""
    acct = resolve_account(body.account_id, auth, db)
    if body.from_currency not in acct.enabled_currencies:
        raise_eve("INVALID_REQUEST", f"Currency {body.from_currency} not enabled for account")

    # Get rate
    import httpx
    try:
        r = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        usd_rates = r.json().get("rates", {}) if r.status_code == 200 else {"HKD": 7.85, "SGD": 1.287}
    except Exception:
        usd_rates = {"HKD": 7.85, "SGD": 1.287}

    def to_usd(ccy):
        return 1.0 if ccy == "USD" else (1.0 / usd_rates.get(ccy, 1.0))
    def from_usd(ccy):
        return 1.0 if ccy == "USD" else usd_rates.get(ccy, 1.0)

    mid_rate_raw = from_usd(body.to_currency) / to_usd(body.from_currency) if body.from_currency != "USD" else from_usd(body.to_currency)
    spread = 0.003  # 30 bps
    client_rate = mid_rate_raw * (1 - spread) if body.from_currency == "USD" else mid_rate_raw * (1 - spread)
    # Actually: client_rate = mid * (1 - spread) for USD->HKD
    if body.from_currency == "USD":
        client_rate = mid_rate_raw * (1 - spread)
    else:
        client_rate = mid_rate_raw / (1 + spread)

    from_amt = Decimal(body.from_amount)
    to_amt = from_amt * Decimal(str(client_rate))
    fx_fee = from_amt * Decimal("0.0002")  # 2bps fee
    debit_total = from_amt + fx_fee

    quote = V3FxQuote(
        account_id=acct.id,
        from_currency=body.from_currency,
        to_currency=body.to_currency,
        from_amount=body.from_amount,
        gross_rate=f"{mid_rate_raw:.6f}",
        client_rate=f"{client_rate:.6f}",
        spread_bps="30.00",
        fee_amount=f"{fx_fee:.2f}",
        fee_currency=body.from_currency,
        to_amount=f"{to_amt:.2f}",
        debit_total=f"{debit_total:.2f}",
        expires_at=datetime.now(timezone.utc) + __import__("datetime").timedelta(seconds=30),
    )
    db.add(quote)
    db.commit()
    db.refresh(quote)

    return eve_success(FxQuoteOut(
        quote_id=quote.id,
        status="active",
        from_currency=quote.from_currency,
        to_currency=quote.to_currency,
        from_amount=quote.from_amount,
        gross_rate=quote.gross_rate,
        client_rate=quote.client_rate,
        spread_bps=quote.spread_bps,
        fee={"amount": quote.fee_amount, "currency": quote.fee_currency},
        to_amount=quote.to_amount,
        debit_total=quote.debit_total,
        expires_at=quote.expires_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))


@router.post("/fx/conversions")
def execute_fx_conversion(
    body: FxConversionReq,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
    req: Request = None,
):
    """Execute a previously quoted FX conversion."""
    # Idempotency check
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/fx/conversions", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    quote = db.query(V3FxQuote).filter(V3FxQuote.id == body.quote_id).first()
    if not quote:
        raise_eve("RESOURCE_NOT_FOUND", "FX quote not found")
    if quote.status != "active":
        raise_eve("FX_QUOTE_EXPIRED")
    # Compare using timestamps to avoid offset-aware/naive issues with SQLite
    expires_ts = quote.expires_at.timestamp() if hasattr(quote.expires_at, 'timestamp') else float('inf')
    if time.time() > expires_ts:
        quote.status = "expired"
        db.commit()
        raise_eve("FX_QUOTE_EXPIRED")

    acct = resolve_account(quote.account_id, auth, db)
    quote.status = "executed"

    # Create double-entry ledger transaction
    ltx = V3LedgerTransaction(
        account_id=acct.id,
        journal_type="fx_conversion",
        status="posted",
        value_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        reference_type="fx_conversion",
        reference_id=quote.id,
        source_system="eve",
    )
    db.add(ltx)
    db.flush()

    # Debit source currency
    total_debit = Decimal(quote.debit_total)
    source_entry = V3LedgerEntry(
        transaction_id=ltx.id, account_id=acct.id,
        currency=quote.from_currency, direction="debit",
        amount=f"{total_debit:.2f}", entry_type="fx_conversion_principal",
        value_date=ltx.value_date,
    )
    db.add(source_entry)

    # Credit destination currency
    to_amt = Decimal(quote.to_amount)
    dest_entry = V3LedgerEntry(
        transaction_id=ltx.id, account_id=acct.id,
        currency=quote.to_currency, direction="credit",
        amount=f"{to_amt:.2f}", entry_type="fx_conversion_principal",
        value_date=ltx.value_date,
    )
    db.add(dest_entry)

    # Fee entry
    fee_amt = Decimal(quote.fee_amount)
    if fee_amt > 0:
        fee_entry = V3LedgerEntry(
            transaction_id=ltx.id, account_id=acct.id,
            currency=quote.fee_currency or quote.from_currency,
            direction="debit", amount=f"{fee_amt:.2f}",
            entry_type="fee",
            value_date=ltx.value_date,
        )
        db.add(fee_entry)

    conversion = V3FxConversion(
        quote_id=quote.id,
        account_id=acct.id,
        from_currency=quote.from_currency,
        from_amount=quote.from_amount,
        to_currency=quote.to_currency,
        to_amount=quote.to_amount,
        fee_amount=quote.fee_amount,
        fee_currency=quote.fee_currency,
        ledger_transaction_id=ltx.id,
        client_conversion_id=body.client_conversion_id,
    )
    db.add(conversion)
    db.commit()
    # Broadcast FX conversion
    fire_account_broadcast(acct.id, "fx_conversion.completed", {})

    db.refresh(conversion)

    # Store idempotency
    if x_idempotency_key:
        resp = eve_success(FxConversionOut(
            conversion_id=conversion.id, status="completed",
            from_info={"currency": quote.from_currency, "amount": quote.from_amount},
            to_info={"currency": quote.to_currency, "amount": quote.to_amount},
            fee={"currency": quote.fee_currency or quote.from_currency, "amount": quote.fee_amount},
            ledger_transaction_id=ltx.id,
            executed_at=conversion.executed_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        ))
        store_idempotency(x_idempotency_key, "POST /v3/fx/conversions",
                         compute_hash(body.dict()), resp, 200, db)

    return eve_success(FxConversionOut(
        conversion_id=conversion.id, status="completed",
        from_info={"currency": quote.from_currency, "amount": quote.from_amount},
        to_info={"currency": quote.to_currency, "amount": quote.to_amount},
        fee={"currency": quote.fee_currency or quote.from_currency, "amount": quote.fee_amount},
        ledger_transaction_id=ltx.id,
        executed_at=conversion.executed_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))


# ═══════════════════════════════════════════════
# ORDER PREVIEW
# ═══════════════════════════════════════════════

@router.post("/orders/preview")
def order_preview(
    body: OrderPreviewReq,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    acct = resolve_account(body.account_id, auth, db)
    symbol = body.symbol.upper()

    asset = db.query(V3Asset).filter(V3Asset.symbol == symbol).first()
    if not asset:
        raise_eve("UNKNOWN_SYMBOL", symbol=symbol)

    qty = Decimal(body.qty)
    lot_size = asset.lot_size

    # Lot size validation
    if asset.exchange == "SEHK" and not asset.odd_lot_supported:
        if qty % lot_size != 0:
            raise_eve("INVALID_LOT_SIZE", details={
                "symbol": symbol, "qty": body.qty, "lot_size": lot_size,
            })

    # Get price
    import httpx
    current_price = Decimal("0")
    if symbol.endswith(".HK"):
        try:
            hk_code = symbol.replace(".HK", "").zfill(5)
            r = httpx.get(f"http://127.0.0.1:8801/api/hk/quote", params={"codes": hk_code}, timeout=5)
            if r.status_code == 200:
                quotes = r.json().get("quotes", [])
                if quotes:
                    current_price = Decimal(str(quotes[0].get("price", 0)))
        except Exception:
            pass
    else:
        try:
            r = httpx.get(
                f"https://data.alpaca.markets/v2/stocks/{symbol}/trades/latest",
                headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                         "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                timeout=5
            )
            if r.status_code == 200:
                trade = r.json().get("trade", {})
                current_price = Decimal(str(trade.get("p", 0)))
        except Exception:
            pass

    notional = qty * current_price

    # Fee estimate
    fee_rate = Decimal("0.002")
    commission = notional * fee_rate
    total_fees = commission

    if symbol.endswith(".HK"):
        stamp_duty = notional * Decimal("0.0013")
        trading_fee = notional * Decimal("0.0000565")
        sfc_levy = notional * Decimal("0.0000278")
        settlement_fee = max(Decimal("2"), min(Decimal("100"), notional * Decimal("0.00002")))
        total_fees = commission + stamp_duty + trading_fee + sfc_levy + settlement_fee

    cash_required = notional + total_fees

    balances = get_cash_balances(db, acct.id)
    available = Decimal(balances.get(asset.currency, {}).get("available", "0"))

    warnings = []
    if cash_required > available:
        warnings.append("Insufficient buying power")
    if asset.exchange == "SEHK" and lot_size > 1 and qty % lot_size != 0:
        warnings.append(f"Quantity must be multiple of {lot_size}")

    preview_id = gen_id("opv_")
    return eve_success(OrderPreviewOut(
        preview_id=preview_id,
        valid_until=utcnow_str(),
        estimated_notional=f"{notional:.2f}",
        estimated_fees={
            "commission": f"{commission:.2f}",
            "total": f"{total_fees:.2f}",
            "currency": asset.currency,
        },
        estimated_cash_required=f"{cash_required:.2f}",
        available_cash=f"{available:.2f}",
        lot_size=lot_size,
        warnings=warnings,
        can_submit=len(warnings) == 0,
    ))


# ═══════════════════════════════════════════════
# SUBMIT ORDER
# ═══════════════════════════════════════════════

@router.post("/orders")
def submit_order(
    body: OrderCreate,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/orders", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    acct = resolve_account(body.account_id, auth, db)
    symbol = body.symbol.upper()
    qty = Decimal(body.qty)

    asset = db.query(V3Asset).filter(V3Asset.symbol == symbol).first()
    if not asset:
        raise_eve("UNKNOWN_SYMBOL")

    # Lot check
    if asset.exchange == "SEHK" and not asset.odd_lot_supported:
        if qty % asset.lot_size != 0:
            raise_eve("INVALID_LOT_SIZE", details={
                "symbol": symbol, "qty": body.qty, "lot_size": asset.lot_size,
            })

    now = utcnow_str()
    order = V3Order(
        account_id=acct.id,
        client_order_id=body.client_order_id,
        idempotency_key=x_idempotency_key,
        symbol=symbol,
        side=body.side,
        order_type=body.order_type,
        qty=body.qty,
        limit_price=body.limit_price,
        stop_price=body.stop_price,
        time_in_force=body.time_in_force,
        session=body.session,
        status="received",
        status_history=[{"status": "received", "at": now}],
        parent_order_id=body.parent_order_id,
        oca_group_id=body.oca_group_id,
        preview_id=body.preview_id,
    )
    db.add(order)
    db.flush()

    # Try to fill immediately for HK stocks (local match)
    if symbol.endswith(".HK"):
        order.status = "accepted"
        order.status_history.append({"status": "accepted", "at": utcnow_str()})

        import httpx
        hk_code = symbol.replace(".HK", "").zfill(5)
        try:
            r = httpx.get(f"http://127.0.0.1:8801/api/hk/quote", params={"codes": hk_code}, timeout=5)
            if r.status_code == 200:
                quotes = r.json().get("quotes", [])
                if quotes:
                    price = Decimal(str(quotes[0].get("price", 0)))

                    # ── Price validation for limit/stop orders ──
                    limit_price = Decimal(body.limit_price) if body.limit_price else None
                    stop_price = Decimal(body.stop_price) if body.stop_price else None

                    if body.order_type in ("limit", "limit_post_only") and limit_price is not None:
                        if body.side == "buy" and limit_price < price:
                            # Buy limit below market — should not fill
                            order.status = "accepted"
                            order.limit_price = body.limit_price
                            append_status(order, "pending", f"limit_price {limit_price} < market {price}")
                            db.commit()
                            db.refresh(order)
                            resp = eve_success(OrderOut(
                                id=order.id, client_order_id=order.client_order_id,
                                symbol=order.symbol, side=order.side, order_type=order.order_type,
                                qty=order.qty, filled_qty="0", remaining_qty=order.qty,
                                limit_price=order.limit_price, stop_price=order.stop_price,
                                time_in_force=order.time_in_force,
                                status="accepted",
                                status_history=[OrderStatusHistory(status=s["status"], at=s["at"], reason=s.get("reason")) for s in (order.status_history or [])],
                                commission="0", reserved_cash=str(total_cost) if 'total_cost' in dir() else None,
                                reject_reason=None,
                                created_at=order.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                                updated_at=order.updated_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                            ))
                            if x_idempotency_key:
                                store_idempotency(x_idempotency_key, "POST /v3/orders", compute_hash(body.dict()), resp, 200, db)
                            return resp
                        elif body.side == "sell" and limit_price > price:
                            # Sell limit above market — should not fill
                            order.status = "accepted"
                            order.limit_price = body.limit_price
                            append_status(order, "pending", f"limit_price {limit_price} > market {price}")
                            db.commit()
                            db.refresh(order)
                            resp = eve_success(OrderOut(
                                id=order.id, client_order_id=order.client_order_id,
                                symbol=order.symbol, side=order.side, order_type=order.order_type,
                                qty=order.qty, filled_qty="0", remaining_qty=order.qty,
                                limit_price=order.limit_price, stop_price=order.stop_price,
                                time_in_force=order.time_in_force,
                                status="accepted",
                                status_history=[OrderStatusHistory(status=s["status"], at=s["at"], reason=s.get("reason")) for s in (order.status_history or [])],
                                commission="0", reserved_cash=None,
                                reject_reason=None,
                                created_at=order.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                                updated_at=order.updated_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                            ))
                            if x_idempotency_key:
                                store_idempotency(x_idempotency_key, "POST /v3/orders", compute_hash(body.dict()), resp, 200, db)
                            return resp

                    # Stop orders — only fill when market crosses stop
                    if body.order_type == "stop" and stop_price is not None:
                        if body.side == "buy" and price <= stop_price:
                            order.status = "accepted"
                            append_status(order, "pending", f"stop not triggered (market {price} >= stop {stop_price})")
                            db.commit()
                            return eve_success(OrderOut(...))
                        elif body.side == "sell" and price >= stop_price:
                            order.status = "accepted"
                            append_status(order, "pending", f"stop not triggered (market {price} <= stop {stop_price})")
                            db.commit()
                            return eve_success(OrderOut(...))

                    # Market order or limit order at/above market — fill normally
                    notional = qty * price
                    commission = notional * Decimal("0.002")
                    stamp_duty = notional * Decimal("0.0013")
                    trading_fee = notional * Decimal("0.0000565")
                    sfc_levy = notional * Decimal("0.0000278")
                    settlement = max(Decimal("2"), min(Decimal("100"), notional * Decimal("0.00002")))
                    total_fees = commission + stamp_duty + trading_fee + sfc_levy + settlement

                    order.status = "filled"
                    order.filled_qty = body.qty
                    order.remaining_qty = "0"
                    order.filled_avg_price = f"{price:.2f}"
                    order.commission = f"{commission:.2f}"
                    order.status_history.append({"status": "filled", "at": utcnow_str()})

                    fill = V3Fill(
                        order_id=order.id, account_id=acct.id,
                        symbol=symbol, side=body.side,
                        qty=body.qty, price=f"{price:.2f}",
                        fee=f"{total_fees:.2f}",
                        exchange="HKEX",
                        trade_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    )
                    db.add(fill)

                    # Create ledger entries
                    ltx = V3LedgerTransaction(
                        account_id=acct.id, journal_type="trade_cash",
                        status="posted", reference_type="order", reference_id=order.id,
                    )
                    db.add(ltx)
                    db.flush()

                    total_cost = notional + total_fees
                    if body.side == "buy":
                        db.add(V3LedgerEntry(
                            transaction_id=ltx.id, account_id=acct.id,
                            currency=asset.currency, direction="debit",
                            amount=f"{total_cost:.2f}", entry_type="principal",
                        ))
                    else:
                        net_proceeds = notional - total_fees
                        db.add(V3LedgerEntry(
                            transaction_id=ltx.id, account_id=acct.id,
                            currency=asset.currency, direction="credit",
                            amount=f"{net_proceeds:.2f}", entry_type="principal",
                        ))

                    # Update position
                    pos = db.query(V3Position).filter(
                        V3Position.account_id == acct.id,
                        V3Position.symbol == symbol,
                    ).first()
                    if body.side == "buy":
                        if pos:
                            old_cost = Decimal(pos.avg_entry_price or "0") * Decimal(pos.qty or "0")
                            new_cost = old_cost + notional
                            new_qty = Decimal(pos.qty or "0") + qty
                            pos.qty = f"{new_qty:.4f}"
                            pos.avg_entry_price = f"{new_cost / new_qty:.4f}" if new_qty > 0 else "0"
                        else:
                            pos = V3Position(
                                account_id=acct.id, symbol=symbol,
                                qty=body.qty, avg_entry_price=f"{price:.4f}",
                            )
                            db.add(pos)
                    else:
                        if pos:
                            new_qty = Decimal(pos.qty or "0") - qty
                            if new_qty <= 0:
                                db.delete(pos)
                            else:
                                pos.qty = f"{new_qty:.4f}"
        except Exception:
            order.status = "rejected"
            order.reject_reason = "UPSTREAM_UNAVAILABLE"
            order.status_history.append({"status": "rejected", "at": utcnow_str()})
    else:
        # US stocks: route to Alpaca
        order.status = "accepted"
        order.status_history.append({"status": "accepted", "at": utcnow_str()})
        try:
            import httpx
            payload = {
                "symbol": symbol, "qty": body.qty, "side": body.side,
                "type": body.order_type, "time_in_force": body.time_in_force,
            }
            if body.limit_price:
                payload["limit_price"] = body.limit_price
            if body.stop_price:
                payload["stop_price"] = body.stop_price
            r = httpx.post(
                "https://paper-api.alpaca.markets/v2/orders",
                json=payload,
                headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                         "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                timeout=10
            )
            if r.status_code in (200, 201):
                up = r.json()
                order.upstream_order_id = up.get("id", "")
                up_status = up.get("status", "accepted")
                order.status = up_status
                order.status_history.append({"status": up_status, "at": utcnow_str()})
                if up.get("filled_qty") and float(up["filled_qty"]) > 0:
                    order.filled_qty = up["filled_qty"]
                    order.remaining_qty = str(float(up["qty"]) - float(up["filled_qty"]))
                    order.filled_avg_price = up.get("filled_avg_price")
            else:
                order.status = "rejected"
                order.reject_reason = "UPSTREAM_REJECTED"
                order.status_history.append({"status": "rejected", "at": utcnow_str()})
        except Exception as e:
            order.status = "rejected"
            order.reject_reason = f"UPSTREAM_UNAVAILABLE: {str(e)[:100]}"
            order.status_history.append({"status": "rejected", "at": utcnow_str()})


    db.commit()
    # Broadcast order event
    if order.status in ("filled", "partially_filled"):
        fire_account_broadcast(order.account_id, f"order.{order.status}", {
            "order_id": order.id,
            "symbol": order.symbol,
            "side": order.side,
            "filled_qty": order.filled_qty or "0",
            "price": order.filled_avg_price or "0",
        })

    db.refresh(order)

    resp = eve_success(OrderOut(
        id=order.id,
        client_order_id=order.client_order_id,
        symbol=order.symbol,
        side=order.side,
        order_type=order.order_type,
        qty=order.qty,
        filled_qty=order.filled_qty or "0",
        remaining_qty=order.remaining_qty,
        limit_price=order.limit_price,
        stop_price=order.stop_price,
        time_in_force=order.time_in_force,
        status=order.status,
        status_history=[OrderStatusHistory(status=s["status"], at=s["at"], reason=s.get("reason")) for s in (order.status_history or [])],
        commission=order.commission,
        reserved_cash=order.reserved_cash,
        reject_reason=order.reject_reason,
        created_at=order.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        updated_at=order.updated_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))

    if x_idempotency_key:
        store_idempotency(x_idempotency_key, "POST /v3/orders",
                         compute_hash(body.dict()), resp, 200, db)

    return resp


# ═══════════════════════════════════════════════
# LIST / GET ORDERS
# ═══════════════════════════════════════════════

@router.get("/orders")
def list_orders(
    account_id: str = "",
    status: str = "",
    limit: int = 50,
    cursor: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    q = db.query(V3Order).join(V3Account).filter(V3Account.client_id == auth["client"].id)
    if account_id:
        q = q.filter(V3Order.account_id == account_id)
    if status:
        q = q.filter(V3Order.status == status)
    orders = q.order_by(V3Order.created_at.desc()).limit(limit).all()
    return eve_success([
        OrderOut(
            id=o.id, client_order_id=o.client_order_id,
            symbol=o.symbol, side=o.side, order_type=o.order_type,
            qty=o.qty, filled_qty=o.filled_qty or "0",
            remaining_qty=o.remaining_qty,
            limit_price=o.limit_price, stop_price=o.stop_price,
            time_in_force=o.time_in_force,
            status=o.status,
            status_history=[OrderStatusHistory(status=s["status"], at=s["at"], reason=s.get("reason")) for s in (o.status_history or [])],
            commission=o.commission, reserved_cash=o.reserved_cash,
            reject_reason=o.reject_reason,
            created_at=o.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            updated_at=o.updated_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        ) for o in orders
    ])


@router.get("/orders/{order_id}")
def get_order(order_id: str, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    order = db.query(V3Order).filter(V3Order.id == order_id).first()
    if not order:
        raise_eve("RESOURCE_NOT_FOUND")
    acct = db.query(V3Account).filter(V3Account.id == order.account_id).first()
    if acct.client_id != auth["client"].id:
        raise_eve("PERMISSION_DENIED")
    return eve_success(OrderOut(
        id=order.id, client_order_id=order.client_order_id,
        symbol=order.symbol, side=order.side, order_type=order.order_type,
        qty=order.qty, filled_qty=order.filled_qty or "0",
        remaining_qty=order.remaining_qty,
        limit_price=order.limit_price, stop_price=order.stop_price,
        time_in_force=order.time_in_force,
        status=order.status,
        status_history=[OrderStatusHistory(status=s["status"], at=s["at"], reason=s.get("reason")) for s in (order.status_history or [])],
        commission=order.commission, reserved_cash=order.reserved_cash,
        reject_reason=order.reject_reason,
        created_at=order.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        updated_at=order.updated_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))


# ═══════════════════════════════════════════════
# CANCEL / REPLACE ORDER
# ═══════════════════════════════════════════════

@router.delete("/orders/{order_id}")
def cancel_order(
    order_id: str,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, f"DELETE /v3/orders/{order_id}", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    order = db.query(V3Order).filter(V3Order.id == order_id).first()
    if not order:
        raise_eve("RESOURCE_NOT_FOUND")
    acct = db.query(V3Account).filter(V3Account.id == order.account_id).first()
    if acct.client_id != auth["client"].id:
        raise_eve("PERMISSION_DENIED")
    if order.status in ("filled", "cancelled", "rejected", "expired"):
        raise_eve("ORDER_NOT_MODIFIABLE")

    order.status = "cancelled"
    order.status_history.append({"status": "cancelled", "at": utcnow_str()})
    db.commit()

    resp = eve_success({"order_id": order.id, "status": "cancelled"})
    if x_idempotency_key:
        store_idempotency(x_idempotency_key, f"DELETE /v3/orders/{order_id}",
                         compute_hash({}), resp, 200, db)
    return resp


@router.patch("/orders/{order_id}")
def replace_order(
    order_id: str,
    body: OrderReplace,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, f"PATCH /v3/orders/{order_id}", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    order = db.query(V3Order).filter(V3Order.id == order_id).first()
    if not order:
        raise_eve("RESOURCE_NOT_FOUND")
    acct = db.query(V3Account).filter(V3Account.id == order.account_id).first()
    if acct.client_id != auth["client"].id:
        raise_eve("PERMISSION_DENIED")
    if order.status in ("filled", "cancelled", "rejected", "expired"):
        raise_eve("ORDER_NOT_MODIFIABLE")

    if body.qty is not None:
        order.qty = body.qty
    if body.limit_price is not None:
        order.limit_price = body.limit_price
    if body.stop_price is not None:
        order.stop_price = body.stop_price
    if body.time_in_force is not None:
        order.time_in_force = body.time_in_force
    order.version += 1
    order.status_history.append({"status": "accepted", "at": utcnow_str()})
    db.commit()

    resp = eve_success({"order_id": order.id, "status": "accepted", "version": order.version})
    if x_idempotency_key:
        store_idempotency(x_idempotency_key, f"PATCH /v3/orders/{order_id}",
                         compute_hash(body.dict()), resp, 200, db)
    return resp


# ═══════════════════════════════════════════════
# FILLS
# ═══════════════════════════════════════════════

@router.get("/fills")
def list_fills(
    account_id: str = "",
    limit: int = 50,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    q = db.query(V3Fill).join(V3Account).filter(V3Account.client_id == auth["client"].id)
    if account_id:
        q = q.filter(V3Fill.account_id == account_id)
    fills = q.order_by(V3Fill.created_at.desc()).limit(limit).all()
    return eve_success([FillOut(
        id=f.id, order_id=f.order_id, symbol=f.symbol, side=f.side,
        qty=f.qty, price=f.price, fee=f.fee or "0",
        exchange=f.exchange, trade_date=f.trade_date,
        created_at=f.created_at,
    ) for f in fills])


# ═══════════════════════════════════════════════
# FUNDING — DEPOSITS
# ═══════════════════════════════════════════════

@router.post("/funding/deposits")
def create_deposit(
    body: DepositCreate,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/funding/deposits", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    acct = resolve_account(body.account_id, auth, db)

    deposit = V3FundingInstruction(
        account_id=acct.id,
        type="deposit",
        status="awaiting_funds",
        currency=body.currency,
        expected_amount=body.expected_amount,
        method=body.method,
        sender_info=body.sender,
        client_reference=body.client_reference,
        bank_instruction={
            "beneficiary_name": "EVE FINANCE CLIENT MONEY",
            "bank_name": "Example Custodian Bank",
            "account_number_masked": "****9012",
            "swift": "EXAMPLEXXX",
            "reference": f"{acct.account_number}/{gen_id('DEP')}",
        },
        expires_at=datetime.now(timezone.utc).replace(hour=23, minute=59, second=59) + __import__("datetime").timedelta(days=7),
    )
    db.add(deposit)
    db.commit()
    db.refresh(deposit)

    resp = eve_success(DepositOut(
        deposit_id=deposit.id,
        status="awaiting_funds",
        currency=deposit.currency,
        expected_amount=deposit.expected_amount,
        bank_instruction=deposit.bank_instruction,
        fee="0.00",
        expires_at=deposit.expires_at.strftime("%Y-%m-%dT%H:%M:%SZ") if deposit.expires_at else None,
        created_at=deposit.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))

    if x_idempotency_key:
        store_idempotency(x_idempotency_key, "POST /v3/funding/deposits",
                         compute_hash(body.dict()), resp, 200, db)
    return resp


@router.get("/funding/deposits/{deposit_id}")
def get_deposit(deposit_id: str, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    dep = db.query(V3FundingInstruction).filter(
        V3FundingInstruction.id == deposit_id,
        V3FundingInstruction.type == "deposit",
    ).first()
    if not dep:
        raise_eve("RESOURCE_NOT_FOUND")
    return eve_success(DepositOut(
        deposit_id=dep.id, status=dep.status,
        currency=dep.currency, expected_amount=dep.expected_amount,
        posted_amount=dep.posted_amount,
        bank_instruction=dep.bank_instruction,
        fee=dep.fee or "0.00",
        expires_at=dep.expires_at.strftime("%Y-%m-%dT%H:%M:%SZ") if dep.expires_at else None,
        created_at=dep.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))


# ═══════════════════════════════════════════════
# FUNDING — WITHDRAWALS
# ═══════════════════════════════════════════════

@router.post("/funding/withdrawals")
def create_withdrawal(
    body: WithdrawalCreate,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/funding/withdrawals", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    acct = resolve_account(body.account_id, auth, db)
    balances = get_cash_balances(db, acct.id)
    bal = balances.get(body.currency, {})
    withdrawable = Decimal(bal.get("withdrawable", "0"))
    amount = Decimal(body.amount)
    fee = Decimal("15") if amount > 0 else Decimal("0")
    total_reserved = amount + fee

    if amount > withdrawable:
        raise_eve("INSUFFICIENT_BUYING_POWER", f"Withdrawable {body.currency} {bal.get('withdrawable', '0')}")

    wdr = V3FundingInstruction(
        account_id=acct.id, type="withdrawal",
        status="pending_approval",
        currency=body.currency,
        expected_amount=body.amount,
        fee=f"{fee:.2f}",
        method="bank_wire",
        client_reference=body.purpose,
    )
    db.add(wdr)
    db.flush()

    # Reserve funds via ledger
    ltx = V3LedgerTransaction(
        account_id=acct.id, journal_type="withdrawal",
        status="posted", reference_type="withdrawal", reference_id=wdr.id,
        reason_code="WITHDRAWAL_RESERVE",
    )
    db.add(ltx)
    db.flush()

    db.add(V3LedgerEntry(
        transaction_id=ltx.id, account_id=acct.id,
        currency=body.currency, direction="debit",
        amount=f"{total_reserved:.2f}",
        entry_type="principal",
    ))
    db.commit()
    db.refresh(wdr)

    resp = eve_success(WithdrawalOut(
        withdrawal_id=wdr.id, status="pending_approval",
        amount=body.amount, fee=f"{fee:.2f}",
        total_reserved=f"{total_reserved:.2f}",
        currency=body.currency,
        available_before=f"{withdrawable:.2f}",
        available_after_reservation=f"{withdrawable - total_reserved:.2f}",
        estimated_processing_date="2026-07-13",
        created_at=wdr.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))

    if x_idempotency_key:
        store_idempotency(x_idempotency_key, "POST /v3/funding/withdrawals",
                         compute_hash(body.dict()), resp, 200, db)
    return resp


@router.get("/funding/withdrawals/{withdrawal_id}")
def get_withdrawal(withdrawal_id: str, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    wdr = db.query(V3FundingInstruction).filter(
        V3FundingInstruction.id == withdrawal_id,
        V3FundingInstruction.type == "withdrawal",
    ).first()
    if not wdr:
        raise_eve("RESOURCE_NOT_FOUND")
    return eve_success(WithdrawalOut(
        withdrawal_id=wdr.id, status=wdr.status,
        amount=wdr.expected_amount, fee=wdr.fee or "0.00",
        total_reserved=wdr.expected_amount,
        currency=wdr.currency,
        available_before="0.00", available_after_reservation="0.00",
        created_at=wdr.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    ))


# ═══════════════════════════════════════════════
# FEE ESTIMATE
# ═══════════════════════════════════════════════

@router.post("/fees/estimate")
def fee_estimate(
    body: FeeEstimateReq,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    symbol = body.symbol.upper()
    asset = db.query(V3Asset).filter(V3Asset.symbol == symbol).first()
    if not asset:
        raise_eve("UNKNOWN_SYMBOL")

    price = Decimal(body.price)
    qty = Decimal(body.qty)
    notional = price * qty

    components = []
    total = Decimal("0")

    # Commission
    commission = notional * Decimal("0.002")
    components.append(FeeComponentOut(code="COMMISSION", amount=f"{commission:.2f}", rate="0.20%", beneficiary="tenant"))
    total += commission

    stamp_duty = Decimal("0")
    if symbol.endswith(".HK") and body.side == "buy":
        stamp_duty = notional * Decimal("0.0013")
        components.append(FeeComponentOut(code="STAMP_DUTY", amount=f"{stamp_duty:.2f}", rate="0.13%", beneficiary="authority"))
        total += stamp_duty

    if symbol.endswith(".HK"):
        trading_fee = notional * Decimal("0.0000565")
        sfc_levy = notional * Decimal("0.0000278")
        components.append(FeeComponentOut(code="TRADING_FEE", amount=f"{trading_fee:.2f}", beneficiary="exchange"))
        components.append(FeeComponentOut(code="TRANSACTION_LEVY", amount=f"{sfc_levy:.2f}", beneficiary="regulator"))
        total += trading_fee + sfc_levy

    return eve_success(FeeEstimateOut(
        currency=asset.currency,
        notional=f"{notional:.2f}",
        components=components,
        total=f"{total:.2f}",
        rule_version="HK_EQ_FEES_2026-07-01",
    ))


# ═══════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/admin/ledger-adjustments")
def create_ledger_adjustment(
    body: LedgerAdjustmentCreate,
    x_idempotency_key: Optional[str] = Header(None),
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/admin/ledger-adjustments", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    acct = db.query(V3Account).filter(V3Account.id == body.account_id).first()
    if not acct:
        raise_eve("RESOURCE_NOT_FOUND")

    ltx = V3LedgerTransaction(
        account_id=acct.id, journal_type="adjustment",
        status="posted", value_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        reference_type="admin_adjustment",
        reason_code=body.reason_code,
        description=body.description,
        source_system="admin",
        created_by=auth["client"].id,
    )
    db.add(ltx)
    db.flush()

    entry = V3LedgerEntry(
        transaction_id=ltx.id, account_id=acct.id,
        currency=body.currency,
        direction=body.direction,
        amount=body.amount,
        entry_type="principal",
        value_date=ltx.value_date,
    )
    db.add(entry)
    db.commit()

    audit_log(db, auth["client"].id, "LEDGER_ADJUSTMENT", "ledger_transaction", ltx.id,
             reason=body.description)

    resp = eve_success(LedgerAdjustmentOut(
        adjustment_id=ltx.id, status="posted", ledger_transaction_id=ltx.id,
    ))
    if x_idempotency_key:
        store_idempotency(x_idempotency_key, "POST /v3/admin/ledger-adjustments",
                         compute_hash(body.dict()), resp, 200, db)
    return resp


@router.post("/admin/deposits/{deposit_id}/approve")
def approve_deposit(
    deposit_id: str,
    body: AdminDepositApprove,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    dep = db.query(V3FundingInstruction).filter(
        V3FundingInstruction.id == deposit_id,
        V3FundingInstruction.type == "deposit",
    ).first()
    if not dep:
        raise_eve("RESOURCE_NOT_FOUND")

    dep.status = "posted"
    dep.posted_amount = body.approved_amount
    dep.value_date = body.value_date
    dep.external_transaction_id = body.bank_transaction_id
    dep.approved_by = auth["client"].id
    dep.approved_at = datetime.now(timezone.utc)

    # Create ledger transaction
    ltx = V3LedgerTransaction(
        account_id=dep.account_id, journal_type="deposit",
        status="posted", value_date=body.value_date,
        reference_type="deposit", reference_id=dep.id,
        source_system="eve",
    )
    db.add(ltx)
    db.flush()

    db.add(V3LedgerEntry(
        transaction_id=ltx.id, account_id=dep.account_id,
        currency=dep.currency, direction="credit",
        amount=body.approved_amount,
        entry_type="principal",
        value_date=body.value_date,
    ))
    dep.ledger_transaction_id = ltx.id
    db.commit()
    # Broadcast deposit
    fire_account_broadcast(dep.account_id, "deposit.posted", {})

    return eve_success({
        "deposit_id": dep.id,
        "status": "posted",
        "posted_amount": body.approved_amount,
        "currency": dep.currency,
        "ledger_transaction_id": ltx.id,
        "available_at": f"{body.value_date}T04:00:00Z",
        "approved_by": auth["client"].id,
        "approved_at": utcnow_str(),
    })


@router.get("/admin/deposits")
def admin_list_deposits(
    status: str = "",
    currency: str = "",
    min_amount: float = 0,
    sort: str = "-created_at",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    q = db.query(V3FundingInstruction).filter(V3FundingInstruction.type == "deposit")
    if status:
        q = q.filter(V3FundingInstruction.status == status)
    if currency:
        q = q.filter(V3FundingInstruction.currency == currency)
    if min_amount > 0:
        q = q.filter(func.cast(V3FundingInstruction.expected_amount, Float) >= min_amount)
    deps = q.order_by(V3FundingInstruction.created_at.desc()).limit(50).all()
    return eve_success([{
        "deposit_id": d.id, "status": d.status, "currency": d.currency,
        "expected_amount": d.expected_amount, "posted_amount": d.posted_amount,
        "created_at": d.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    } for d in deps])


@router.get("/admin/withdrawals")
def admin_list_withdrawals(status: str = "", auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    q = db.query(V3FundingInstruction).filter(V3FundingInstruction.type == "withdrawal")
    if status:
        q = q.filter(V3FundingInstruction.status == status)
    wdrs = q.order_by(V3FundingInstruction.created_at.desc()).limit(50).all()
    return eve_success([{
        "withdrawal_id": w.id, "status": w.status, "currency": w.currency,
        "amount": w.expected_amount, "fee": w.fee,
        "created_at": w.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    } for w in wdrs])


@router.post("/admin/kill-switch")
def admin_kill_switch(
    account_id: str = "",
    tenant_id: str = "",
    action: str = "block",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    """Emergency kill switch."""
    if account_id:
        acct = db.query(V3Account).filter(V3Account.id == account_id).first()
        if acct:
            acct.status = "suspended"
            # Cancel open orders
            orders = db.query(V3Order).filter(
                V3Order.account_id == acct.id,
                V3Order.status.in_(["received", "accepted", "working"]),
            ).all()
            for o in orders:
                o.status = "cancelled"
            db.commit()
            audit_log(db, auth["client"].id, "KILL_SWITCH_ACCOUNT", "account", account_id,
                     reason=f"Kill switch: {action}")

    return eve_success({"status": "blocked", "account_id": account_id, "tenant_id": tenant_id})


@router.get("/admin/audit-events")
def admin_audit_events(
    action: str = "",
    object_type: str = "",
    limit: int = 50,
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    q = db.query(V3AuditEvent)
    if action:
        q = q.filter(V3AuditEvent.action == action)
    if object_type:
        q = q.filter(V3AuditEvent.object_type == object_type)
    events = q.order_by(V3AuditEvent.created_at.desc()).limit(limit).all()
    return eve_success([{
        "id": e.id, "actor": e.actor, "action": e.action,
        "object_type": e.object_type, "object_id": e.object_id,
        "reason": e.reason, "request_id": e.request_id,
        "created_at": e.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    } for e in events])




# ═══════════════════════════════════════════════
# WEBHOOK CONFIG
# ═══════════════════════════════════════════════

@router.get("/webhooks")
def list_webhooks(auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """List webhook configs for the current client."""
    from models_v3 import V3WebhookConfig
    configs = db.query(V3WebhookConfig).filter(
        V3WebhookConfig.tenant_id == auth["client"].tenant_id
    ).all()
    return eve_success([{
        "id": c.id, "url": c.url, "events": c.events,
        "status": c.status, "created_at": c.created_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    } for c in configs])


@router.post("/webhooks")
def create_webhook(
    url: str,
    events: list,
    secret: str = "",
    auth: dict = Depends(get_authenticated_client),
    db: Session = Depends(get_db),
):
    """Create a webhook config."""
    from models_v3 import V3WebhookConfig
    if not secret:
        import secrets
        secret = secrets.token_hex(32)
    
    config = V3WebhookConfig(
        tenant_id=auth["client"].tenant_id,
        url=url,
        secret=secret,
        events=events,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return eve_success({
        "id": config.id, "url": config.url, "events": config.events,
        "secret": secret, "status": config.status,
    })


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: str, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Delete a webhook config."""
    from models_v3 import V3WebhookConfig
    config = db.query(V3WebhookConfig).filter(V3WebhookConfig.id == webhook_id).first()
    if not config:
        raise_eve("RESOURCE_NOT_FOUND")
    db.delete(config)
    db.commit()
    return eve_success({"deleted": True})



# ═══════════════════════════════════════════════
# MISSING ENDPOINTS (snapshots, bars, positions, admin CRUD, reconciliation)
# ═══════════════════════════════════════════════

@router.get("/market/snapshots")
def market_snapshots(symbols: str = Query(...), auth: dict = Depends(get_authenticated_client)):
    """Get stock snapshots (price, change, volume)."""
    import httpx
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    results = []
    for sym in sym_list:
        try:
            r = httpx.get(
                f"https://data.alpaca.markets/v2/stocks/{sym}/snapshot",
                headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                         "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                timeout=5
            )
            if r.status_code == 200:
                d = r.json()
                results.append({
                    "symbol": sym,
                    "last": str(d.get("latestTrade", {}).get("p", 0)),
                    "prev_close": str(d.get("prevDailyBar", {}).get("c", 0)),
                    "change": str(d.get("dailyBar", {}).get("c", 0) - d.get("prevDailyBar", {}).get("c", 0)) if d.get("dailyBar") else "0",
                    "change_pct": "0",
                    "volume": d.get("dailyBar", {}).get("v", 0) if d.get("dailyBar") else 0,
                    "high": str(d.get("dailyBar", {}).get("h", 0)) if d.get("dailyBar") else "0",
                    "low": str(d.get("dailyBar", {}).get("l", 0)) if d.get("dailyBar") else "0",
                    "open": str(d.get("dailyBar", {}).get("o", 0)) if d.get("dailyBar") else "0",
                })
        except Exception:
            pass
    return eve_success(results)


@router.get("/market/bars")
def market_bars(symbols: str = Query(...), timeframe: str = "1D", limit: int = 100, auth: dict = Depends(get_authenticated_client)):
    """Get historical bars/candles. US stocks via Alpaca, HK stocks via Eastmoney."""
    import httpx
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    results = {}
    klt_map = {"1m": "101", "5m": "102", "15m": "103", "30m": "104",
               "60m": "105", "1D": "106", "1d": "106", "1w": "107", "1M": "108"}

    for sym in sym_list:
        try:
            if sym.endswith(".HK"):
                # HK k-line from Tencent Finance (free)
                hk_code = sym.replace(".HK", "").zfill(5)
                freq_map = {"1m": "5min", "5m": "15min", "15m": "30min", "30m": "30min",
                            "60m": "60min", "1D": "day", "1d": "day", "1w": "week", "1M": "month"}
                freq = freq_map.get(timeframe, "day")
                r = httpx.get(
                    f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hk{hk_code},{freq},,,{limit},qfq",
                    timeout=10
                )
                if r.status_code == 200:
                    data = r.json()
                    if data.get("data") and data["data"].get(f"hk{hk_code}"):
                        raw = data["data"][f"hk{hk_code}"].get(freq, [])
                        results[sym] = [{"t": c[0], "o": c[1], "c": c[2],
                                         "h": c[3], "l": c[4], "v": str(int(float(c[5])))} for c in raw[:limit]]
            else:
                # US bars from Alpaca
                r = httpx.get(
                    f"https://data.alpaca.markets/v2/stocks/{sym}/bars",
                    params={"timeframe": timeframe, "limit": limit, "adjustment": "split"},
                    headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                             "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                    timeout=10
                )
                if r.status_code == 200:
                    bars = r.json().get("bars", [])
                    results[sym] = [{"t": b.get("t"), "o": b.get("o"), "h": b.get("h"),
                                     "l": b.get("l"), "c": b.get("c"), "v": b.get("v")} for b in bars]
        except Exception:
            pass
    return eve_success(results)


@router.delete("/positions/{symbol}")
def close_position(symbol: str, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Close a specific position."""
    pos = db.query(V3Position).join(V3Account).filter(
        V3Position.symbol == symbol.upper(),
        V3Account.client_id == auth["client"].id,
    ).first()
    if not pos:
        raise_eve("RESOURCE_NOT_FOUND", f"Position {symbol} not found")
    db.delete(pos)
    db.commit()
    return eve_success({"symbol": symbol.upper(), "status": "closed"})


@router.delete("/orders")
def cancel_all_orders(account_id: str = "", auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Cancel all open orders."""
    q = db.query(V3Order).join(V3Account).filter(V3Account.client_id == auth["client"].id)
    if account_id:
        q = q.filter(V3Order.account_id == account_id)
    q = q.filter(V3Order.status.in_(["received", "accepted", "working"]))
    count = 0
    for o in q.all():
        o.status = "cancelled"
        o.status_history.append({"status": "cancelled", "at": utcnow_str()})
        count += 1
    db.commit()
    return eve_success({"cancelled_count": count})


@router.post("/admin/clients")
def admin_create_client(body: ClientCreate, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Create a new client (admin)."""
    tenant = db.query(Tenant).first()
    if not tenant:
        raise_eve("RESOURCE_NOT_FOUND", "No tenant configured")
    client = V3Client(
        tenant_id=tenant.id, legal_type=body.type,
        legal_name=body.legal_name, country=body.country,
        base_currency=body.base_currency,
        api_key=gen_api_key(), api_secret=gen_secret(),
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return eve_success(ClientOut.from_orm(client))


@router.patch("/admin/clients/{client_id}")
def admin_update_client(client_id: str, status: str = "", risk_tier: str = "", auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Update client (admin)."""
    client = db.query(V3Client).filter(V3Client.id == client_id).first()
    if not client:
        raise_eve("RESOURCE_NOT_FOUND")
    if status: client.status = status
    if risk_tier: client.risk_tier = risk_tier
    db.commit()
    return eve_success({"client_id": client.id, "status": client.status})


@router.post("/admin/accounts")
def admin_create_account(body: AccountCreate, auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Create a trading account for a client (admin)."""
    client = db.query(V3Client).filter(V3Client.id == body.client_id).first()
    if not client:
        raise_eve("RESOURCE_NOT_FOUND")
    tenant = db.query(Tenant).filter(Tenant.id == client.tenant_id).first()
    count = db.query(V3Account).filter(V3Account.client_id == client.id).count()
    acct = V3Account(
        tenant_id=tenant.id, client_id=client.id,
        account_number=f"EVE-{client.country}-{count+1:04d}",
        type=body.type, base_currency=body.base_currency,
        trading_permissions=body.permissions,
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return eve_success(AccountOut.from_orm(acct))


@router.post("/admin/withdrawals/{withdrawal_id}/approve")
def admin_approve_withdrawal(
    withdrawal_id: str, body: AdminWithdrawalApprove,
    auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db),
):
    """Approve a withdrawal request (admin)."""
    wdr = db.query(V3FundingInstruction).filter(
        V3FundingInstruction.id == withdrawal_id,
        V3FundingInstruction.type == "withdrawal",
    ).first()
    if not wdr:
        raise_eve("RESOURCE_NOT_FOUND")
    wdr.status = "approved"
    wdr.approved_by = auth["client"].id
    wdr.approved_at = datetime.now(timezone.utc)
    wdr.value_date = body.value_date
    db.commit()
    return eve_success({"withdrawal_id": wdr.id, "status": "approved", "approved_by": auth["client"].id})


@router.post("/admin/reconciliation/run")
def admin_run_reconciliation(
    business_date: str = "", currency: str = "",
    auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db),
):
    """Run reconciliation (simulated)."""
    return eve_success({
        "reconciliation_id": gen_id("recon_"),
        "business_date": business_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "completed",
        "summary": {
            "total_orders": db.query(V3Order).count(),
            "total_fills": db.query(V3Fill).count(),
            "total_positions": db.query(V3Position).count(),
            "total_ledger_entries": db.query(V3LedgerEntry).count(),
        },
        "breaks": [],
    })


@router.get("/admin/reconciliation/breaks")
def admin_reconciliation_breaks(status: str = "open", auth: dict = Depends(get_authenticated_client), db: Session = Depends(get_db)):
    """Query reconciliation breaks."""
    return eve_success([])


@router.get("/openapi.json", include_in_schema=False)
def openapi_json():
    """OpenAPI 3.0 schema."""
    return {
        "openapi": "3.0.0",
        "info": {"title": "EVE FINANCE v3.0", "version": "3.0.0",
                 "description": "White-Label Trading API"},
        "paths": {
            "/v3/health": {"get": {"summary": "Health check", "tags": ["System"]}},
            "/v3/oauth/token": {"post": {"summary": "OAuth2 token", "tags": ["Auth"]}},
            "/v3/assets": {"get": {"summary": "Asset search", "tags": ["Market Data"]}},
            "/v3/market/quotes": {"get": {"summary": "Real-time quotes", "tags": ["Market Data"]}},
            "/v3/market/snapshots": {"get": {"summary": "Stock snapshots", "tags": ["Market Data"]}},
            "/v3/market/bars": {"get": {"summary": "Historical bars", "tags": ["Market Data"]}},
            "/v3/market/clock": {"get": {"summary": "Market clock", "tags": ["Market Data"]}},
            "/v3/accounts": {"get": {"summary": "List accounts", "tags": ["Accounts"]}},
            "/v3/accounts/{id}/summary": {"get": {"summary": "Account summary", "tags": ["Accounts"]}},
            "/v3/accounts/{id}/ledger": {"get": {"summary": "Cash ledger", "tags": ["Accounts"]}},
            "/v3/positions": {"get": {"summary": "List positions", "tags": ["Trading"]}},
            "/v3/orders/preview": {"post": {"summary": "Order preview", "tags": ["Trading"]}},
            "/v3/orders": {"post": {"summary": "Submit order", "tags": ["Trading"]},
                           "get": {"summary": "List orders", "tags": ["Trading"]},
                           "delete": {"summary": "Cancel all orders", "tags": ["Trading"]}},
            "/v3/orders/{id}": {"patch": {"summary": "Replace order", "tags": ["Trading"]},
                                "delete": {"summary": "Cancel order", "tags": ["Trading"]}},
            "/v3/fills": {"get": {"summary": "List fills", "tags": ["Trading"]}},
            "/v3/fx/rates": {"get": {"summary": "FX rates", "tags": ["FX"]}},
            "/v3/fx/quotes": {"post": {"summary": "FX quote", "tags": ["FX"]}},
            "/v3/fx/conversions": {"post": {"summary": "Execute FX", "tags": ["FX"]}},
            "/v3/funding/deposits": {"post": {"summary": "Create deposit", "tags": ["Funding"]}},
            "/v3/funding/withdrawals": {"post": {"summary": "Create withdrawal", "tags": ["Funding"]}},
            "/v3/fees/estimate": {"post": {"summary": "Fee estimate", "tags": ["Fees"]}},
            "/v3/ws": {"get": {"summary": "WebSocket endpoint", "tags": ["Realtime"]}},
        },
        "components": {
            "securitySchemes": {
                "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
            }
        },
    }


@router.get("/docs", include_in_schema=False)
async def swagger_ui():
    """Redirect to ReDoc."""
    from fastapi.responses import HTMLResponse
    html = """<!DOCTYPE html>
<html><head><title>EVE FINANCE v3.0</title>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;padding:0}</style>
</head><body>
<redoc spec-url='/v3/openapi.json'></redoc>
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body></html>"""
    return HTMLResponse(content=html)



# ═══════════════════════════════════════════════
# MARKET: HK K-LINE (candlestick chart data)
# ═══════════════════════════════════════════════

@router.get("/market/klines")
def market_klines(
    symbol: str = Query(...),
    timeframe: str = "1d",
    limit: int = 100,
    auth: dict = Depends(get_authenticated_client),
):
    """Get candlestick/k-line data.
    US stocks via Alpaca, HK stocks via Sina/Eastmoney.
    timeframe: 1m, 5m, 15m, 30m, 60m, 1d, 1w, 1M
    """
    import httpx

    if symbol.endswith(".HK"):
        # HK k-line from Tencent Finance (free, real-time)
        hk_code = symbol.replace(".HK", "").zfill(5)
        freq_map = {"1m": "5min", "5m": "15min", "15m": "30min", "30m": "30min",
                     "60m": "60min", "1D": "day", "1d": "day", "1w": "week", "1M": "month"}
        freq = freq_map.get(timeframe, "day")
        try:
            url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=hk{hk_code},{freq},,,{limit},qfq"
            r = httpx.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if data.get("data") and data["data"].get(f"hk{hk_code}"):
                    raw = data["data"][f"hk{hk_code}"].get(freq, [])
                    candles = [{"t": c[0], "o": c[1], "c": c[2],
                                "h": c[3], "l": c[4], "v": str(int(float(c[5])))} for c in raw[:limit]]
                    return eve_success({"symbol": symbol, "timeframe": timeframe, "candles": candles})
        except Exception:
            pass
        return eve_success({"symbol": symbol, "timeframe": timeframe, "candles": []})
    else:
        # US k-line via Alpaca
        try:
            r = httpx.get(
                f"https://data.alpaca.markets/v2/stocks/{symbol}/bars",
                params={"timeframe": timeframe, "limit": limit, "adjustment": "split"},
                headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                         "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                timeout=10
            )
            if r.status_code == 200:
                bars = r.json().get("bars", [])
                candles = [{"t": b.get("t"), "o": b.get("o"), "h": b.get("h"),
                            "l": b.get("l"), "c": b.get("c"), "v": b.get("v")} for b in bars]
                return eve_success({"symbol": symbol, "timeframe": timeframe, "candles": candles})
        except Exception:
            pass
        return eve_success({"symbol": symbol, "timeframe": timeframe, "candles": []})


# ═══════════════════════════════════════════════
# INTERNAL: bank event callback
# ═══════════════════════════════════════════════

@router.post("/internal/bank-events")
def bank_event(
    body: BankEvent,
    x_idempotency_key: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Internal endpoint: bank callback for funds detection."""
    if x_idempotency_key:
        existing = check_idempotency(x_idempotency_key, "POST /v3/internal/bank-events", db)
        if existing:
            return JSONResponse(content=existing.response_body, status_code=existing.status_code)

    # Parse reference to find deposit
    ref = body.reference
    deposit = db.query(V3FundingInstruction).filter(
        V3FundingInstruction.type == "deposit",
        V3FundingInstruction.status == "awaiting_funds",
    ).filter(
        V3FundingInstruction.bank_instruction["reference"].as_string().contains(ref)
    ).first()

    if deposit:
        deposit.status = "funds_detected"
        deposit.external_transaction_id = body.external_transaction_id
        db.commit()

    resp = eve_success({"received": True, "deposit_id": deposit.id if deposit else None})
    if x_idempotency_key:
        store_idempotency(x_idempotency_key, "POST /v3/internal/bank-events",
                         compute_hash(body.dict()), resp, 200, db)
    return resp
