"""Standalone script: create or promote an admin user.

Usage:
    python -m app.scripts.create_admin admin@evefinance.com secret_password "Admin User"

Or set env vars:
    ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
"""
import asyncio
import os
import sys

from sqlalchemy import select

from app.database import async_session_factory
from app.models import User
from app.auth import hash_password


async def create_or_promote_admin(email: str, password: str, full_name: str):
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.role = "admin"
            user.account_status = "active"
            user.kyc_status = "approved"
            user.password_hash = hash_password(password)
            await db.commit()
            print(f"Existing user {email} promoted to admin.")
        else:
            user = User(
                email=email,
                password_hash=hash_password(password),
                full_name=full_name,
                role="admin",
                account_status="active",
                kyc_status="approved",
                wallet_balances={"USD": 0.0, "EVE": 0.0, "GOLD": 0.0, "SILVER": 0.0},
                stock_watchlist=[],
                hk_stock_watchlist=[],
                allowed_modules=["*"],
            )
            db.add(user)
            await db.commit()
            print(f"Admin user {email} created.")


def main():
    email = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ADMIN_EMAIL", "admin@evefinance.com")
    password = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("ADMIN_PASSWORD", "admin123456")
    full_name = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("ADMIN_NAME", "EVE Admin")
    asyncio.run(create_or_promote_admin(email, password, full_name))


if __name__ == "__main__":
    main()
