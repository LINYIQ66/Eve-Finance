"""
EVE FINANCE v3.0 — Database Models
White-label brokerage: tenants, clients, users, accounts, assets,
double-entry ledger, funding, FX, audit, idempotency.
"""

import uuid, hashlib, secrets, time
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Float, Integer, DateTime, ForeignKey, Boolean, Text,
    JSON, UniqueConstraint, Index, create_engine
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

Base = declarative_base()

def utcnow():
    return datetime.now(timezone.utc)

def gen_id(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:24]}"

def gen_token():
    return secrets.token_urlsafe(48)

def gen_api_key():
    return f"ev_live_{secrets.token_urlsafe(32)}"


# ═══════════════════════════════════════════════
# TENANT (white-label partner)
# ═══════════════════════════════════════════════
class Tenant(Base):
    __tablename__ = "v3_tenants"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("ten_"))
    name = Column(String(128), nullable=False)
    status = Column(String(16), default="active")  # active / suspended / closed
    fee_plan_id = Column(String(36), nullable=True)
    branding_config = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    clients = relationship("V3Client", back_populates="tenant")


# ═══════════════════════════════════════════════
# CLIENT (legal person / individual)
# ═══════════════════════════════════════════════
class V3Client(Base):
    __tablename__ = "v3_clients"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("cli_"))
    tenant_id = Column(String(36), ForeignKey("v3_tenants.id"), nullable=False)
    legal_type = Column(String(16), default="individual")  # individual / corporate
    legal_name = Column(String(256), nullable=False)
    country = Column(String(4), default="SG")
    base_currency = Column(String(4), default="USD")
    status = Column(String(16), default="active")
    kyc_status = Column(String(16), default="pending")  # pending / approved / rejected
    risk_tier = Column(String(16), default="standard")  # standard / high / restricted
    api_key = Column(String(128), unique=True, nullable=True, index=True)
    api_secret = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    tenant = relationship("Tenant", back_populates="clients")
    accounts = relationship("V3Account", back_populates="client")
    users = relationship("V3User", back_populates="client")


# ═══════════════════════════════════════════════
# USER (login identity under a client)
# ═══════════════════════════════════════════════
class V3User(Base):
    __tablename__ = "v3_users"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("usr_"))
    client_id = Column(String(36), ForeignKey("v3_clients.id"), nullable=False)
    email = Column(String(256), unique=True, nullable=False)
    role = Column(String(32), default="trader")  # trader / admin / super_admin
    mfa_status = Column(String(16), default="disabled")
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=utcnow)

    client = relationship("V3Client", back_populates="users")


# ═══════════════════════════════════════════════
# ACCOUNT (trading account with multi-currency ledgers)
# ═══════════════════════════════════════════════
class V3Account(Base):
    __tablename__ = "v3_accounts"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("acc_"))
    tenant_id = Column(String(36), ForeignKey("v3_tenants.id"), nullable=False)
    client_id = Column(String(36), ForeignKey("v3_clients.id"), nullable=False)
    account_number = Column(String(32), unique=True, nullable=False)
    type = Column(String(16), default="cash")  # cash / margin
    status = Column(String(16), default="active")
    base_currency = Column(String(4), default="USD")
    enabled_currencies = Column(JSON, default=lambda: ["USD", "HKD"])
    trading_permissions = Column(JSON, default=lambda: ["US_STOCKS", "HK_STOCKS", "FX_CONVERSION"])
    fractional_shares = Column(JSON, default=lambda: {"US": True, "HK": False})
    created_at = Column(DateTime, default=utcnow)

    client = relationship("V3Client", back_populates="accounts")
    orders = relationship("V3Order", back_populates="account")
    positions = relationship("V3Position", back_populates="account")

    __table_args__ = (
        Index("idx_v3_acc_client", "client_id"),
        Index("idx_v3_acc_tenant", "tenant_id"),
    )


# ═══════════════════════════════════════════════
# ASSET MASTER
# ═══════════════════════════════════════════════
class V3Asset(Base):
    __tablename__ = "v3_assets"
    asset_id = Column(String(36), primary_key=True, default=lambda: gen_id("ast_"))
    symbol = Column(String(32), nullable=False, index=True)
    name = Column(String(256), nullable=False)
    asset_class = Column(String(32), default="equity")
    exchange = Column(String(16), nullable=False)
    currency = Column(String(4), nullable=False)
    lot_size = Column(Integer, default=1)
    odd_lot_supported = Column(Boolean, default=False)
    tick_size_rule_id = Column(String(64), nullable=True)
    shortable = Column(Boolean, default=False)
    fractionable = Column(Boolean, default=False)
    trade_status = Column(String(16), default="tradable")
    permissions = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        UniqueConstraint("symbol", "exchange", name="uq_v3_asset_symbol_exchange"),
    )


# ═══════════════════════════════════════════════
# LEDGER TRANSACTIONS (double-entry groups)
# ═══════════════════════════════════════════════
class V3LedgerTransaction(Base):
    __tablename__ = "v3_ledger_transactions"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("ltx_"))
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    journal_type = Column(String(32), nullable=False)  # deposit, withdrawal, trade_cash, fee, fx_conversion, dividend, tax, adjustment, reversal
    status = Column(String(16), default="posted")  # pending / posted / reversed
    value_date = Column(String(10), nullable=True)  # ISO date
    effective_at = Column(DateTime, default=utcnow)
    reference_type = Column(String(32), nullable=True)
    reference_id = Column(String(36), nullable=True)
    source_system = Column(String(32), default="eve")
    reason_code = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    created_by = Column(String(36), nullable=True)
    approved_by = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    entries = relationship("V3LedgerEntry", back_populates="transaction")


# ═══════════════════════════════════════════════
# LEDGER ENTRIES (individual debit/credit lines)
# ═══════════════════════════════════════════════
class V3LedgerEntry(Base):
    __tablename__ = "v3_ledger_entries"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("le_"))
    transaction_id = Column(String(36), ForeignKey("v3_ledger_transactions.id"), nullable=False)
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    currency = Column(String(4), nullable=False)
    direction = Column(String(8), nullable=False)  # debit / credit
    amount = Column(Text, nullable=False)  # decimal string
    entry_type = Column(String(32), nullable=False)  # principal, fee, tax, fx_gain_loss
    posted_at = Column(DateTime, default=utcnow)
    value_date = Column(String(10), nullable=True)
    running_balance = Column(Text, nullable=True)  # decimal string

    transaction = relationship("V3LedgerTransaction", back_populates="entries")


# ═══════════════════════════════════════════════
# ORDER
# ═══════════════════════════════════════════════
V3_ORDER_STATUSES = [
    "received", "pending_review", "accepted", "working",
    "partially_filled", "filled", "cancel_pending", "cancelled",
    "rejected", "expired",
]

class V3Order(Base):
    __tablename__ = "v3_orders"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("ord_"))
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    client_order_id = Column(String(128), index=True)
    idempotency_key = Column(String(128), unique=True, nullable=True)
    symbol = Column(String(32), nullable=False)
    side = Column(String(4), nullable=False)  # buy / sell
    order_type = Column(String(20), default="market")
    qty = Column(Text, nullable=False)  # decimal string
    filled_qty = Column(Text, default="0")
    remaining_qty = Column(Text, nullable=True)
    limit_price = Column(Text, nullable=True)
    stop_price = Column(Text, nullable=True)
    time_in_force = Column(String(8), default="day")
    session = Column(String(16), default="regular")
    status = Column(String(24), default="received")
    status_history = Column(JSON, default=lambda: [])
    filled_avg_price = Column(Text, nullable=True)
    commission = Column(Text, nullable=True)
    parent_order_id = Column(String(36), nullable=True)
    oca_group_id = Column(String(36), nullable=True)
    reserved_cash = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)
    upstream_order_id = Column(String(64), nullable=True)
    version = Column(Integer, default=1)
    preview_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    account = relationship("V3Account", back_populates="orders")
    fills = relationship("V3Fill", back_populates="order")

    __table_args__ = (
        Index("idx_v3_order_status", "status"),
        Index("idx_v3_order_account", "account_id"),
    )


# ═══════════════════════════════════════════════
# FILL
# ═══════════════════════════════════════════════
class V3Fill(Base):
    __tablename__ = "v3_fills"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("fil_"))
    order_id = Column(String(36), ForeignKey("v3_orders.id"), nullable=False)
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    symbol = Column(String(32), nullable=False)
    side = Column(String(4), nullable=False)
    qty = Column(Text, nullable=False)
    price = Column(Text, nullable=False)
    fee = Column(Text, default="0")
    exchange = Column(String(16), nullable=True)
    trade_date = Column(String(10), nullable=True)
    settlement_date = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    order = relationship("V3Order", back_populates="fills")


# ═══════════════════════════════════════════════
# POSITION
# ═══════════════════════════════════════════════
class V3Position(Base):
    __tablename__ = "v3_positions"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("pos_"))
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    symbol = Column(String(32), nullable=False)
    qty = Column(Text, default="0")
    avg_entry_price = Column(Text, default="0")
    market_value = Column(Text, default="0")
    unrealized_pl = Column(Text, default="0")
    unrealized_plpc = Column(Text, default="0")
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    account = relationship("V3Account", back_populates="positions")

    __table_args__ = (
        UniqueConstraint("account_id", "symbol", name="uq_v3_pos_acc_sym"),
    )


# ═══════════════════════════════════════════════
# FUNDING INSTRUCTIONS (deposits / withdrawals)
# ═══════════════════════════════════════════════
class V3FundingInstruction(Base):
    __tablename__ = "v3_funding_instructions"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("dep_" if True else "wdr_"))
    # We'll set prefix dynamically via type field
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    type = Column(String(16), nullable=False)  # deposit / withdrawal
    status = Column(String(24), default="created")
    currency = Column(String(4), nullable=False)
    expected_amount = Column(Text, nullable=False)
    posted_amount = Column(Text, nullable=True)
    fee = Column(Text, default="0")
    method = Column(String(32), nullable=True)  # bank_wire / internal
    bank_instruction = Column(JSON, nullable=True)
    external_transaction_id = Column(String(128), nullable=True)
    compliance_status = Column(String(16), default="pending")
    ledger_transaction_id = Column(String(36), nullable=True)
    value_date = Column(String(10), nullable=True)
    sender_info = Column(JSON, nullable=True)
    client_reference = Column(String(128), nullable=True)
    approved_by = Column(String(36), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("idx_v3_fund_status", "status"),
        Index("idx_v3_fund_account", "account_id"),
    )


# ═══════════════════════════════════════════════
# FX QUOTE (executable quote)
# ═══════════════════════════════════════════════
class V3FxQuote(Base):
    __tablename__ = "v3_fx_quotes"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("fxq_"))
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    status = Column(String(16), default="active")  # active / expired / executed
    from_currency = Column(String(4), nullable=False)
    to_currency = Column(String(4), nullable=False)
    from_amount = Column(Text, nullable=False)
    gross_rate = Column(Text, nullable=False)
    client_rate = Column(Text, nullable=False)
    spread_bps = Column(Text, nullable=True)
    fee_amount = Column(Text, default="0")
    fee_currency = Column(String(4), nullable=True)
    to_amount = Column(Text, nullable=False)
    debit_total = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow)


# ═══════════════════════════════════════════════
# FX CONVERSION
# ═══════════════════════════════════════════════
class V3FxConversion(Base):
    __tablename__ = "v3_fx_conversions"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("fxc_"))
    quote_id = Column(String(36), ForeignKey("v3_fx_quotes.id"), nullable=False)
    account_id = Column(String(36), ForeignKey("v3_accounts.id"), nullable=False)
    status = Column(String(16), default="completed")  # pending / completed / failed
    from_currency = Column(String(4), nullable=False)
    from_amount = Column(Text, nullable=False)
    to_currency = Column(String(4), nullable=False)
    to_amount = Column(Text, nullable=False)
    fee_amount = Column(Text, default="0")
    fee_currency = Column(String(4), nullable=True)
    ledger_transaction_id = Column(String(36), nullable=True)
    client_conversion_id = Column(String(128), nullable=True)
    executed_at = Column(DateTime, default=utcnow)


# ═══════════════════════════════════════════════
# FEE RULE (effective-dated fee config)
# ═══════════════════════════════════════════════
class V3FeeRule(Base):
    __tablename__ = "v3_fee_rules"
    id = Column(String(36), primary_key=True, default=gen_id)
    scope = Column(String(64), nullable=False)  # market, asset_class, tenant, client_tier
    component = Column(String(32), nullable=False)  # commission, stamp_duty, trading_fee, sfc_levy, settlement_fee
    formula = Column(String(256), nullable=False)  # percentage / fixed / tiered
    rate = Column(Text, nullable=False)  # decimal rate
    min_amount = Column(Text, nullable=True)
    max_amount = Column(Text, nullable=True)
    rounding = Column(String(16), default="floor")
    side = Column(String(8), nullable=True)  # buy / sell / both
    effective_from = Column(String(10), nullable=False)
    effective_to = Column(String(10), nullable=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=utcnow)


# ═══════════════════════════════════════════════
# AUDIT EVENT (immutable audit log)
# ═══════════════════════════════════════════════
class V3AuditEvent(Base):
    __tablename__ = "v3_audit_events"
    id = Column(String(36), primary_key=True, default=lambda: gen_id("aud_"))
    actor = Column(String(64), nullable=False)
    actor_role = Column(String(32), nullable=True)
    action = Column(String(64), nullable=False)
    object_type = Column(String(32), nullable=False)
    object_id = Column(String(36), nullable=False)
    before_hash = Column(String(64), nullable=True)
    after_hash = Column(String(64), nullable=True)
    reason = Column(Text, nullable=True)
    request_id = Column(String(64), nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (
        Index("idx_v3_audit_action", "action"),
        Index("idx_v3_audit_object", "object_type", "object_id"),
    )


# ═══════════════════════════════════════════════
# IDEMPOTENCY KEY STORE
# ═══════════════════════════════════════════════
class V3IdempotencyKey(Base):
    __tablename__ = "v3_idempotency_keys"
    id = Column(String(36), primary_key=True, default=gen_id)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    endpoint = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_body = Column(JSON, nullable=False)
    status_code = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow)

# ═══════════════════════════════════════════════
# WEBHOOK CONFIG
# ═══════════════════════════════════════════════
class V3WebhookConfig(Base):
    __tablename__ = "v3_webhook_configs"
    id = Column(String(36), primary_key=True, default=gen_id)
    tenant_id = Column(String(36), ForeignKey("v3_tenants.id"), nullable=False)
    url = Column(String(512), nullable=False)
    secret = Column(String(128), nullable=False)
    events = Column(JSON, nullable=False)
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=utcnow)


# ═══════════════════════════════════════════════
# DATABASE
# ═══════════════════════════════════════════════
DATABASE_URL = "sqlite:///./eve_finance_v3.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ═══════════════════════════════════════════════
# SEED DATA
# ═══════════════════════════════════════════════
def seed_v3():
    """Seed default tenant, admin client, anonymous demo accounts."""
    db = SessionLocal()
    try:
        # Default tenant
        tenant = db.query(Tenant).filter(Tenant.name == "KOPI AI Agent").first()
        if not tenant:
            tenant = Tenant(name="KOPI AI Agent", status="active")
            db.add(tenant)
            db.flush()
            print(f"[SEED v3] Tenant: {tenant.id}")

        # Admin client
        admin = db.query(V3Client).filter(V3Client.legal_name == "EVE Admin").first()
        if not admin:
            admin = V3Client(
                tenant_id=tenant.id, legal_type="corporate",
                legal_name="EVE Admin", country="SG",
                base_currency="USD", kyc_status="approved",
                api_key="ev_admin_master_key_v3", api_secret="admin_secret_v3",
            )
            db.add(admin)
            db.flush()
            db.add(V3User(client_id=admin.id, email="admin@evefinance.com", role="super_admin"))
        if not db.query(V3Account).filter(V3Account.client_id == admin.id).first():
            db.add(V3Account(
                tenant_id=tenant.id, client_id=admin.id,
                account_number="EVE-ADMIN-001",
            ))
            print("[SEED v3] Admin account created")

        # Anonymous client for demo
        anon = db.query(V3Client).filter(V3Client.legal_name == "Anonymous Demo").first()
        if not anon:
            anon = V3Client(
                tenant_id=tenant.id, legal_type="individual",
                legal_name="Anonymous Demo", country="SG",
                base_currency="USD", kyc_status="approved",
                api_key=None, api_secret=None,
            )
            db.add(anon)
            db.flush()
            # USD demo account
            db.add(V3Account(
                tenant_id=tenant.id, client_id=anon.id,
                account_number="EVE-DEMO-USD",
                base_currency="USD", enabled_currencies=["USD", "HKD"],
                trading_permissions=["US_STOCKS", "HK_STOCKS", "FX_CONVERSION"],
            ))
            # HKD demo account
            db.add(V3Account(
                tenant_id=tenant.id, client_id=anon.id,
                account_number="EVE-DEMO-HKD",
                base_currency="HKD", enabled_currencies=["HKD"],
                trading_permissions=["HK_STOCKS"],
            ))
            print("[SEED v3] Anonymous demo accounts created")

        # Seed HK assets
        hk_assets = [
            ("0700.HK", "SEHK", "Tencent Holdings Ltd", "HKD", 100),
            ("9988.HK", "SEHK", "Alibaba Group Holding Ltd", "HKD", 100),
            ("3690.HK", "SEHK", "Meituan", "HKD", 100),
            ("0005.HK", "SEHK", "HSBC Holdings plc", "HKD", 400),
            ("1299.HK", "SEHK", "AIA Group Ltd", "HKD", 200),
            ("1810.HK", "SEHK", "Xiaomi Corporation", "HKD", 200),
            ("939.HK", "SEHK", "China Construction Bank", "HKD", 1000),
            ("3988.HK", "SEHK", "Bank of China Ltd", "HKD", 1000),
        ]
        for sym, ex, name, ccy, lot in hk_assets:
            exist = db.query(V3Asset).filter(V3Asset.symbol == sym, V3Asset.exchange == ex).first()
            if not exist:
                db.add(V3Asset(
                    symbol=sym, name=name, exchange=ex, currency=ccy,
                    lot_size=lot, shortable=False, fractionable=False,
                ))
        # US assets (sample)
        us_assets = [
            ("AAPL", "NASDAQ", "Apple Inc.", "USD", 1, True),
            ("MSFT", "NASDAQ", "Microsoft Corporation", "USD", 1, True),
            ("GOOGL", "NASDAQ", "Alphabet Inc.", "USD", 1, True),
            ("AMZN", "NASDAQ", "Amazon.com Inc.", "USD", 1, True),
            ("TSLA", "NASDAQ", "Tesla Inc.", "USD", 1, True),
            ("NVDA", "NASDAQ", "NVIDIA Corporation", "USD", 1, True),
            ("META", "NASDAQ", "Meta Platforms Inc.", "USD", 1, True),
            ("JPM", "NYSE", "JPMorgan Chase & Co.", "USD", 1, True),
        ]
        for sym, ex, name, ccy, lot, frac in us_assets:
            exist = db.query(V3Asset).filter(V3Asset.symbol == sym, V3Asset.exchange == ex).first()
            if not exist:
                db.add(V3Asset(
                    symbol=sym, name=name, exchange=ex, currency=ccy,
                    lot_size=lot, fractionable=frac, shortable=True,
                ))

        # Seed demo balances for anonymous accounts
        usd_acc = db.query(V3Account).filter(V3Account.account_number == "EVE-DEMO-USD").first()
        if usd_acc and not db.query(V3LedgerTransaction).filter(
            V3LedgerTransaction.account_id == usd_acc.id
        ).first():
            _create_seed_balance(db, usd_acc, "USD", "100000.00")

        hkd_acc = db.query(V3Account).filter(V3Account.account_number == "EVE-DEMO-HKD").first()
        if hkd_acc and not db.query(V3LedgerTransaction).filter(
            V3LedgerTransaction.account_id == hkd_acc.id
        ).first():
            _create_seed_balance(db, hkd_acc, "HKD", "1000000.00")

        db.commit()
        print("[SEED v3] Complete")
    finally:
        db.close()


def _create_seed_balance(db, account, currency, amount):
    """Create seed balance via proper ledger transaction."""
    tx = V3LedgerTransaction(
        account_id=account.id,
        journal_type="adjustment",
        status="posted",
        value_date="2026-07-10",
        reference_type="system_seed",
        reason_code="SYSTEM_SEED",
        description=f"Seed balance {currency} {amount}",
        source_system="eve",
    )
    db.add(tx)
    db.flush()
    entry = V3LedgerEntry(
        transaction_id=tx.id,
        account_id=account.id,
        currency=currency,
        direction="credit",
        amount=amount,
        entry_type="principal",
        value_date="2026-07-10",
        running_balance=amount,
    )
    db.add(entry)


# ═══════════════════════════════════════════════
# BALANCE DERIVATION (from ledger entries)
# ═══════════════════════════════════════════════
def get_cash_balances(db, account_id: str, currencies: list = None):
    """Derive cash balances from immutable ledger entries.
    Returns dict of currency -> {total, settled, available, withdrawable, reserved}
    """
    from sqlalchemy import func
    query = db.query(
        V3LedgerEntry.currency,
        V3LedgerEntry.direction,
        func.sum(func.cast(V3LedgerEntry.amount, Float))
    ).filter(
        V3LedgerEntry.account_id == account_id,
        V3LedgerEntry.entry_type == "principal"
    )
    if currencies:
        query = query.filter(V3LedgerEntry.currency.in_(currencies))
    rows = query.group_by(V3LedgerEntry.currency, V3LedgerEntry.direction).all()

    totals = {}
    for currency, direction, amount in rows:
        if currency not in totals:
            totals[currency] = 0.0
        if direction == "credit":
            totals[currency] += float(amount)
        else:
            totals[currency] -= float(amount)

    result = {}
    for ccy, total in totals.items():
        result[ccy] = {
            "total": f"{total:.2f}",
            "available": f"{total:.2f}",
            "withdrawable": f"{total:.2f}",
            "reserved": "0.00",
        }
    return result
