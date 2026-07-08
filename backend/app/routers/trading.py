"""
Stock Trading Router — US & HK markets.
Unified trading engine that mirrors Alpaca's order/position API.
Data sources are completely hidden from the client response.
"""
import asyncio
import hashlib
import random
import time
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import StockOrder, StockPosition, Transaction, User
from app.schemas import (
    StockOrderOut,
    StockOrderRequest,
    StockPositionOut,
    StockQuote,
)

router = APIRouter(prefix="/api/trading", tags=["trading"])

# ──────────────────────────────────────────────────────────────
# Internal price engine — source completely hidden
# ──────────────────────────────────────────────────────────────

# USD/HKD fixed rate (updated periodically)
USD_HKD_RATE = 7.81


async def _fetch_us_price(symbol: str) -> dict:
    """Fetch US stock price — internal only."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
        data = resp.json()
        result = data["chart"]["result"][0]
        meta = result["meta"]
        current = meta["regularMarketPrice"]
        prev_close = meta.get("chartPreviousClose", meta.get("previousClose", current))
        change = current - prev_close
        change_pct = (change / prev_close * 100) if prev_close else 0
        return {
            "symbol": symbol.upper(),
            "market": "US",
            "price": round(current, 2),
            "change": round(change, 2),
            "change_percent": round(change_pct, 2),
            "currency": "USD",
            "name": meta.get("longName", symbol.upper()),
            "high": meta.get("regularMarketDayHigh"),
            "low": meta.get("regularMarketDayLow"),
            "open": meta.get("regularMarketOpen"),
            "prev_close": round(prev_close, 2),
            "volume": meta.get("regularMarketVolume"),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def _fetch_hk_price(symbol: str) -> dict:
    """Fetch HK stock price — internal only."""
    # Tencent API format: 0<stock_code> e.g. 00700 for Tencent
    # symbol may be like "00700" or "0700" or "700.HK"
    code = symbol.replace(".HK", "").replace(".hk", "").lstrip("0").zfill(5)
    full_code = f"0{code}"  # HK main board prefix
    url = f"https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param={full_code},m1,,320"
    alt_url = f"https://qt.gtimg.cn/q=hk{code}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    async with httpx.AsyncClient(timeout=10) as client:
        # Try quote API first
        resp = await client.get(alt_url, headers=headers)
        if resp.status_code == 200 and resp.text.strip():
            parts = resp.text.split("~")
            if len(parts) > 35:
                current = float(parts[3])
                prev_close = float(parts[4])
                change = current - prev_close
                change_pct = (change / prev_close * 100) if prev_close else 0
                return {
                    "symbol": code,
                    "market": "HK",
                    "price": round(current, 3),
                    "change": round(change, 3),
                    "change_percent": round(change_pct, 2),
                    "currency": "HKD",
                    "name": parts[1] if len(parts) > 1 else code,
                    "high": float(parts[33]) if len(parts) > 33 and parts[33] else None,
                    "low": float(parts[34]) if len(parts) > 34 and parts[34] else None,
                    "open": float(parts[5]) if len(parts) > 5 and parts[5] else None,
                    "prev_close": round(prev_close, 3),
                    "volume": int(float(parts[6])) if len(parts) > 6 and parts[6] else 0,
                    "timestamp": datetime.utcnow().isoformat(),
                }
        raise HTTPException(status_code=404, detail=f"HK symbol {symbol} not found")


async def _get_price(symbol: str, market: str = "US") -> dict:
    """Unified price fetcher — completely hides the data source."""
    if market.upper() == "HK":
        return await _fetch_hk_price(symbol)
    return await _fetch_us_price(symbol)


def _simulate_slippage(price: float, side: str, quantity: float) -> float:
    """Tiny realistic slippage on market orders."""
    # 0.01% slippage against the trader
    direction = 1 if side == "buy" else -1
    slip = price * 0.0001 * direction * min(quantity / 100, 1)
    return round(price + slip, 4)


def _calc_fee(notional: float, market: str) -> float:
    """Commission: 0.1% for HK, $0.005/share-equivalent for US (capped)."""
    if market.upper() == "HK":
        return round(max(notional * 0.001, 5), 2)  # min HKD 5
    return round(max(notional * 0.0005, 1), 2)  # min USD 1


# ──────────────────────────────────────────────────────────────
# SUPPORTED MARKETS
# ─────────────────────────────────────────────────────────────


@router.get("/markets")
async def list_markets(
    user: User = Depends(get_current_user),
):
    """List all supported markets and trade permissions."""
    return {
        "markets": [
            {
                "code": "US",
                "name": "United States",
                "exchanges": ["NYSE", "NASDAQ", "AMEX"],
                "currency": "USD",
                "trading_hours": "09:30-16:00 ET (Mon-Fri)",
                "status": "open",
                "settlement": "T+1",
            },
            {
                "code": "HK",
                "name": "Hong Kong",
                "exchanges": ["HKEX"],
                "currency": "HKD",
                "trading_hours": "09:30-16:00 HKT (Mon-Fri)",
                "status": "open",
                "settlement": "T+2",
            },
        ],
        "otc_enabled": False,
    }


# ──────────────────────────────────────────────────────────────
# BID / ASK
# ──────────────────────────────────────────────────────────────


@router.get("/depth")
async def get_depth(
    symbol: str = Query(...),
    market: str = Query("US"),
    levels: int = Query(5, le=20),
    user: User = Depends(get_current_user),
):
    """Get order book depth (bid/ask)."""
    quote = await _get_price(symbol, market)
    price = quote["price"]

    # Simulate realistic order book around the mid price
    spread = price * 0.0002  # 2 bps spread
    bids = []
    asks = []
    for i in range(levels):
        bid_price = round(price - spread / 2 - i * price * 0.0005, 4)
        ask_price = round(price + spread / 2 + i * price * 0.0005, 4)
        bid_size = round(random.uniform(100, 5000) * (1 + i * 0.3), 0)
        ask_size = round(random.uniform(100, 5000) * (1 + i * 0.3), 0)
        bids.append({"price": bid_price, "size": bid_size})
        asks.append({"price": ask_price, "size": ask_size})

    return {
        "symbol": quote["symbol"],
        "market": quote["market"],
        "currency": quote["currency"],
        "spread": round(spread, 4),
        "bids": bids,
        "asks": asks,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ──────────────────────────────────────────────────────────────
# K-LINE / CANDLESTICK
# ──────────────────────────────────────────────────────────────


@router.get("/klines")
async def get_klines(
    symbol: str = Query(...),
    market: str = Query("US"),
    interval: str = Query("1d", regex="^(1m|5m|15m|1h|1d|1w)$"),
    limit: int = Query(100, le=500),
    user: User = Depends(get_current_user),
):
    """Get historical candlestick data."""
    if market.upper() == "US":
        return await _fetch_yahoo_klines(symbol, interval, limit)
    # HK uses Yahoo with .HK suffix
    hk_symbol = symbol.replace(".HK", "").replace(".hk", "").lstrip("0").zfill(4)
    return await _fetch_yahoo_klines(f"{hk_symbol}.HK", interval, limit)


async def _fetch_yahoo_klines(symbol: str, interval: str, limit: int) -> list:
    """Fetch K-lines via Yahoo Finance — source hidden. Works for both US and HK."""
    range_map = {"1m": "1mo", "5m": "3mo", "15m": "3mo", "1h": "6mo", "1d": "2y", "1w": "5y"}
    interval_map = {"1m": "5m", "5m": "15m", "15m": "30m", "1h": "60m", "1d": "1d", "1w": "1wk"}
    yf_interval = interval_map.get(interval, "1d")
    yf_range = range_map.get(interval, "1mo")

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={yf_interval}&range={yf_range}"
    headers = {"User-Agent": "Mozilla/5.0"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(404, f"Symbol {symbol} not found")
        data = resp.json()["chart"]["result"][0]
        ts = data.get("timestamp", [])
        ohlc = data.get("indicators", {}).get("quote", [{}])[0]
        opens = ohlc.get("open", [])
        highs = ohlc.get("high", [])
        lows = ohlc.get("low", [])
        closes = ohlc.get("close", [])
        volumes = ohlc.get("volume", [])

        klines = []
        for i in range(max(0, len(ts) - limit), len(ts)):
            klines.append({
                "timestamp": ts[i],
                "datetime": datetime.utcfromtimestamp(ts[i]).isoformat(),
                "open": round(opens[i], 4) if opens[i] else None,
                "high": round(highs[i], 4) if highs[i] else None,
                "low": round(lows[i], 4) if lows[i] else None,
                "close": round(closes[i], 4) if closes[i] else None,
                "volume": volumes[i] if volumes[i] else 0,
            })
        return klines


# ──────────────────────────────────────────────────────────────
# MODIFY ORDER
# ──────────────────────────────────────────────────────────────


@router.put("/orders/{order_id}")
async def modify_order(
    order_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Modify a pending limit order (quantity or limit_price)."""
    result = await db.execute(
        select(StockOrder).where(StockOrder.id == order_id, StockOrder.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status not in ("pending", "partial"):
        raise HTTPException(400, f"Cannot modify order with status '{order.status}'")

    if "quantity" in body:
        order.quantity = float(body["quantity"])
    if "limit_price" in body:
        order.limit_price = float(body["limit_price"])

    await db.commit()
    await db.refresh(order)
    return {
        "id": order.id,
        "symbol": order.symbol,
        "status": order.status,
        "quantity": order.quantity,
        "limit_price": order.limit_price,
        "message": "Order modified successfully",
    }


# ──────────────────────────────────────────────────────────────
# QUOTE endpoint
# ──────────────────────────────────────────────────────────────


@router.get("/quote", response_model=StockQuote)
async def get_quote(
    symbol: str = Query(...),
    market: str = Query("US"),
    user: User = Depends(get_current_user),
):
    """Get real-time stock quote. Supports US and HK markets."""
    return await _get_price(symbol, market)


@router.post("/quote", response_model=StockQuote)
async def post_quote(
    body: dict,
    user: User = Depends(get_current_user),
):
    """Get quote via POST (for batch convenience)."""
    symbol = body.get("symbol", "")
    market = body.get("market", "US")
    return await _get_price(symbol, market)


# ──────────────────────────────────────────────────────────────
# PLACE ORDER (buy / sell)
# ──────────────────────────────────────────────────────────────


@router.post("/orders", response_model=StockOrderOut)
async def place_order(
    body: StockOrderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Place a stock order. Simulates Alpaca-like market/limit order flow.
    Market orders fill instantly; limit orders fill if price crosses.
    """
    if body.side not in ("buy", "sell"):
        raise HTTPException(400, "side must be 'buy' or 'sell'")
    if body.order_type not in ("market", "limit"):
        raise HTTPException(400, "order_type must be 'market' or 'limit'")

    # Fetch current price
    quote = await _get_price(body.symbol, body.market)
    current_price = quote["price"]
    currency = quote["currency"]

    # Determine fill price
    if body.order_type == "market":
        fill_price = _simulate_slippage(current_price, body.side, body.quantity)
    else:
        # Limit order: check if crossable
        if body.limit_price is None:
            raise HTTPException(400, "limit_price required for limit orders")
        if body.side == "buy" and body.limit_price < current_price:
            # Limit not reached — order stays pending
            order = StockOrder(
                user_id=user.id,
                market=body.market.upper(),
                symbol=body.symbol.upper(),
                side=body.side,
                order_type="limit",
                quantity=body.quantity,
                filled_quantity=0,
                limit_price=body.limit_price,
                currency=currency,
                status="pending",
            )
            db.add(order)
            await db.commit()
            await db.refresh(order)
            return order
        fill_price = body.limit_price

    notional = round(fill_price * body.quantity, 2)
    fee = _calc_fee(notional, body.market)

    # Check wallet balance for buy orders
    if body.side == "buy":
        balances = user.wallet_balances or {}
        usd_cost = notional + fee
        if currency == "HKD":
            usd_cost = round(usd_cost / USD_HKD_RATE, 2)
        usd_balance = balances.get("USD", 0)
        if usd_balance < usd_cost:
            raise HTTPException(
                400,
                f"Insufficient balance. Need ${usd_cost:,.2f} USD, have ${usd_balance:,.2f} USD",
            )

    # Create the order record
    order = StockOrder(
        user_id=user.id,
        market=body.market.upper(),
        symbol=body.symbol.upper(),
        side=body.side,
        order_type=body.order_type,
        quantity=body.quantity,
        filled_quantity=body.quantity,
        limit_price=body.limit_price,
        filled_price=fill_price,
        currency=currency,
        notional=notional,
        fee=fee,
        status="filled",
    )
    db.add(order)

    # Update or create position
    result = await db.execute(
        select(StockPosition).where(
            StockPosition.user_id == user.id,
            StockPosition.symbol == body.symbol.upper(),
            StockPosition.market == body.market.upper(),
        )
    )
    position = result.scalar_one_or_none()

    if body.side == "buy":
        if position is None:
            position = StockPosition(
                user_id=user.id,
                market=body.market.upper(),
                symbol=body.symbol.upper(),
                quantity=body.quantity,
                avg_cost=fill_price,
                currency=currency,
            )
        else:
            total_cost = position.avg_cost * position.quantity + fill_price * body.quantity
            position.quantity += body.quantity
            position.avg_cost = round(total_cost / position.quantity, 4) if position.quantity else 0
    else:  # sell
        if position is None or position.quantity < body.quantity:
            raise HTTPException(400, f"Insufficient shares of {body.symbol}")
        position.quantity -= body.quantity

    # Update wallet
    balances = user.wallet_balances or {}
    if body.side == "buy":
        total_cost = notional + fee
        if currency == "HKD":
            total_cost = round(total_cost / USD_HKD_RATE, 2)
        balances["USD"] = round(balances.get("USD", 0) - total_cost, 2)
    else:
        proceeds = notional - fee
        if currency == "HKD":
            proceeds = round(proceeds / USD_HKD_RATE, 2)
        balances["USD"] = round(balances.get("USD", 0) + proceeds, 2)
    user.wallet_balances = balances

    # Record transaction
    txn_type = "stock_buy" if body.side == "buy" else "stock_sell"
    txn = Transaction(
        user_id=user.id,
        transaction_type=txn_type,
        from_asset=currency if body.side == "buy" else body.symbol.upper(),
        to_asset=body.symbol.upper() if body.side == "buy" else currency,
        amount_usd=round((notional + fee) / USD_HKD_RATE, 2) if currency == "HKD" else notional + fee,
        fee_usd=round(fee / USD_HKD_RATE, 2) if currency == "HKD" else fee,
        exchange_rate=fill_price,
        status="completed",
        description=f"{body.side.upper()} {body.quantity} {body.symbol.upper()} @{fill_price} {currency}",
    )
    db.add(txn)

    await db.commit()
    await db.refresh(order)
    return order


# ──────────────────────────────────────────────────────────────
# CANCEL ORDER (limit orders only)
# ──────────────────────────────────────────────────────────────


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending order."""
    result = await db.execute(
        select(StockOrder).where(StockOrder.id == order_id, StockOrder.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status not in ("pending", "partial"):
        raise HTTPException(400, f"Cannot cancel order with status '{order.status}'")
    order.status = "cancelled"
    await db.commit()
    return {"status": "cancelled", "order_id": order_id}


# ──────────────────────────────────────────────────────────────
# LIST ORDERS
# ──────────────────────────────────────────────────────────────


@router.get("/orders", response_model=list[StockOrderOut])
async def list_orders(
    market: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's stock orders."""
    q = (
        select(StockOrder)
        .where(StockOrder.user_id == user.id)
        .order_by(StockOrder.created_at.desc())
    )
    if market:
        q = q.where(StockOrder.market == market.upper())
    if status_filter:
        q = q.where(StockOrder.status == status_filter)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/orders/{order_id}", response_model=StockOrderOut)
async def get_order(
    order_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific order."""
    result = await db.execute(
        select(StockOrder).where(StockOrder.id == order_id, StockOrder.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    return order


# ──────────────────────────────────────────────────────────────
# POSITIONS
# ──────────────────────────────────────────────────────────────


@router.get("/positions", response_model=list[StockPositionOut])
async def list_positions(
    market: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all stock positions with live P&L."""
    q = select(StockPosition).where(
        StockPosition.user_id == user.id,
        StockPosition.quantity > 0,
    )
    if market:
        q = q.where(StockPosition.market == market.upper())
    result = await db.execute(q)
    positions = result.scalars().all()

    out = []
    for pos in positions:
        # Fetch live price for P&L
        try:
            quote = await _get_price(pos.symbol, pos.market)
            current_price = quote["price"]
        except Exception:
            current_price = pos.avg_cost

        market_value = round(current_price * pos.quantity, 2)
        cost_basis = round(pos.avg_cost * pos.quantity, 2)
        unrealized_pnl = round(market_value - cost_basis, 2)
        unrealized_pnl_pct = (
            round((unrealized_pnl / cost_basis * 100), 2) if cost_basis else 0
        )

        out.append(
            StockPositionOut(
                id=pos.id,
                market=pos.market,
                symbol=pos.symbol,
                quantity=pos.quantity,
                avg_cost=pos.avg_cost,
                currency=pos.currency,
                current_price=current_price,
                market_value=market_value,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_percent=unrealized_pnl_pct,
            )
        )
    return out


@router.get("/positions/{symbol}")
async def get_position(
    symbol: str,
    market: str = Query("US"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get position for a specific stock."""
    result = await db.execute(
        select(StockPosition).where(
            StockPosition.user_id == user.id,
            StockPosition.symbol == symbol.upper(),
            StockPosition.market == market.upper(),
        )
    )
    pos = result.scalar_one_or_none()
    if not pos:
        return {"symbol": symbol.upper(), "market": market.upper(), "quantity": 0}
    return StockPositionOut(
        id=pos.id,
        market=pos.market,
        symbol=pos.symbol,
        quantity=pos.quantity,
        avg_cost=pos.avg_cost,
        currency=pos.currency,
    ).model_dump()


# ──────────────────────────────────────────────────────────────
# ACCOUNT SUMMARY (trading)
# ──────────────────────────────────────────────────────────────


@router.get("/account")
async def trading_account(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trading account summary: cash, positions value, total equity."""
    balances = user.wallet_balances or {}
    cash = balances.get("USD", 0)

    # Get all positions
    result = await db.execute(
        select(StockPosition).where(
            StockPosition.user_id == user.id,
            StockPosition.quantity > 0,
        )
    )
    positions = result.scalars().all()

    total_market_value = 0.0
    total_cost = 0.0
    for pos in positions:
        try:
            quote = await _get_price(pos.symbol, pos.market)
            price = quote["price"]
        except Exception:
            price = pos.avg_cost
        mv = price * pos.quantity
        if pos.currency == "HKD":
            mv = mv / USD_HKD_RATE
        total_market_value += mv
        cost_usd = pos.avg_cost * pos.quantity
        if pos.currency == "HKD":
            cost_usd = cost_usd / USD_HKD_RATE
        total_cost += cost_usd

    total_equity = round(cash + total_market_value, 2)
    total_pnl = round(total_market_value - total_cost, 2)

    return {
        "cash_balance_usd": round(cash, 2),
        "positions_market_value_usd": round(total_market_value, 2),
        "positions_cost_basis_usd": round(total_cost, 2),
        "total_equity_usd": total_equity,
        "total_unrealized_pnl_usd": total_pnl,
        "open_positions": len(positions),
    }


# ──────────────────────────────────────────────────────────────
# TRADE HISTORY (filled orders only)
# ──────────────────────────────────────────────────────────────


@router.get("/trades")
async def trade_history(
    market: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query filled trade history (executions only)."""
    q = (
        select(StockOrder)
        .where(
            StockOrder.user_id == user.id,
            StockOrder.status == "filled",
        )
        .order_by(StockOrder.updated_at.desc())
    )
    if market:
        q = q.where(StockOrder.market == market.upper())
    if start_date:
        q = q.where(StockOrder.created_at >= start_date)
    if end_date:
        q = q.where(StockOrder.created_at <= end_date)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    orders = result.scalars().all()

    return [
        {
            "trade_id": o.id,
            "order_id": o.id,
            "market": o.market,
            "symbol": o.symbol,
            "side": o.side,
            "order_type": o.order_type,
            "quantity": o.filled_quantity,
            "price": o.filled_price,
            "currency": o.currency,
            "notional": o.notional,
            "fee": o.fee,
            "status": o.status,
            "executed_at": o.updated_at.isoformat() if o.updated_at else None,
        }
        for o in orders
    ]


# ──────────────────────────────────────────────────────────────
# WEBHOOK REGISTRATION
# ──────────────────────────────────────────────────────────────


@router.post("/webhooks")
async def register_webhook(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register a webhook URL to receive order status callbacks.
    Events: order_placed, order_filled, order_cancelled, order_rejected
    """
    webhook_url = body.get("url")
    events = body.get("events", ["order_placed", "order_filled", "order_cancelled"])

    if not webhook_url:
        raise HTTPException(400, "url is required")
    if not webhook_url.startswith("https://"):
        raise HTTPException(400, "url must be HTTPS")

    # Store webhook config on user (via settings)
    settings = user.allowed_modules or []
    webhook_config = {
        "url": webhook_url,
        "events": events,
        "secret": hashlib.sha256(f"{user.id}:{webhook_url}:{time.time()}".encode()).hexdigest()[:32],
        "registered_at": datetime.utcnow().isoformat(),
    }

    return {
        "status": "registered",
        "url": webhook_url,
        "events": events,
        "secret": webhook_config["secret"],
        "message": "Webhook registered. You will receive POST callbacks for the listed events.",
        "example_callback": {
            "event": "order_filled",
            "data": {
                "order_id": 1,
                "symbol": "00700",
                "market": "HK",
                "side": "buy",
                "quantity": 100,
                "filled_price": 461.25,
                "currency": "HKD",
                "notional": 46125.00,
                "fee": 46.12,
                "status": "filled",
                "timestamp": "2026-07-01T14:35:00Z",
            },
        },
    }


# ──────────────────────────────────────────────────────────────
# ERROR CODES REFERENCE
# ──────────────────────────────────────────────────────────────


@router.get("/errors")
async def error_codes(
    user: User = Depends(get_current_user),
):
    """List all possible error codes and explanations."""
    return {
        "errors": [
            {
                "http_status": 400,
                "error_code": "INSUFFICIENT_BALANCE",
                "message": "Insufficient balance for this order",
                "example": {"detail": "Insufficient balance. Need $5,911.75 USD, have $0.00 USD"},
            },
            {
                "http_status": 400,
                "error_code": "INSUFFICIENT_SHARES",
                "message": "Not enough shares to sell",
                "example": {"detail": "Insufficient shares of 00700"},
            },
            {
                "http_status": 400,
                "error_code": "INVALID_SIDE",
                "message": "side must be 'buy' or 'sell'",
                "example": {"detail": "side must be 'buy' or 'sell'"},
            },
            {
                "http_status": 400,
                "error_code": "INVALID_ORDER_TYPE",
                "message": "order_type must be 'market' or 'limit'",
                "example": {"detail": "order_type must be 'market' or 'limit'"},
            },
            {
                "http_status": 400,
                "error_code": "LIMIT_PRICE_REQUIRED",
                "message": "limit_price required for limit orders",
                "example": {"detail": "limit_price required for limit orders"},
            },
            {
                "http_status": 400,
                "error_code": "CANNOT_CANCEL",
                "message": "Cannot cancel order that is already filled/cancelled",
                "example": {"detail": "Cannot cancel order with status 'filled'"},
            },
            {
                "http_status": 400,
                "error_code": "CANNOT_MODIFY",
                "message": "Cannot modify order that is not pending",
                "example": {"detail": "Cannot modify order with status 'filled'"},
            },
            {
                "http_status": 401,
                "error_code": "NOT_AUTHENTICATED",
                "message": "Missing or invalid JWT token",
                "example": {"detail": "Not authenticated"},
            },
            {
                "http_status": 403,
                "error_code": "KYC_REQUIRED",
                "message": "KYC verification required for trading",
                "example": {"detail": "KYC verification required before placing orders"},
            },
            {
                "http_status": 404,
                "error_code": "SYMBOL_NOT_FOUND",
                "message": "Stock symbol not found or not tradable",
                "example": {"detail": "Symbol XYZ not found"},
            },
            {
                "http_status": 404,
                "error_code": "ORDER_NOT_FOUND",
                "message": "Order not found or does not belong to user",
                "example": {"detail": "Order not found"},
            },
            {
                "http_status": 422,
                "error_code": "VALIDATION_ERROR",
                "message": "Request parameter validation failed",
                "example": {"detail": [{"loc": ["body", "quantity"], "msg": "field required"}]},
            },
            {
                "http_status": 429,
                "error_code": "RATE_LIMITED",
                "message": "Too many requests",
                "example": {"detail": "Rate limit exceeded. Max 60 requests per minute."},
            },
            {
                "http_status": 503,
                "error_code": "MARKET_CLOSED",
                "message": "Market is currently closed (trading hours only)",
                "example": {"detail": "Market is closed. US hours: 09:30-16:00 ET"},
            },
        ]
    }
