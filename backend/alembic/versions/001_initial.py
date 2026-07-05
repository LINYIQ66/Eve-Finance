"""Initial migration – creates all EVE Finance tables.

Revision ID: 001
Revises:
Create Date: 2024-01-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # companies
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email_domain", sa.String(255)),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("contact_email", sa.String(255)),
        sa.Column("contact_phone", sa.String(100)),
        sa.Column("address", sa.Text),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="user"),
        sa.Column("company_id", sa.Integer, sa.ForeignKey("companies.id"), nullable=True),
        sa.Column("account_status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("kyc_status", sa.String(50), nullable=False, server_default="not_submitted"),
        sa.Column("kyc_data", sa.JSON),
        sa.Column("wallet_balances", sa.JSON),
        sa.Column("stock_watchlist", sa.JSON),
        sa.Column("hk_stock_watchlist", sa.JSON),
        sa.Column("phone", sa.String(100)),
        sa.Column("nationality", sa.String(100)),
        sa.Column("date_of_birth", sa.Date),
        sa.Column("contact_number", sa.String(100)),
        sa.Column("address", sa.Text),
        sa.Column("allowed_modules", sa.JSON),
        sa.Column("last_login_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # transactions
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("transaction_type", sa.String(50), nullable=False),
        sa.Column("from_asset", sa.String(50)),
        sa.Column("to_asset", sa.String(50)),
        sa.Column("amount_usd", sa.Float),
        sa.Column("fee_usd", sa.Float, server_default="0"),
        sa.Column("exchange_rate", sa.Float),
        sa.Column("status", sa.String(50), server_default="completed"),
        sa.Column("description", sa.Text),
        sa.Column("eve_amount", sa.Float),
        sa.Column("total_cost_gold", sa.Float),
        sa.Column("total_cost_silver", sa.Float),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # fund_requests
    op.create_table(
        "fund_requests",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("request_type", sa.String(50), nullable=False),
        sa.Column("asset", sa.String(50), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("method", sa.String(100)),
        sa.Column("proof_of_payment_url", sa.Text),
        sa.Column("user_destination_details", sa.JSON),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("admin_notes", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # loans
    op.create_table(
        "loans",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("collateral_asset", sa.String(50), nullable=False),
        sa.Column("collateral_amount", sa.Float, nullable=False),
        sa.Column("loan_asset", sa.String(50), nullable=False),
        sa.Column("loan_amount", sa.Float, nullable=False),
        sa.Column("ltv_ratio", sa.Float),
        sa.Column("interest_rate", sa.Float),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("liquidation_threshold", sa.Float),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # stakes
    op.create_table(
        "stakes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("asset", sa.String(50), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("apr", sa.Float),
        sa.Column("start_date", sa.DateTime),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # physical_products
    op.create_table(
        "physical_products",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("image_url", sa.Text),
        sa.Column("stock_quantity", sa.Integer, server_default="0"),
        sa.Column("brand", sa.String(255)),
        sa.Column("base_price_gold", sa.Float),
        sa.Column("redemption_price_gold", sa.Float),
        sa.Column("base_price_silver", sa.Float),
        sa.Column("redemption_price_silver", sa.Float),
        sa.Column("details", sa.JSON),
        sa.Column("highlights", sa.JSON),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # physical_redemptions
    op.create_table(
        "physical_redemptions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("physical_products.id")),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer, server_default="1"),
        sa.Column("total_cost_gold", sa.Float),
        sa.Column("total_cost_silver", sa.Float),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("delivery_address", sa.Text),
        sa.Column("tracking_number", sa.String(255)),
        sa.Column("delivery_requested_date", sa.DateTime),
        sa.Column("delivery_notes", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # support_tickets
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("status", sa.String(50), server_default="open"),
        sa.Column("admin_response", sa.Text),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("admin_email", sa.String(255), nullable=False),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("target_user_email", sa.String(255)),
        sa.Column("details", sa.JSON),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # system_settings
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("setting_key", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("setting_value", sa.JSON),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("audit_logs")
    op.drop_table("support_tickets")
    op.drop_table("physical_redemptions")
    op.drop_table("physical_products")
    op.drop_table("stakes")
    op.drop_table("loans")
    op.drop_table("fund_requests")
    op.drop_table("transactions")
    op.drop_table("users")
    op.drop_table("companies")
