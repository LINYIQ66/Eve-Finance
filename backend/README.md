# EVE Finance Backend

Independent FastAPI + PostgreSQL backend. Fully replaces base44.

## Quick Start

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create the database
createdb eve_finance

# (Optional) Run Alembic migration
alembic upgrade head

# Or just start the server — tables are auto-created on first run
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment

Copy `.env.example` to `.env` and adjust:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/eve_finance
JWT_SECRET=<your-secret>
```

## Create an Admin

```bash
python -m app.scripts.create_admin admin@evefinance.com yourpassword "Admin Name"
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user (pending status) |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/kyc/submit` | Submit KYC documents |
| GET | `/api/kyc/status` | Check KYC status |
| GET | `/api/user/transactions` | User's transactions |
| PUT | `/api/user/wallet` | Update wallet balances |
| GET | `/api/user/watchlist` | Get watchlists |
| POST | `/api/user/watchlist` | Add/remove from watchlist |
| GET | `/api/admin/users` | All users (admin) |
| PUT | `/api/admin/users/{id}/kyc` | Approve/reject KYC (admin) |
| GET | `/api/admin/transactions` | All transactions (admin) |
| GET | `/api/admin/fund-requests` | All fund requests (admin) |
| PUT | `/api/admin/fund-requests/{id}` | Approve/reject fund request (admin) |
| GET | `/api/admin/audit-logs` | Audit logs (admin) |
| GET | `/api/admin/stats` | Dashboard stats (admin) |
