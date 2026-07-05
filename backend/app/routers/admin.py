"""Admin router: user management, KYC review, fund requests, audit logs."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models import (
    User, Transaction, FundRequest, AuditLog, SupportTicket,
    PhysicalRedemption,
)
from app.schemas import (
    AdminUserOut, AdminUserUpdate, KYCReview,
    FundRequestOut, FundRequestReview, AuditLogOut,
    TransactionOut, SupportTicketOut,
)
from app.auth import require_admin
from app.models import User as UserModel

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
async def _log_audit(
    db: AsyncSession,
    admin: User,
    action: str,
    target_email: str | None = None,
    details: dict | None = None,
):
    log = AuditLog(
        admin_email=admin.email,
        action=action,
        target_user_email=target_email,
        details=details or {},
    )
    db.add(log)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = body.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(user, k, v)
    await _log_audit(db, admin, "update_user", user.email, updates)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}/kyc", response_model=AdminUserOut)
async def review_kyc(
    user_id: int,
    body: KYCReview,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")

    user.kyc_status = body.status
    if body.status == "approved" and user.account_status == "pending":
        user.account_status = "active"
    if body.notes and user.kyc_data:
        kd = dict(user.kyc_data)
        kd["review_notes"] = body.notes
        kd["reviewed_by"] = admin.email
        kd["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        user.kyc_data = kd
    await _log_audit(db, admin, f"kyc_{body.status}", user.email, {"notes": body.notes})
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@router.get("/transactions", response_model=list[TransactionOut])
async def all_transactions(
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Fund Requests
# ---------------------------------------------------------------------------
@router.get("/fund-requests", response_model=list[FundRequestOut])
async def all_fund_requests(
    status_filter: str | None = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(FundRequest).order_by(FundRequest.created_at.desc())
    if status_filter:
        q = q.where(FundRequest.status == status_filter)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.put("/fund-requests/{request_id}", response_model=FundRequestOut)
async def review_fund_request(
    request_id: int,
    body: FundRequestReview,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FundRequest).where(FundRequest.id == request_id))
    fr = result.scalar_one_or_none()
    if not fr:
        raise HTTPException(status_code=404, detail="Fund request not found")
    fr.status = body.status
    if body.admin_notes:
        fr.admin_notes = body.admin_notes
    await _log_audit(db, admin, f"fund_request_{body.status}", None, {"request_id": request_id})
    await db.commit()
    await db.refresh(fr)
    return fr


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------
@router.get("/support-tickets", response_model=list[SupportTicketOut])
async def all_support_tickets(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).order_by(SupportTicket.created_at.desc())
    )
    return result.scalars().all()


@router.put("/support-tickets/{ticket_id}", response_model=SupportTicketOut)
async def respond_support_ticket(
    ticket_id: int,
    response: str,
    status: str = "resolved",
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.admin_response = response
    ticket.status = status
    await db.commit()
    await db.refresh(ticket)
    return ticket


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------
@router.get("/audit-logs", response_model=list[AuditLogOut])
async def audit_logs(
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------
@router.get("/stats")
async def admin_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    pending_kyc = (await db.execute(
        select(func.count(User.id)).where(User.kyc_status == "pending")
    )).scalar()
    pending_funds = (await db.execute(
        select(func.count(FundRequest.id)).where(FundRequest.status == "pending")
    )).scalar()
    open_tickets = (await db.execute(
        select(func.count(SupportTicket.id)).where(SupportTicket.status == "open")
    )).scalar()

    return {
        "total_users": total_users,
        "pending_kyc": pending_kyc,
        "pending_fund_requests": pending_funds,
        "open_support_tickets": open_tickets,
    }
