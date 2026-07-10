"""
EVE FINANCE v3.0 — Bulk Stock Import
Imports full US (~12,667) and HK (~2,500) stock lists.
No existing code changes needed.
"""
import json, sys, time
from models_v3 import V3Asset, get_db, Base
from sqlalchemy import func

US_FILE = "/root/us_stock_symbols.json"
HK_FILE = "/root/hk_stock_list.json"
BATCH_SIZE = 500

def load_us_symbols():
    with open(US_FILE) as f:
        return json.load(f)

def load_hk_symbols():
    with open(HK_FILE) as f:
        data = json.load(f)
    return data.get("list", data) if isinstance(data, dict) else data

def import_stocks():
    db = next(get_db())
    
    # Count existing
    existing_count = db.query(V3Asset).count()
    print(f"Existing assets: {existing_count}")
    existing_symbols = {r[0] for r in db.query(V3Asset.symbol).all()}
    
    # ──── US STOCKS ────
    us_symbols = load_us_symbols()
    print(f"\nUS stock symbols: {len(us_symbols)}")
    
    us_assets = []
    for sym in us_symbols:
        key = sym.upper()
        if key in existing_symbols:
            continue
        # Determine exchange from symbol pattern
        if sym in ("BRK.A", "BRK.B") or sym.endswith(".A") or sym.endswith(".B"):
            exch = "NYSE"
        else:
            exch = "NASDAQ"  # default — Alpaca handles routing
        us_assets.append(V3Asset(
            symbol=key,
            name=key,
            exchange=exch,
            currency="USD",
            lot_size=1,
            shortable=True,
            fractionable=True,
            trade_status="tradable",
            permissions={"markets": ["US"], "order_types": ["market", "limit", "stop"]},
        ))
        existing_symbols.add(key)
    
    # Batch insert
    added_us = 0
    for i in range(0, len(us_assets), BATCH_SIZE):
        batch = us_assets[i:i+BATCH_SIZE]
        db.add_all(batch)
        db.commit()
        added_us += len(batch)
        print(f"  US: {added_us}/{len(us_assets)} imported...", end="\r")
    print(f"\n  US stocks imported: {added_us}")
    
    # ──── HK STOCKS ────
    hk_symbols = load_hk_symbols()
    print(f"\nHK stock symbols: {len(hk_symbols)}")
    
    # Known lot sizes
    known_lot = {
        "00700": 100, "09988": 100, "03690": 100, "00005": 400,
        "01299": 200, "01810": 200, "00939": 1000, "03988": 1000,
    }
    
    hk_assets = []
    added_hk = 0
    for code in hk_symbols:
        sym = f"{code}.HK"
        if sym in existing_symbols:
            continue
        
        lot = known_lot.get(code, 100)
        hk_assets.append(V3Asset(
            symbol=sym,
            name=f"HK Stock {code}",
            exchange="SEHK",
            currency="HKD",
            lot_size=lot,
            shortable=False,
            fractionable=False,
            trade_status="tradable",
            permissions={"markets": ["HK"], "order_types": ["market", "limit", "stop"]},
        ))
        existing_symbols.add(sym)
        
        # Also add zero-padded alias for 5-digit codes
        if len(code) == 4:
            padded = f"0{code}.HK"
            if padded not in existing_symbols:
                hk_assets.append(V3Asset(
                    symbol=padded,
                    name=f"HK Stock {code}",
                    exchange="SEHK",
                    currency="HKD",
                    lot_size=lot,
                    shortable=False,
                    fractionable=False,
                    trade_status="tradable",
                ))
                existing_symbols.add(padded)
        
        if len(hk_assets) >= BATCH_SIZE:
            db.add_all(hk_assets)
            db.commit()
            added_hk += len(hk_assets)
            hk_assets = []
            print(f"  HK: {added_hk}/{len(hk_symbols)} imported...", end="\r")
    
    if hk_assets:
        db.add_all(hk_assets)
        db.commit()
        added_hk += len(hk_assets)
    
    print(f"\n  HK stocks imported: {added_hk}")
    
    # ──── Summary ────
    total = db.query(V3Asset).count()
    by_exchange = db.query(V3Asset.exchange, func.count(V3Asset.asset_id)).group_by(V3Asset.exchange).all()
    
    print(f"\n{'='*50}")
    print(f"Final asset count: {total}")
    print(f"By exchange:")
    for ex, cnt in sorted(by_exchange, key=lambda x: -x[1]):
        print(f"  {ex}: {cnt}")
    print(f"{'='*50}")
    db.close()

if __name__ == "__main__":
    start = time.time()
    import_stocks()
    elapsed = time.time() - start
    print(f"\nTime: {elapsed:.1f}s")
