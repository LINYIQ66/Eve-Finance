"""Pydantic schemas for request/response validation."""
from datetime import datetime, date
from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    phone: Optional[str] = None
    company_id: Optional[int] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    company_id: Optional[int] = None
    account_status: str
    kyc_status: str
    kyc_data: Optional[Any] = None
    wallet_balances: Optional[Any] = None
    stock_watchlist: Optional[Any] = None
    hk_stock_watchlist: Optional[Any] = None
    phone: Optional[str] = None
    nationality: Optional[str] = None
    date_of_birth: Optional[date] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    allowed_modules: Optional[Any] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class WalletUpdate(BaseModel):
    wallet_balances: dict[str, Any]


class WatchlistUpdate(BaseModel):
    action: str  # "add" | "remove"
    symbol: str
    market: str = "US"  # "US" | "HK"


# ---------------------------------------------------------------------------
# KYC
# ---------------------------------------------------------------------------
class KYCSubmit(BaseModel):
    id_number: str
    id_type: str  # passport / national_id / driver_license
    address: str
    document_urls: list[str] = []
    nationality: Optional[str] = None
    date_of_birth: Optional[date] = None
    contact_number: Optional[str] = None
    full_name: Optional[str] = None


class KYCStatusOut(BaseModel):
    kyc_status: str
    kyc_data: Optional[Any] = None


class KYCReview(BaseModel):
    status: str  # approved | rejected
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
class TransactionOut(BaseModel):
    id: int
    user_id: int
    transaction_type: str
    from_asset: Optional[str] = None
    to_asset: Optional[str] = None
    amount_usd: Optional[float] = None
    fee_usd: Optional[float] = None
    exchange_rate: Optional[float] = None
    status: Optional[str] = None
    description: Optional[str] = None
    eve_amount: Optional[float] = None
    total_cost_gold: Optional[float] = None
    total_cost_silver: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    transaction_type: str
    from_asset: Optional[str] = None
    to_asset: Optional[str] = None
    amount_usd: Optional[float] = None
    fee_usd: Optional[float] = 0
    exchange_rate: Optional[float] = None
    status: str = "completed"
    description: Optional[str] = None
    eve_amount: Optional[float] = None
    total_cost_gold: Optional[float] = None
    total_cost_silver: Optional[float] = None


# ---------------------------------------------------------------------------
# Fund Request
# ---------------------------------------------------------------------------
class FundRequestOut(BaseModel):
    id: int
    user_id: int
    request_type: str
    asset: str
    amount: float
    method: Optional[str] = None
    proof_of_payment_url: Optional[str] = None
    user_destination_details: Optional[Any] = None
    status: str
    admin_notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FundRequestCreate(BaseModel):
    request_type: str  # deposit | withdraw
    asset: str
    amount: float
    method: Optional[str] = None
    proof_of_payment_url: Optional[str] = None
    user_destination_details: Optional[dict[str, Any]] = None


class FundRequestReview(BaseModel):
    status: str  # approved | rejected | completed
    admin_notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Admin: User management
# ---------------------------------------------------------------------------
class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    account_status: Optional[str] = None
    allowed_modules: Optional[list[str]] = None
    company_id: Optional[int] = None
    phone: Optional[str] = None
    full_name: Optional[str] = None


class AdminUserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    company_id: Optional[int] = None
    account_status: str
    kyc_status: str
    kyc_data: Optional[Any] = None
    wallet_balances: Optional[Any] = None
    phone: Optional[str] = None
    nationality: Optional[str] = None
    date_of_birth: Optional[date] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    allowed_modules: Optional[Any] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------
class AuditLogOut(BaseModel):
    id: int
    admin_email: str
    action: str
    target_user_email: Optional[str] = None
    details: Optional[Any] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Support Ticket
# ---------------------------------------------------------------------------
class SupportTicketCreate(BaseModel):
    subject: str
    message: str
    category: Optional[str] = None


class SupportTicketOut(BaseModel):
    id: int
    user_id: int
    subject: str
    message: str
    category: Optional[str] = None
    status: str
    admin_response: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Forward refs
# ---------------------------------------------------------------------------
TokenResponse.model_rebuild()
