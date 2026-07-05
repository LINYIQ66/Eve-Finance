"""SQLAlchemy ORM models for all EVE Finance entities."""
from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, Date, ForeignKey,
    JSON, Boolean, Enum as SAEnum, func
)
from sqlalchemy.orm import relationship
from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email_domain = Column(String(255), nullable=True)
    status = Column(String(50), default="active")  # active / inactive
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="company")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="user", nullable=False)  # user / admin
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    account_status = Column(String(50), default="pending", nullable=False)  # pending / active / suspended / banned
    kyc_status = Column(String(50), default="not_submitted", nullable=False)  # not_submitted / pending / approved / rejected
    kyc_data = Column(JSON, default=dict, nullable=True)

    wallet_balances = Column(JSON, default=dict, nullable=True)
    stock_watchlist = Column(JSON, default=list, nullable=True)
    hk_stock_watchlist = Column(JSON, default=list, nullable=True)

    phone = Column(String(100), nullable=True)
    nationality = Column(String(100), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    contact_number = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    allowed_modules = Column(JSON, default=list, nullable=True)

    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="users")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    fund_requests = relationship("FundRequest", back_populates="user", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="user", cascade="all, delete-orphan")
    stakes = relationship("Stake", back_populates="user", cascade="all, delete-orphan")
    redemptions = relationship("PhysicalRedemption", back_populates="user", cascade="all, delete-orphan")
    support_tickets = relationship("SupportTicket", back_populates="user", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    transaction_type = Column(String(50), nullable=False)  # trade / deposit / withdraw / transfer
    from_asset = Column(String(50), nullable=True)
    to_asset = Column(String(50), nullable=True)
    amount_usd = Column(Float, nullable=True)
    fee_usd = Column(Float, default=0)
    exchange_rate = Column(Float, nullable=True)
    status = Column(String(50), default="completed")  # pending / completed / failed / cancelled
    description = Column(Text, nullable=True)
    eve_amount = Column(Float, nullable=True)
    total_cost_gold = Column(Float, nullable=True)
    total_cost_silver = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="transactions")


class FundRequest(Base):
    __tablename__ = "fund_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    request_type = Column(String(50), nullable=False)  # deposit / withdraw
    asset = Column(String(50), nullable=False)  # USD / EVE / GOLD / SILVER
    amount = Column(Float, nullable=False)
    method = Column(String(100), nullable=True)  # bank_transfer / crypto / etc.
    proof_of_payment_url = Column(Text, nullable=True)
    user_destination_details = Column(JSON, default=dict, nullable=True)
    status = Column(String(50), default="pending")  # pending / approved / rejected / completed
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="fund_requests")


class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    collateral_asset = Column(String(50), nullable=False)
    collateral_amount = Column(Float, nullable=False)
    loan_asset = Column(String(50), nullable=False)
    loan_amount = Column(Float, nullable=False)
    ltv_ratio = Column(Float, nullable=True)
    interest_rate = Column(Float, nullable=True)
    status = Column(String(50), default="active")  # active / repaid / liquidated
    liquidation_threshold = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="loans")


class Stake(Base):
    __tablename__ = "stakes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    asset = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    apr = Column(Float, nullable=True)
    start_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="active")  # active / completed / cancelled
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="stakes")


class PhysicalProduct(Base):
    __tablename__ = "physical_products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=True)
    stock_quantity = Column(Integer, default=0)
    brand = Column(String(255), nullable=True)
    base_price_gold = Column(Float, nullable=True)
    redemption_price_gold = Column(Float, nullable=True)
    base_price_silver = Column(Float, nullable=True)
    redemption_price_silver = Column(Float, nullable=True)
    details = Column(JSON, default=dict, nullable=True)
    highlights = Column(JSON, default=list, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    redemptions = relationship("PhysicalRedemption", back_populates="product")


class PhysicalRedemption(Base):
    __tablename__ = "physical_redemptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("physical_products.id"), nullable=True)
    product_name = Column(String(255), nullable=False)
    quantity = Column(Integer, default=1)
    total_cost_gold = Column(Float, nullable=True)
    total_cost_silver = Column(Float, nullable=True)
    status = Column(String(50), default="pending")  # pending / approved / shipped / delivered / cancelled
    delivery_address = Column(Text, nullable=True)
    tracking_number = Column(String(255), nullable=True)
    delivery_requested_date = Column(DateTime, nullable=True)
    delivery_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="redemptions")
    product = relationship("PhysicalProduct", back_populates="redemptions")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(500), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(100), nullable=True)
    status = Column(String(50), default="open")  # open / in_progress / resolved / closed
    admin_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="support_tickets")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_email = Column(String(255), nullable=False)
    action = Column(String(255), nullable=False)
    target_user_email = Column(String(255), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String(255), unique=True, nullable=False, index=True)
    setting_value = Column(JSON, nullable=True)
