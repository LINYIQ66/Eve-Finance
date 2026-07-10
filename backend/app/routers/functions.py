"""
Stock Price Functions — Proxy endpoints for the React frontend.
Replaces the base44 Deno edge functions with Python equivalents.
No auth required (public market data).
"""
import httpx
import time
import asyncio
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/functions", tags=["functions"])

# ── Default stock list (matches frontend DEFAULT_STOCKS) ──
DEFAULT_STOCKS = [
    {"symbol": "AAPL", "name": "Apple"},
    {"symbol": "MSFT", "name": "Microsoft"},
    {"symbol": "NVDA", "name": "NVIDIA"},
    {"symbol": "AMZN", "name": "Amazon"},
    {"symbol": "GOOGL", "name": "Alphabet"},
    {"symbol": "META", "name": "Meta"},
    {"symbol": "TSLA", "name": "Tesla"},
    {"symbol": "AMD", "name": "AMD"},
    {"symbol": "INTC", "name": "Intel"},
    {"symbol": "SNDK", "name": "SanDisk"},
    {"symbol": "MU", "name": "Micron"},
    {"symbol": "MSTR", "name": "MicroStrategy"},
    {"symbol": "PLTR", "name": "Palantir"},
    {"symbol": "HOOD", "name": "Robinhood"},
    {"symbol": "NFLX", "name": "Netflix"},
    {"symbol": "ORCL", "name": "Oracle"},
    {"symbol": "COIN", "name": "Coinbase"},
    {"symbol": "BABA", "name": "Alibaba"},
    {"symbol": "OPENAI", "name": "OpenAI"},
    {"symbol": "CRWV", "name": "CoreWeave"},
]

# All known US stocks for search
ALL_STOCKS = DEFAULT_STOCKS + [
    {"symbol": "JPM", "name": "JPMorgan Chase", "exchange": "NYSE"},
    {"symbol": "V", "name": "Visa", "exchange": "NYSE"},
    {"symbol": "MA", "name": "Mastercard", "exchange": "NYSE"},
    {"symbol": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE"},
    {"symbol": "WMT", "name": "Walmart", "exchange": "NYSE"},
    {"symbol": "PG", "name": "Procter & Gamble", "exchange": "NYSE"},
    {"symbol": "DIS", "name": "Walt Disney", "exchange": "NYSE"},
    {"symbol": "BAC", "name": "Bank of America", "exchange": "NYSE"},
    {"symbol": "XOM", "name": "Exxon Mobil", "exchange": "NYSE"},
    {"symbol": "KO", "name": "Coca-Cola", "exchange": "NYSE"},
    {"symbol": "PEP", "name": "PepsiCo", "exchange": "NASDAQ"},
    {"symbol": "PFE", "name": "Pfizer", "exchange": "NYSE"},
    {"symbol": "AVGO", "name": "Broadcom", "exchange": "NASDAQ"},
    {"symbol": "NFLX", "name": "Netflix", "exchange": "NASDAQ"},
    {"symbol": "ADBE", "name": "Adobe", "exchange": "NASDAQ"},
    {"symbol": "CRM", "name": "Salesforce", "exchange": "NYSE"},
    {"symbol": "QCOM", "name": "Qualcomm", "exchange": "NASDAQ"},
    {"symbol": "CSCO", "name": "Cisco", "exchange": "NASDAQ"},
    {"symbol": "ORCL", "name": "Oracle", "exchange": "NYSE"},
    {"symbol": "IBM", "name": "IBM", "exchange": "NYSE"},
    {"symbol": "SBUX", "name": "Starbucks", "exchange": "NASDAQ"},
    {"symbol": "NKE", "name": "Nike", "exchange": "NYSE"},
    {"symbol": "PYPL", "name": "PayPal", "exchange": "NASDAQ"},
    {"symbol": "SHOP", "name": "Shopify", "exchange": "NYSE"},
    {"symbol": "UBER", "name": "Uber", "exchange": "NYSE"},
    {"symbol": "ABNB", "name": "Airbnb", "exchange": "NASDAQ"},
    {"symbol": "SNOW", "name": "Snowflake", "exchange": "NYSE"},
    {"symbol": "TCEHY", "name": "Tencent ADR", "exchange": "OTC"},
    {"symbol": "PDD", "name": "PDD Holdings", "exchange": "NASDAQ"},
    {"symbol": "JD", "name": "JD.com ADR", "exchange": "NASDAQ"},
    {"symbol": "BIDU", "name": "Baidu ADR", "exchange": "NASDAQ"},
    {"symbol": "NIO", "name": "NIO Inc.", "exchange": "NYSE"},
    {"symbol": "LI", "name": "Li Auto", "exchange": "NASDAQ"},
    {"symbol": "TSM", "name": "TSMC ADR", "exchange": "NYSE"},
    {"symbol": "ASML", "name": "ASML ADR", "exchange": "NASDAQ"},
    {"symbol": "BA", "name": "Boeing", "exchange": "NYSE"},
    {"symbol": "CAT", "name": "Caterpillar", "exchange": "NYSE"},
    {"symbol": "SPOT", "name": "Spotify", "exchange": "NYSE"},
    {"symbol": "SNAP", "name": "Snap", "exchange": "NYSE"},
    {"symbol": "GME", "name": "GameStop", "exchange": "NYSE"},
    {"symbol": "AMC", "name": "AMC Entertainment", "exchange": "NYSE"},
    {"symbol": "T", "name": "AT&T", "exchange": "NYSE"},
    {"symbol": "VZ", "name": "Verizon", "exchange": "NYSE"},
    {"symbol": "TMUS", "name": "T-Mobile", "exchange": "NASDAQ"},
    {"symbol": "F", "name": "Ford Motor", "exchange": "NYSE"},
    {"symbol": "GM", "name": "General Motors", "exchange": "NYSE"},
    {"symbol": "GS", "name": "Goldman Sachs", "exchange": "NYSE"},
    {"symbol": "MS", "name": "Morgan Stanley", "exchange": "NYSE"},
    {"symbol": "WFC", "name": "Wells Fargo", "exchange": "NYSE"},
    {"symbol": "MRNA", "name": "Moderna", "exchange": "NASDAQ"},
    {"symbol": "GILD", "name": "Gilead", "exchange": "NASDAQ"},
    {"symbol": "CRWD", "name": "CrowdStrike", "exchange": "NASDAQ"},
    {"symbol": "PANW", "name": "Palo Alto", "exchange": "NASDAQ"},
    {"symbol": "NET", "name": "Cloudflare", "exchange": "NYSE"},
    {"symbol": "DDOG", "name": "Datadog", "exchange": "NASDAQ"},
    {"symbol": "MDB", "name": "MongoDB", "exchange": "NASDAQ"},
    {"symbol": "WDAY", "name": "Workday", "exchange": "NASDAQ"},
    {"symbol": "DASH", "name": "DoorDash", "exchange": "NYSE"},
    {"symbol": "DE", "name": "Deere & Co.", "exchange": "NYSE"},
    {"symbol": "HON", "name": "Honeywell", "exchange": "NASDAQ"},
    {"symbol": "MMM", "name": "3M", "exchange": "NYSE"},
    {"symbol": "TXN", "name": "Texas Instruments", "exchange": "NASDAQ"},
    {"symbol": "ADI", "name": "Analog Devices", "exchange": "NASDAQ"},
    {"symbol": "MU", "name": "Micron", "exchange": "NASDAQ"},
    {"symbol": "LRCX", "name": "Lam Research", "exchange": "NASDAQ"},
    {"symbol": "AMAT", "name": "Applied Materials", "exchange": "NASDAQ"},
    {"symbol": "KLAC", "name": "KLA Corp", "exchange": "NASDAQ"},
    {"symbol": "ACN", "name": "Accenture", "exchange": "NYSE"},
    {"symbol": "BLK", "name": "BlackRock", "exchange": "NYSE"},
    {"symbol": "SCHW", "name": "Charles Schwab", "exchange": "NYSE"},
    {"symbol": "BX", "name": "Blackstone", "exchange": "NYSE"},
    {"symbol": "KKR", "name": "KKR & Co.", "exchange": "NYSE"},
    {"symbol": "OXY", "name": "Occidental Petroleum", "exchange": "NYSE"},
    {"symbol": "SLB", "name": "Schlumberger", "exchange": "NYSE"},
    {"symbol": "MPC", "name": "Marathon Petroleum", "exchange": "NYSE"},
    {"symbol": "VLO", "name": "Valero", "exchange": "NYSE"},
    {"symbol": "CVX", "name": "Chevron", "exchange": "NYSE"},
    {"symbol": "ABBV", "name": "AbbVie", "exchange": "NYSE"},
    {"symbol": "UNH", "name": "UnitedHealth", "exchange": "NYSE"},
    {"symbol": "HD", "name": "Home Depot", "exchange": "NYSE"},
    {"symbol": "KO", "name": "Coca-Cola", "exchange": "NYSE"},
    {"symbol": "REGN", "name": "Regeneron", "exchange": "NASDAQ"},
    {"symbol": "AMGN", "name": "Amgen", "exchange": "NASDAQ"},
    {"symbol": "O", "name": "Realty Income", "exchange": "NYSE"},
    {"symbol": "AMT", "name": "American Tower", "exchange": "NYSE"},
    {"symbol": "PLD", "name": "Prologis", "exchange": "NYSE"},
    {"symbol": "SPG", "name": "Simon Property", "exchange": "NYSE"},
    {"symbol": "BB", "name": "BlackBerry", "exchange": "NYSE"},
    {"symbol": "NOK", "name": "Nokia ADR", "exchange": "NYSE"},
    {"symbol": "ERIC", "name": "Ericsson ADR", "exchange": "NASDAQ"},
    {"symbol": "SHEL", "name": "Shell plc", "exchange": "NYSE"},
    {"symbol": "BP", "name": "BP ADR", "exchange": "NYSE"},
    {"symbol": "NVO", "name": "Novo Nordisk", "exchange": "NYSE"},
    {"symbol": "GSK", "name": "GSK ADR", "exchange": "NYSE"},
    {"symbol": "SNY", "name": "Sanofi ADR", "exchange": "NYSE"},
    {"symbol": "TM", "name": "Toyota ADR", "exchange": "NYSE"},
    {"symbol": "HMC", "name": "Honda ADR", "exchange": "NYSE"},
    {"symbol": "SFTBY", "name": "SoftBank ADR", "exchange": "OTC"},
    {"symbol": "PINS", "name": "Pinterest", "exchange": "NYSE"},
    {"symbol": "UBER", "name": "Uber", "exchange": "NYSE"},
]

# Deduplicate by symbol
_seen = set()
_unique_stocks = []
for s in ALL_STOCKS:
    if s["symbol"] not in _seen:
        _seen.add(s["symbol"])
        _unique_stocks.append(s)
ALL_STOCKS = _unique_stocks


# ── Price cache (5s TTL) ──
_price_cache: dict = {}
_price_cache_ts: float = 0
CACHE_TTL = 5  # seconds


async def _fetch_yahoo_prices(symbols: list[str]) -> dict:
    """Fetch prices from Yahoo Finance for multiple symbols."""
    prices = {}
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    async with httpx.AsyncClient(timeout=15) as client:
        # Batch fetch using Yahoo Finance v8 API
        tasks = []
        for sym in symbols:
            tasks.append(_fetch_one_yahoo(client, sym, headers))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for sym, result in zip(symbols, results):
            if isinstance(result, dict) and result.get("price"):
                prices[sym] = result

    return prices


async def _fetch_one_yahoo(client: httpx.AsyncClient, symbol: str, headers: dict) -> dict:
    """Fetch a single symbol from Yahoo Finance."""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        result = data["chart"]["result"][0]
        meta = result["meta"]
        current = meta["regularMarketPrice"]
        prev_close = meta.get("chartPreviousClose", meta.get("previousClose", current))
        change_pct = ((current - prev_close) / prev_close * 100) if prev_close else 0
        return {
            "price": round(current, 2),
            "change": round(change_pct, 2),
            "name": meta.get("longName", symbol),
        }
    except Exception:
        return {}


async def _fetch_alpaca_prices(symbols: list[str]) -> dict:
    """Fetch prices from Alpaca for specific symbols."""
    import os
    api_key = os.getenv("ALPACA_API_KEY", "PKNIZEG473HN2TKETLMTNOTHBY")
    secret = os.getenv("ALPACA_SECRET", "BgBkVXWqrtRJ4bP9EVxeDUBHLZrca7HRjqXKBBo5S2XP")
    headers = {"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": secret}
    prices = {}

    async with httpx.AsyncClient(timeout=15) as client:
        symbols_str = ",".join(symbols)
        try:
            # Get latest trades
            trade_resp = await client.get(
                f"https://data.alpaca.markets/v2/stocks/trades/latest?symbols={symbols_str}",
                headers=headers,
            )
            if trade_resp.ok:
                trade_data = trade_resp.json()
                for sym, trade in (trade_data.get("trades") or {}).items():
                    p = trade.get("p", 0)
                    if p > 0:
                        prices[sym] = {"price": round(p, 2), "change": 0, "name": sym}

            # Get snapshots for 24h change
            snap_resp = await client.get(
                f"https://data.alpaca.markets/v2/stocks/snapshots?symbols={symbols_str}",
                headers=headers,
            )
            if snap_resp.ok:
                snap_data = snap_resp.json()
                for sym, snap in (snap_data.get("snapshots") or {}).items():
                    if sym in prices and snap.get("daily_bar"):
                        prev = snap.get("prev_daily_bar", {}).get("c") or snap["daily_bar"].get("o")
                        if prev and prev > 0:
                            prices[sym]["change"] = round((prices[sym]["price"] - prev) / prev * 100, 2)
        except Exception:
            pass

    return prices


@router.get("/getStockPrices")
async def get_stock_prices():
    """
    Get prices for default stocks.
    Returns: { data: { prices: { AAPL: { price, change, name }, ... } } }
    """
    global _price_cache, _price_cache_ts
    now = time.time()

    if _price_cache and (now - _price_cache_ts) < CACHE_TTL:
        return {"data": {"prices": _price_cache, "timestamp": int(now * 1000)}}

    symbols = [s["symbol"] for s in DEFAULT_STOCKS]
    name_map = {s["symbol"]: s["name"] for s in DEFAULT_STOCKS}

    prices = await _fetch_yahoo_prices(symbols)

    # Fill in names for any that came back
    for sym in symbols:
        if sym in prices:
            if prices[sym].get("name") == sym:
                prices[sym]["name"] = name_map.get(sym, sym)
        # OPENAI and CRWV won't be on Yahoo — skip silently

    _price_cache = prices
    _price_cache_ts = now

    return {"data": {"prices": prices, "timestamp": int(now * 1000)}}


@router.get("/getAlpacaPrices")
async def get_alpaca_prices(symbols: str = Query("")):
    """
    Get prices for specific symbols via Alpaca.
    Returns: { data: { prices: { AAPL: { price, change, name }, ... } } }
    """
    if not symbols.strip():
        return {"data": {"prices": {}}}

    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    prices = await _fetch_alpaca_prices(sym_list)
    return {"data": {"prices": prices, "timestamp": int(time.time() * 1000)}}


@router.get("/searchStocks")
async def search_stocks(q: str = Query("")):
    """
    Search stocks by symbol or name.
    Returns: { data: { results: [{ symbol, name, exchange }] } }
    """
    if not q or len(q) < 1:
        return {"data": {"results": []}}

    query = q.upper().strip()
    results = []
    for s in ALL_STOCKS:
        if query in s["symbol"].upper() or query in s.get("name", "").upper():
            results.append({
                "symbol": s["symbol"],
                "name": s.get("name", s["symbol"]),
                "exchange": s.get("exchange", "NASDAQ"),
            })
        if len(results) >= 20:
            break

    return {"data": {"results": results}}


@router.get("/getHKStockPrices")
async def get_hk_stock_prices(symbols: str = Query("")):
    """
    Get HK stock prices via Tencent API.
    Returns: { data: { prices: { "00700": { price, change, name }, ... } } }
    """
    if not symbols.strip():
        return {"data": {"prices": {}}}

    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    prices = {}
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    async with httpx.AsyncClient(timeout=10) as client:
        for sym in sym_list:
            code = sym.replace(".HK", "").replace(".hk", "").lstrip("0").zfill(5)
            try:
                resp = await client.get(f"https://qt.gtimg.cn/q=hk{code}", headers=headers)
                if resp.status_code == 200 and resp.text.strip():
                    parts = resp.text.split("~")
                    if len(parts) > 35:
                        current = float(parts[3])
                        prev_close = float(parts[4])
                        change = ((current - prev_close) / prev_close * 100) if prev_close else 0
                        name = parts[1] if len(parts) > 1 else sym
                        prices[sym] = {
                            "price": round(current, 3),
                            "change": round(change, 2),
                            "name": name,
                        }
            except Exception:
                continue

    return {"data": {"prices": prices, "timestamp": int(time.time() * 1000)}}


@router.get("/searchHKStocks")
async def search_hk_stocks(q: str = Query("")):
    """Search HK stocks — delegates to local stock list."""
    # Import from the stocks router if available
    hk_stocks = [
        {"symbol": "00700", "name": "騰訊控股 Tencent"},
        {"symbol": "09988", "name": "阿里巴巴-W Alibaba"},
        {"symbol": "00005", "name": "滙豐控股 HSBC"},
        {"symbol": "01299", "name": "友邦保險 AIA"},
        {"symbol": "00388", "name": "香港交易所 HKEX"},
        {"symbol": "00941", "name": "中國移動 China Mobile"},
        {"symbol": "01810", "name": "小米集團-W Xiaomi"},
        {"symbol": "03690", "name": "美團-W Meituan"},
        {"symbol": "09618", "name": "京東集團-W JD.com"},
        {"symbol": "09999", "name": "網易-W NetEase"},
        {"symbol": "01211", "name": "比亞迪股份 BYD"},
        {"symbol": "02318", "name": "中國平安 Ping An"},
        {"symbol": "00939", "name": "建設銀行 CCB"},
        {"symbol": "01398", "name": "工商銀行 ICBC"},
        {"symbol": "03988", "name": "中國銀行 Bank of China"},
        {"symbol": "00883", "name": "中海油 CNOOC"},
        {"symbol": "09961", "name": "攜程集團-W Trip.com"},
    ]

    if not q or len(q) < 1:
        return {"data": {"results": []}}

    query = q.upper().strip()
    results = []
    for s in hk_stocks:
        if query in s["symbol"] or query in s["name"].upper():
            results.append({"symbol": s["symbol"], "name": s["name"], "exchange": "HKEX"})
        if len(results) >= 20:
            break

    return {"data": {"results": results}}


@router.get("/getMetalPrices")
async def get_metal_prices():
    """Get metal prices — placeholder."""
    return {"data": {"prices": {}, "timestamp": int(time.time() * 1000)}}
