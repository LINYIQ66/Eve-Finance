"""User router: transactions, wallet, watchlist, support tickets."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User, Transaction, SupportTicket
from app.schemas import (
    WalletUpdate, WatchlistUpdate, TransactionOut,
    TransactionCreate, SupportTicketCreate, SupportTicketOut,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/user", tags=["user"])


# ---------------------------------------------------------------------------
# Wallet
# ---------------------------------------------------------------------------
@router.put("/wallet")
async def update_wallet(
    body: WalletUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.wallet_balances = body.wallet_balances
    await db.commit()
    await db.refresh(user)
    return {"wallet_balances": user.wallet_balances}


# ---------------------------------------------------------------------------
# Watchlist
# ---------------------------------------------------------------------------
@router.get("/watchlist")
async def get_watchlist(user: User = Depends(get_current_user)):
    return {
        "stock_watchlist": user.stock_watchlist or [],
        "hk_stock_watchlist": user.hk_stock_watchlist or [],
    }


@router.post("/watchlist")
async def update_watchlist(
    body: WatchlistUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.market.upper() == "HK":
        wl = list(user.hk_stock_watchlist or [])
    else:
        wl = list(user.stock_watchlist or [])

    if body.action == "add":
        if body.symbol not in wl:
            wl.append(body.symbol)
    elif body.action == "remove":
        if body.symbol in wl:
            wl.remove(body.symbol)
    else:
        raise HTTPException(status_code=400, detail="action must be 'add' or 'remove'")

    if body.market.upper() == "HK":
        user.hk_stock_watchlist = wl
    else:
        user.stock_watchlist = wl
    await db.commit()
    return {
        "symbol": body.symbol,
        "action": body.action,
        "stock_watchlist": user.stock_watchlist,
        "hk_stock_watchlist": user.hk_stock_watchlist,
    }


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@router.get("/transactions", response_model=list[TransactionOut])
async def get_my_transactions(
    limit: int = Query(50, le=200),
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/transactions", response_model=TransactionOut)
async def create_transaction(
    body: TransactionCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = Transaction(user_id=user.id, **body.model_dump())
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------
@router.post("/support-tickets", response_model=SupportTicketOut)
async def create_support_ticket(
    body: SupportTicketCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = SupportTicket(
        user_id=user.id,
        subject=body.subject,
        message=body.message,
        category=body.category,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/support-tickets", response_model=list[SupportTicketOut])
async def get_my_support_tickets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
    )
    return result.scalars().all()
