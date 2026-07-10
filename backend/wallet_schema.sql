-- EVE Finance — Unified Wallet System (PostgreSQL)
-- Double-entry bookkeeping, multi-currency, positions, orders, statements

-- ═══════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'user',  -- user, admin
    api_key       TEXT UNIQUE,
    kyc_status    TEXT DEFAULT 'approved',       -- pending, approved, rejected
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- ═══════════════════════════════════════════════
-- WALLETS (one per user, multi-currency)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wallets (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    label         TEXT DEFAULT 'Main Wallet',
    currency      TEXT NOT NULL DEFAULT 'USD',    -- base currency
    status        TEXT DEFAULT 'active',          -- active, frozen, closed
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- ═══════════════════════════════════════════════
-- BALANCES (one row per currency per wallet)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS balances (
    id            TEXT PRIMARY KEY,
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    currency      TEXT NOT NULL,                  -- USD, HKD, USDT, AAPL, 00700.HK, etc.
    available     NUMERIC(20,8) NOT NULL DEFAULT 0,  -- spendable
    frozen        NUMERIC(20,8) NOT NULL DEFAULT 0,  -- locked in orders
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wallet_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_balances_wallet ON balances(wallet_id);

-- ═══════════════════════════════════════════════
-- LEDGER (double-entry, append-only)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ledger (
    id            BIGSERIAL PRIMARY KEY,
    entry_id      TEXT UNIQUE NOT NULL,           -- uuid
    tx_id         TEXT NOT NULL,                  -- groups debit+credit entries
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    currency      TEXT NOT NULL,
    direction     TEXT NOT NULL,                  -- debit, credit
    amount        NUMERIC(20,8) NOT NULL,
    balance_after NUMERIC(20,8),                 -- snapshot after this entry
    entry_type    TEXT NOT NULL,                  -- deposit, withdraw, trade_buy, trade_sell, fx_convert, fee, frozen, unfrozen, transfer
    reference_id  TEXT,                           -- order_id, tx_id, etc.
    description   TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger(wallet_id, currency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_tx ON ledger(tx_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(entry_type, created_at DESC);

-- ═══════════════════════════════════════════════
-- TRANSACTIONS (high-level: deposit, withdraw, convert)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    type          TEXT NOT NULL,                  -- deposit, withdraw, convert, transfer
    status        TEXT DEFAULT 'completed',       -- pending, completed, failed, cancelled
    from_currency TEXT,
    from_amount   NUMERIC(20,8),
    to_currency   TEXT,
    to_amount     NUMERIC(20,8),
    rate          NUMERIC(20,8),                  -- FX rate used
    fee           NUMERIC(20,8) DEFAULT 0,
    description   TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type, created_at DESC);

-- ═══════════════════════════════════════════════
-- ORDERS (buy/sell stocks)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    symbol        TEXT NOT NULL,                  -- AAPL, 00700.HK
    side          TEXT NOT NULL,                  -- buy, sell
    order_type    TEXT DEFAULT 'market',          -- market, limit
    status        TEXT DEFAULT 'filled',          -- pending, filled, partial, cancelled, expired
    quantity      NUMERIC(20,8) NOT NULL,
    filled_qty    NUMERIC(20,8) DEFAULT 0,
    price         NUMERIC(20,8),                  -- limit price (null for market)
    avg_fill_price NUMERIC(20,8),                 -- actual fill price
    currency      TEXT NOT NULL,                  -- USD for US stocks, HKD for HK stocks
    total_cost    NUMERIC(20,8),                  -- actual cost/proceeds
    fee           NUMERIC(20,8) DEFAULT 0,
    market        TEXT,                           -- US, HK
    description   TEXT,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    filled_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ═══════════════════════════════════════════════
-- POSITIONS (current holdings)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS positions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    symbol        TEXT NOT NULL,                  -- AAPL, 00700.HK
    market        TEXT,                           -- US, HK
    quantity       NUMERIC(20,8) NOT NULL DEFAULT 0,
    avg_cost      NUMERIC(20,8) NOT NULL DEFAULT 0,  -- average cost basis
    total_cost    NUMERIC(20,8) NOT NULL DEFAULT 0,  -- total invested
    currency      TEXT NOT NULL,                  -- USD, HKD
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, wallet_id, symbol)
);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);

-- ═══════════════════════════════════════════════
-- FX RATES CACHE (for audit & cross-validation)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fx_rates (
    id            BIGSERIAL PRIMARY KEY,
    pair          TEXT NOT NULL,                  -- USD/HKD, USDT/USD
    rate          NUMERIC(20,8) NOT NULL,
    source        TEXT NOT NULL,                  -- er-api, binance, exchangerate-api
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair ON fx_rates(pair, created_at DESC);

-- ═══════════════════════════════════════════════
-- STATEMENTS (periodic snapshots)
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS statements (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    period        TEXT NOT NULL,                  -- 2026-07, 2026-Q2
    type          TEXT DEFAULT 'monthly',         -- daily, monthly, yearly
    balances_json JSONB NOT NULL,                 -- { USD: 1000, HKD: 5000, AAPL: 10 }
    positions_json JSONB NOT NULL,                -- [{ symbol, qty, avg_cost, market_value }]
    total_value_usd NUMERIC(20,8),               -- total portfolio value in USD
    pnl           NUMERIC(20,8),                 -- period P&L
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_statements_user ON statements(user_id, period DESC);

-- ═══════════════════════════════════════════════
-- STAKING
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS stakes (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    amount        NUMERIC(20,8) NOT NULL,
    apy           NUMERIC(8,4) DEFAULT 0.12,
    status        TEXT DEFAULT 'active',          -- active, unstaked, slashed
    staked_at     TIMESTAMPTZ DEFAULT NOW(),
    unstaked_at   TIMESTAMPTZ,
    rewards_claimed NUMERIC(20,8) DEFAULT 0
);

-- ═══════════════════════════════════════════════
-- LENDING
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS loans (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    wallet_id     TEXT NOT NULL REFERENCES wallets(id),
    collateral_currency TEXT NOT NULL,
    collateral_amount   NUMERIC(20,8) NOT NULL,
    loan_currency       TEXT NOT NULL,
    loan_amount         NUMERIC(20,8) NOT NULL,
    interest_rate  NUMERIC(8,4) DEFAULT 0.08,
    status        TEXT DEFAULT 'active',          -- active, repaid, liquidated
    repaid_amount NUMERIC(20,8) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    due_date      TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════
-- SEED: default admin + demo user
-- ═══════════════════════════════════════════════
INSERT INTO users (id, email, password_hash, full_name, role)
VALUES ('admin_001', 'admin@evefinance.com', 'admin_hash', 'EVE Admin', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, user_id, label, currency)
VALUES ('wallet_admin_001', 'admin_001', 'Admin Wallet', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO balances (id, wallet_id, currency, available)
VALUES 
    ('bal_admin_usd', 'wallet_admin_001', 'USD', 100000),
    ('bal_admin_hkd', 'wallet_admin_001', 'HKD', 500000),
    ('bal_admin_usdt', 'wallet_admin_001', 'USDT', 50000)
ON CONFLICT (wallet_id, currency) DO NOTHING;
