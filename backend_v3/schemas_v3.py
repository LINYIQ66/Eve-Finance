"""
EVE FINANCE v3.0 — Pydantic request/response schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ── OAuth ──
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    scope: str


# ── Tenant ──
class TenantOut(BaseModel):
    id: str
    name: str
    status: str
    created_at: datetime


# ── Client ──
class ClientCreate(BaseModel):
    type: str = Field("individual", pattern="^(individual|corporate)$")
    legal_name: str
    country: str = "SG"
    base_currency: str = "USD"


class ClientOut(BaseModel):
    id: str
    tenant_id: str
    legal_type: str
    legal_name: str
    country: str
    base_currency: str
    status: str
    kyc_status: str
    risk_tier: str
    created_at: datetime
    class Config:
        from_attributes = True


# ── Account ──
class AccountOut(BaseModel):
    id: str
    tenant_id: str
    client_id: str
    account_number: str
    type: str
    status: str
    base_currency: str
    enabled_currencies: list
    trading_permissions: list
    fractional_shares: dict
    created_at: datetime
    class Config:
        from_attributes = True


class AccountCreate(BaseModel):
    client_id: str
    type: str = "cash"
    base_currency: str = "USD"
    permissions: list = ["US_STOCKS", "HK_STOCKS", "FX_CONVERSION"]


class CashBalanceOut(BaseModel):
    currency: str
    total: str
    available: str
    withdrawable: str
    reserved: str


class AccountSummaryOut(BaseModel):
    account_id: str
    base_currency: str
    net_liquidation: str
    cash_total: str
    positions_market_value: str
    buying_power: str
    cash_by_currency: List[CashBalanceOut]
    valuation_fx_time: str


# ── Asset ──
class AssetOut(BaseModel):
    asset_id: str
    symbol: str
    name: str
    asset_class: str
    exchange: str
    currency: str
    lot_size: int
    odd_lot_supported: bool
    tick_size_rule_id: Optional[str]
    shortable: bool
    fractionable: bool
    trade_status: str
    class Config:
        from_attributes = True


# ── Market Data ──
class QuoteOut(BaseModel):
    symbol: str
    currency: str
    last: str
    bid: str
    ask: str
    bid_size: str
    ask_size: str
    lot_size: Optional[int]
    delayed: bool
    as_of: str


# ── Orders ──
class OrderPreviewReq(BaseModel):
    account_id: str
    symbol: str
    side: str = Field(..., pattern="^(buy|sell)$")
    order_type: str = "market"
    qty: str
    limit_price: Optional[str] = None
    stop_price: Optional[str] = None
    time_in_force: str = "day"


class FeeComponent(BaseModel):
    code: str
    amount: str
    rate: Optional[str] = None
    beneficiary: Optional[str] = None


class OrderPreviewOut(BaseModel):
    preview_id: str
    valid_until: str
    estimated_notional: str
    estimated_fees: dict
    estimated_cash_required: str
    available_cash: str
    lot_size: int
    warnings: list
    can_submit: bool


class OrderCreate(BaseModel):
    account_id: str
    preview_id: Optional[str] = None
    symbol: str
    side: str = Field(..., pattern="^(buy|sell)$")
    order_type: str = "market"
    qty: str
    limit_price: Optional[str] = None
    stop_price: Optional[str] = None
    time_in_force: str = "day"
    session: str = "regular"
    client_order_id: Optional[str] = None
    parent_order_id: Optional[str] = None
    oca_group_id: Optional[str] = None
    risk_acknowledgement_id: Optional[str] = None


class OrderStatusHistory(BaseModel):
    status: str
    at: str
    reason: Optional[str] = None


class OrderOut(BaseModel):
    id: str
    client_order_id: Optional[str]
    symbol: str
    side: str
    order_type: str
    qty: str
    filled_qty: str
    remaining_qty: Optional[str]
    limit_price: Optional[str]
    stop_price: Optional[str]
    time_in_force: str
    status: str
    status_history: List[OrderStatusHistory]
    commission: Optional[str]
    reserved_cash: Optional[str]
    reject_reason: Optional[str]
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True


class OrderReplace(BaseModel):
    qty: Optional[str] = None
    limit_price: Optional[str] = None
    stop_price: Optional[str] = None
    time_in_force: Optional[str] = None


# ── Fill ──
class FillOut(BaseModel):
    id: str
    order_id: str
    symbol: str
    side: str
    qty: str
    price: str
    fee: str
    exchange: Optional[str]
    trade_date: Optional[str]
    created_at: datetime


# ── Position ──
class PositionOut(BaseModel):
    symbol: str
    qty: str
    avg_entry_price: str
    market_value: str
    unrealized_pl: str
    unrealized_plpc: str


# ── FX ──
class FxRateOut(BaseModel):
    quote: str
    bid: str
    ask: str
    mid: str
    as_of: str


class FxRatesOut(BaseModel):
    base: str
    rates: List[FxRateOut]
    source: str


class FxQuoteReq(BaseModel):
    account_id: str
    from_currency: str = Field(..., max_length=4)
    to_currency: str = Field(..., max_length=4)
    from_amount: str


class FxQuoteOut(BaseModel):
    quote_id: str
    status: str
    from_currency: str
    to_currency: str
    from_amount: str
    gross_rate: str
    client_rate: str
    spread_bps: Optional[str]
    fee: dict
    to_amount: str
    debit_total: str
    expires_at: str


class FxConversionReq(BaseModel):
    account_id: str
    quote_id: str
    client_conversion_id: Optional[str] = None


class FxConversionOut(BaseModel):
    conversion_id: str
    status: str
    from_info: dict
    to_info: dict
    fee: dict
    ledger_transaction_id: Optional[str]
    executed_at: str


# ── Funding ──
class DepositCreate(BaseModel):
    account_id: str
    currency: str
    expected_amount: str
    method: str = "bank_wire"
    sender: Optional[dict] = None
    client_reference: Optional[str] = None


class DepositOut(BaseModel):
    deposit_id: str
    status: str
    currency: str
    expected_amount: str
    posted_amount: Optional[str] = None
    bank_instruction: Optional[dict]
    fee: str
    expires_at: Optional[str]
    created_at: str


class WithdrawalCreate(BaseModel):
    account_id: str
    currency: str
    amount: str
    bank_instruction_id: Optional[str] = None
    purpose: Optional[str] = None


class WithdrawalOut(BaseModel):
    withdrawal_id: str
    status: str
    amount: str
    fee: str
    total_reserved: str
    currency: str
    available_before: str
    available_after_reservation: str
    estimated_processing_date: Optional[str]
    created_at: str


# ── Admin ──
class LedgerAdjustmentCreate(BaseModel):
    account_id: str
    currency: str
    amount: str
    direction: str = Field("credit", pattern="^(credit|debit)$")
    reason_code: str
    external_reference: Optional[str] = None
    description: str
    evidence_urls: Optional[list] = None


class LedgerAdjustmentOut(BaseModel):
    adjustment_id: str
    status: str
    ledger_transaction_id: Optional[str]


class AdminDepositApprove(BaseModel):
    approved_amount: str
    value_date: str
    bank_transaction_id: Optional[str] = None
    note: Optional[str] = None


class AdminWithdrawalApprove(BaseModel):
    approved_amount: str
    value_date: str
    note: Optional[str] = None


class BankEvent(BaseModel):
    external_transaction_id: str
    value_date: str
    currency: str
    amount: str
    credit_debit: str = Field(..., pattern="^(credit|debit)$")
    reference: str
    sender_name: Optional[str] = None


# ── Ledger ──
class LedgerEntryOut(BaseModel):
    entry_id: str
    transaction_id: str
    account_id: str
    currency: str
    direction: str
    amount: str
    entry_type: str
    reference_type: Optional[str]
    reference_id: Optional[str]
    posted_at: str
    value_date: Optional[str]
    running_balance: Optional[str]


# ── Fee Estimate ──
class FeeEstimateReq(BaseModel):
    account_id: str
    operation: str = "equity_trade"
    symbol: str
    side: str = Field(..., pattern="^(buy|sell)$")
    qty: str
    price: str


class FeeComponentOut(BaseModel):
    code: str
    amount: str
    rate: Optional[str] = None
    beneficiary: Optional[str] = None


class FeeEstimateOut(BaseModel):
    currency: str
    notional: str
    components: List[FeeComponentOut]
    total: str
    rule_version: str
