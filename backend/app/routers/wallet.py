"""
EVE Finance — Unified Wallet Service (PostgreSQL)
Endpoints: balance, deposit, withdraw, FX convert, positions, orders, statements
All balance mutations go through the ledger (double-entry, append-only).
"""
import os, uuid, time, httpx, json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Header
from pydantic import BaseModel

import psycopg2
import psycopg2.extras

router = APIRouter(prefix="/wallet", tags=["Wallet"])

# ─── DB Connection ─────────────────────────────
DB_DSN = os.getenv("EVE_DB_DSN", "host=localhost dbname=eve_finance user=eve password=eve2026secure")

def get_db():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    return conn

def uid():
    return str(uuid.uuid4()).replace("-", "")[:20]

# ─── FX Rates (multi-source, cached) ───────────
_fx_cache = {"ts": 0, "data": None}
FX_TTL = 60  # seconds

def get_fx_rates(force=False):
    """Fetch and cross-validate FX rates from multiple sources."""
    now = time.time()
    if not force and _fx_cache["data"] and now - _fx_cache["ts"] < FX_TTL:
        return _fx_cache["data"]

    fiat_rates, usdt_rate = {}, 1.0
    # Source 1
    try:
        r = httpx.get("https://open.er-api.com/v6/latest/USD", timeout=8)
        if r.status_code == 200:
            fiat_rates = r.json().get("rates", {})
    except Exception:
        pass
    # Source 2 (backup)
    if not fiat_rates:
        try:
            r = httpx.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=8)
            if r.status_code == 200:
                fiat_rates = r.json().get("rates", {})
        except Exception:
            fiat_rates = {"HKD": 7.85, "SGD": 1.287, "EUR": 0.92}
    # Binance USDT
    try:
        r = httpx.get("https://api.binance.com/api/v3/ticker/price?symbol=USDCUSDT", timeout=5)
        if r.status_code == 200:
            usdt_rate = float(r.json().get("price", 1.0))
    except Exception:
        pass

    rates = {"USD": 1.0, "USDT": usdt_rate}
    rates.update({k: float(v) for k, v in fiat_rates.items()})
    # Cross-validate HKD
    hkd = rates.get("HKD", 7.85)
    health = "ok" if 7.70 <= hkd <= 8.00 else "warning"
    result = {"rates": rates, "health": health, "ts": now}
    _fx_cache.update({"ts": now, "data": result})
    return result


def get_cross_rate(from_ccy: str, to_ccy: str) -> Decimal:
    """Get mid-market cross rate: 1 from_ccy = X to_ccy."""
    fx = get_fx_rates()
    r = fx["rates"]
    if from_ccy == to_ccy:
        return Decimal("1")
    return Decimal(str(r.get(to_ccy, 1.0))) / Decimal(str(r.get(from_ccy, 1.0)))


# ─── Auth helper ───────────────────────────────
def get_current_user(request) -> dict:
    """Authenticate via api_key header or bearer token."""
    api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if api_key:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, email, full_name, role FROM users WHERE api_key = %s", (api_key,))
        user = cur.fetchone()
        conn.close()
        if user:
            return dict(user)

    # Try bearer token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, email, full_name, role FROM users WHERE api_key = %s", (token,))
        user = cur.fetchone()
        conn.close()
        if user:
            return dict(user)

    raise HTTPException(status_code=401, detail="Unauthorized")


def get_user_wallet(user_id: int, conn) -> dict:
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM wallets WHERE user_id = %s ORDER BY id LIMIT 1", (user_id,))
    wallet = cur.fetchone()
    if not wallet:
        # Auto-create wallet
        cur.execute("INSERT INTO wallets (user_id) VALUES (%s) RETURNING *", (user_id,))
        wallet = cur.fetchone()
        conn.commit()
    return dict(wallet)


# ─── Ledger helpers ────────────────────────────
def ledger_entry(conn, tx_id, wallet_id, currency, direction, amount, entry_type, ref_id=None, desc=None):
    """Write a ledger entry and update balance atomically."""
    amount = Decimal(str(amount))
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Lock the balance row
    cur.execute("SELECT * FROM balances WHERE wallet_id = %s AND currency = %s FOR UPDATE",
                (wallet_id, currency))
    bal = cur.fetchone()
    if not bal:
        cur.execute("INSERT INTO balances (wallet_id, currency, available) VALUES (%s, %s, 0) RETURNING *",
                    (wallet_id, currency))
        bal = cur.fetchone()

    old_avail = Decimal(str(bal["available"]))
    if direction == "debit":
        new_avail = old_avail - amount
    else:
        new_avail = old_avail + amount

    cur.execute("UPDATE balances SET available = %s, updated_at = NOW() WHERE id = %s",
                (str(new_avail), bal["id"]))

    cur.execute("""INSERT INTO ledger (entry_id, tx_id, wallet_id, currency, direction, amount, balance_after, entry_type, reference_id, description)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (uid(), tx_id, wallet_id, currency, direction, str(amount), str(new_avail),
                 entry_type, ref_id, desc))
    return new_avail


def freeze_balance(conn, wallet_id, currency, amount, tx_id, ref_id=None, desc=None):
    """Move amount from available to frozen."""
    amount = Decimal(str(amount))
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM balances WHERE wallet_id = %s AND currency = %s FOR UPDATE",
                (wallet_id, currency))
    bal = cur.fetchone()
    if not bal or Decimal(str(bal["available"])) < amount:
        raise HTTPException(400, f"Insufficient {currency} balance")

    cur.execute("UPDATE balances SET available = available - %s, frozen = frozen + %s, updated_at = NOW() WHERE id = %s",
                (str(amount), str(amount), bal["id"]))
    cur.execute("""INSERT INTO ledger (entry_id, tx_id, wallet_id, currency, direction, amount, balance_after, entry_type, reference_id, description)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (uid(), tx_id, wallet_id, currency, "debit", str(amount), str(Decimal(str(bal["available"])) - amount),
                 "frozen", ref_id, desc or f"Freeze {amount} {currency}"))


def unfreeze_balance(conn, wallet_id, currency, amount, tx_id, ref_id=None, desc=None):
    """Move amount from frozen back to available."""
    amount = Decimal(str(amount))
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT * FROM balances WHERE wallet_id = %s AND currency = %s FOR UPDATE",
                (wallet_id, currency))
    bal = cur.fetchone()
    if not bal or Decimal(str(bal["frozen"])) < amount:
        raise HTTPException(400, f"Insufficient frozen {currency}")

    cur.execute("UPDATE balances SET available = available + %s, frozen = frozen - %s, updated_at = NOW() WHERE id = %s",
                (str(amount), str(amount), bal["id"]))
    cur.execute("""INSERT INTO ledger (entry_id, tx_id, wallet_id, currency, direction, amount, balance_after, entry_type, reference_id, description)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (uid(), tx_id, wallet_id, currency, "credit", str(amount), str(Decimal(str(bal["available"])) + amount),
                 "unfrozen", ref_id, desc or f"Unfreeze {amount} {currency}"))


# ═══════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════
class DepositReq(BaseModel):
    currency: str
    amount: float
    description: Optional[str] = None

class WithdrawReq(BaseModel):
    currency: str
    amount: float
    description: Optional[str] = None

class ConvertReq(BaseModel):
    from_currency: str
    to_currency: str
    amount: float

class TradeReq(BaseModel):
    symbol: str
    side: str          # buy, sell
    quantity: float
    market: str = "US" # US, HK
    order_type: str = "market"

class TransferReq(BaseModel):
    to_user_id: int
    currency: str
    amount: float


# ═══════════════════════════════════════════════
# ENDPOINTS: Balance
# ═══════════════════════════════════════════════
from fastapi import Request

@router.get("/balances")
def get_balances(request: Request):
    """Get all balances for current user."""
    user = get_current_user(request)
    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT currency, available, frozen FROM balances WHERE wallet_id = %s ORDER BY currency",
                    (wallet["id"],))
        rows = cur.fetchall()
        balances = {}
        total_usd = Decimal("0")
        fx = get_fx_rates()
        for r in rows:
            avail = Decimal(str(r["available"]))
            frozen = Decimal(str(r["frozen"]))
            bal_data = {"available": str(avail), "frozen": str(frozen), "total": str(avail + frozen)}
            balances[r["currency"]] = bal_data
            # Convert to USD for total
            rate = Decimal(str(fx["rates"].get(r["currency"], 1.0)))
            if r["currency"] in ("USDT", "USD"):
                total_usd += avail + frozen
            else:
                total_usd += (avail + frozen) / rate

        return {"status": "ok", "balances": balances, "total_usd": str(total_usd.quantize(Decimal("0.01")))}
    finally:
        conn.close()


@router.get("/positions")
def get_positions(request: Request):
    """Get all stock positions for current user."""
    user = get_current_user(request)
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT currency, available, frozen FROM balances WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = %s LIMIT 1) AND currency NOT IN ('USD', 'HKD', 'USDT', 'SGD', 'EUR', 'GBP', 'JPY', 'CNY')",
                    (user["id"],))
        rows = cur.fetchall()
        positions = []
        for r in rows:
            qty = Decimal(str(r["available"])) + Decimal(str(r["frozen"]))
            if qty > 0:
                positions.append({"symbol": r["currency"], "quantity": str(qty), "frozen": str(r["frozen"])})
        return {"status": "ok", "positions": positions}
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: Deposit / Withdraw
# ═══════════════════════════════════════════════
@router.post("/deposit")
def deposit(body: DepositReq, request: Request):
    """Deposit funds (admin or webhook only in production)."""
    user = get_current_user(request)
    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        tx_id = uid()
        ledger_entry(conn, tx_id, wallet["id"], body.currency.upper(), "credit",
                     body.amount, "deposit", desc=body.description or f"Deposit {body.amount} {body.currency.upper()}")
        conn.commit()
        return {"status": "ok", "tx_id": tx_id, "deposited": body.amount, "currency": body.currency.upper()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    finally:
        conn.close()


@router.post("/withdraw")
def withdraw(body: WithdrawReq, request: Request):
    """Withdraw funds."""
    user = get_current_user(request)
    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        tx_id = uid()
        ledger_entry(conn, tx_id, wallet["id"], body.currency.upper(), "debit",
                     body.amount, "withdraw", desc=body.description or f"Withdraw {body.amount} {body.currency.upper()}")
        conn.commit()
        return {"status": "ok", "tx_id": tx_id, "withdrawn": body.amount, "currency": body.currency.upper()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: FX Convert
# ═══════════════════════════════════════════════
@router.get("/fx/rates")
def fx_rates(request: Request, quotes: str = "HKD,USDT"):
    """Get real-time FX rates (mid-market, zero fee)."""
    fx = get_fx_rates()
    quote_list = [q.strip().upper() for q in quotes.split(",")]
    rates = []
    for q in quote_list:
        rate = fx["rates"].get(q, 1.0)
        rates.append({"quote": q, "mid": f"{rate:.6f}", "as_of": datetime.now(timezone.utc).isoformat()})
    return {"status": "ok", "base": "USD", "rates": rates, "fee": "0", "spread": "0", "health": fx["health"]}


@router.post("/convert")
def convert(body: ConvertReq, request: Request):
    """Convert currency at mid-market rate, zero fee."""
    user = get_current_user(request)
    from_ccy = body.from_currency.upper()
    to_ccy = body.to_currency.upper()
    amount = Decimal(str(body.amount))

    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")

    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        tx_id = uid()

        # Get cross rate
        rate = get_cross_rate(from_ccy, to_ccy)
        to_amount = (amount * rate).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)

        # Debit from_currency
        ledger_entry(conn, tx_id, wallet["id"], from_ccy, "debit", amount, "fx_convert",
                     desc=f"Convert {amount} {from_ccy} -> {to_amount} {to_ccy} @ {rate}")
        # Credit to_currency
        ledger_entry(conn, tx_id, wallet["id"], to_ccy, "credit", to_amount, "fx_convert",
                     desc=f"Convert {amount} {from_ccy} -> {to_amount} {to_ccy} @ {rate}")

        # Log transaction
        cur = conn.cursor()
        cur.execute("""INSERT INTO wallet_transactions (id, user_id, wallet_id, type, status, from_currency, from_amount, to_currency, to_amount, rate, fee)
                       VALUES (%s, %s, %s, 'convert', 'completed', %s, %s, %s, %s, %s, 0)""",
                    (tx_id, user["id"], wallet["id"], from_ccy, str(amount), to_ccy, str(to_amount), str(rate)))

        conn.commit()
        return {"status": "ok", "tx_id": tx_id, "from": {"currency": from_ccy, "amount": str(amount)},
                "to": {"currency": to_ccy, "amount": str(to_amount)}, "rate": str(rate), "fee": "0"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: Trade (buy/sell stocks)
# ═══════════════════════════════════════════════
def get_stock_price(symbol: str, market: str) -> Decimal:
    """Get current stock price from working sources."""
    try:
        if market == "HK":
            code = symbol.replace(".HK", "").zfill(5)
            r = httpx.get(f"https://qt.gtimg.cn/q=hk{code}", timeout=5)
            parts = r.text.split("~")
            if len(parts) > 3:
                return Decimal(parts[3])
        else:
            # Use yfinance-style Yahoo API (v8 chart endpoint)
            r = httpx.get(
                f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=price",
                headers={"User-Agent": "Mozilla/5.0"}, timeout=8
            )
            if r.status_code == 200:
                data = r.json()
                price = data["quoteSummary"]["result"][0]["price"]["regularMarketPrice"]["raw"]
                return Decimal(str(price))
            # Fallback: Alpaca bars
            from datetime import datetime, timedelta
            start = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
            r = httpx.get(
                f"https://data.alpaca.markets/v2/stocks/{symbol}/bars",
                params={"timeframe": "1Day", "limit": 1, "feed": "iex", "start": start},
                headers={"APCA-API-KEY-ID": "PKNIZEG473HN2TKETLMTNOTHBY",
                         "APCA-API-SECRET-KEY": "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP"},
                timeout=8
            )
            if r.status_code == 200:
                bars = r.json().get("bars", [])
                if bars:
                    return Decimal(str(bars[-1]["c"]))
    except Exception as e:
        import logging; logging.getLogger(__name__).error(f"Price error {symbol}: {e}")
    return Decimal("0")


@router.post("/trade")
def trade(body: TradeReq, request: Request):
    """Buy or sell stocks with server-side balance validation."""
    user = get_current_user(request)
    symbol = body.symbol.upper()
    market = body.market.upper()
    side = body.side.lower()
    qty = Decimal(str(body.quantity))

    if side not in ("buy", "sell"):
        raise HTTPException(400, "Side must be 'buy' or 'sell'")
    if qty <= 0:
        raise HTTPException(400, "Quantity must be positive")

    # Get price
    price = get_stock_price(symbol, market)
    if price <= 0:
        raise HTTPException(400, f"Cannot get price for {symbol}")

    currency = "HKD" if market == "HK" else "USD"
    total = (qty * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        order_id = uid()
        tx_id = uid()

        if side == "buy":
            # Check balance
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT available FROM balances WHERE wallet_id = %s AND currency = %s",
                        (wallet["id"], currency))
            bal = cur.fetchone()
            if not bal or Decimal(str(bal["available"])) < total:
                raise HTTPException(400, f"Insufficient {currency}. Need {total}, have {bal['available'] if bal else 0}")

            # Deduct currency
            ledger_entry(conn, tx_id, wallet["id"], currency, "debit", total, "trade_buy",
                         ref_id=order_id, desc=f"Buy {qty} {symbol} @ {price}")

            # Credit stock
            ledger_entry(conn, tx_id, wallet["id"], symbol, "credit", qty, "trade_buy",
                         ref_id=order_id, desc=f"Buy {qty} {symbol} @ {price}")

        else:  # sell
            # Check stock balance
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT available FROM balances WHERE wallet_id = %s AND currency = %s",
                        (wallet["id"], symbol))
            bal = cur.fetchone()
            if not bal or Decimal(str(bal["available"])) < qty:
                raise HTTPException(400, f"Insufficient {symbol}. Need {qty}, have {bal['available'] if bal else 0}")

            # Deduct stock
            ledger_entry(conn, tx_id, wallet["id"], symbol, "debit", qty, "trade_sell",
                         ref_id=order_id, desc=f"Sell {qty} {symbol} @ {price}")

            # Credit currency
            ledger_entry(conn, tx_id, wallet["id"], currency, "credit", total, "trade_sell",
                         ref_id=order_id, desc=f"Sell {qty} {symbol} @ {price}")

        # Log order
        cur = conn.cursor()
        cur.execute("""INSERT INTO stock_orders (user_id, market, symbol, side, order_type, quantity, filled_quantity, filled_price, currency, notional, fee, status)
                       VALUES (%s, %s, %s, %s, 'market', %s, %s, %s, %s, %s, 0, 'filled')""",
                    (user["id"], market, symbol, side, str(qty), str(qty), str(price), currency, str(total)))

        conn.commit()
        return {"status": "ok", "order_id": order_id, "symbol": symbol, "side": side,
                "quantity": str(qty), "price": str(price), "total": str(total), "currency": currency}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: Transfer
# ═══════════════════════════════════════════════
@router.post("/transfer")
def transfer(body: TransferReq, request: Request):
    """Transfer funds to another user."""
    user = get_current_user(request)
    if user["id"] == body.to_user_id:
        raise HTTPException(400, "Cannot transfer to self")

    conn = get_db()
    try:
        from_wallet = get_user_wallet(user["id"], conn)
        to_wallet = get_user_wallet(body.to_user_id, conn)
        tx_id = uid()

        ledger_entry(conn, tx_id, from_wallet["id"], body.currency.upper(), "debit",
                     body.amount, "transfer", desc=f"Transfer to user {body.to_user_id}")
        ledger_entry(conn, tx_id, to_wallet["id"], body.currency.upper(), "credit",
                     body.amount, "transfer", desc=f"Transfer from user {user['id']}")

        cur = conn.cursor()
        cur.execute("""INSERT INTO wallet_transactions (id, user_id, wallet_id, type, status, from_currency, from_amount, to_currency, to_amount)
                       VALUES (%s, %s, %s, 'transfer', 'completed', %s, %s, %s, %s)""",
                    (tx_id, user["id"], from_wallet["id"], body.currency.upper(), str(body.amount),
                     body.currency.upper(), str(body.amount)))

        conn.commit()
        return {"status": "ok", "tx_id": tx_id, "to_user": body.to_user_id,
                "currency": body.currency.upper(), "amount": str(body.amount)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: Transactions & Ledger
# ═══════════════════════════════════════════════
@router.get("/transactions")
def get_transactions(request: Request, limit: int = 50, type: str = None):
    """Get transaction history."""
    user = get_current_user(request)
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        q = "SELECT * FROM wallet_transactions WHERE user_id = %s"
        params = [user["id"]]
        if type:
            q += " AND type = %s"
            params.append(type)
        q += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(q, params)
        return {"status": "ok", "transactions": [dict(r) for r in cur.fetchall()]}
    finally:
        conn.close()


@router.get("/ledger")
def get_ledger(request: Request, currency: str = None, limit: int = 50):
    """Get ledger entries (full audit trail)."""
    user = get_current_user(request)
    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        q = "SELECT * FROM ledger WHERE wallet_id = %s"
        params = [wallet["id"]]
        if currency:
            q += " AND currency = %s"
            params.append(currency.upper())
        q += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(q, params)
        return {"status": "ok", "entries": [dict(r) for r in cur.fetchall()]}
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# ENDPOINTS: Statements
# ═══════════════════════════════════════════════
@router.get("/statements")
def get_statements(request: Request, limit: int = 12):
    """Get financial statements."""
    user = get_current_user(request)
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM statements WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
                    (user["id"], limit))
        return {"status": "ok", "statements": [dict(r) for r in cur.fetchall()]}
    finally:
        conn.close()


@router.post("/statements/generate")
def generate_statement(request: Request, period: str = Query(...)):
    """Generate a statement for a period (e.g. 2026-07)."""
    user = get_current_user(request)
    conn = get_db()
    try:
        wallet = get_user_wallet(user["id"], conn)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Get current balances
        cur.execute("SELECT currency, available, frozen FROM balances WHERE wallet_id = %s", (wallet["id"],))
        balances = {r["currency"]: {"available": str(r["available"]), "frozen": str(r["frozen"])}
                    for r in cur.fetchall()}

        # Get positions
        positions = []
        for ccy, bal in balances.items():
            if ccy not in ("USD", "HKD", "USDT", "SGD", "EUR", "GBP", "JPY", "CNY"):
                total = Decimal(str(bal["available"])) + Decimal(str(bal["frozen"]))
                if total > 0:
                    price = get_stock_price(ccy, "HK" if ccy.startswith("0") and len(ccy) == 5 else "US")
                    positions.append({"symbol": ccy, "quantity": bal["available"], "frozen": bal["frozen"],
                                      "price": str(price), "value": str(total * price)})

        # Total value
        fx = get_fx_rates()
        total_usd = Decimal("0")
        for ccy, bal in balances.items():
            avail = Decimal(str(bal["available"])) + Decimal(str(bal["frozen"]))
            rate = Decimal(str(fx["rates"].get(ccy, 1.0)))
            if ccy in ("USDT", "USD"):
                total_usd += avail
            else:
                total_usd += avail / rate

        stmt_id = uid()
        cur.execute("""INSERT INTO statements (id, user_id, wallet_id, period, type, balances_json, positions_json, total_value_usd)
                       VALUES (%s, %s, %s, %s, 'monthly', %s, %s, %s)""",
                    (stmt_id, user["id"], wallet["id"], period,
                     json.dumps(balances), json.dumps(positions), str(total_usd)))

        conn.commit()
        return {"status": "ok", "statement_id": stmt_id, "period": period,
                "balances": balances, "positions": positions, "total_value_usd": str(total_usd)}
    finally:
        conn.close()
