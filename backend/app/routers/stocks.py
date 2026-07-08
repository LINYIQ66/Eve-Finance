"""
Stocks Router — US and HK stock lists.
Public endpoints (no auth required).
"""
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


US_STOCKS = [
    {"symbol": "AAPL", "name": "Apple Inc."}, {"symbol": "MSFT", "name": "Microsoft Corp."},
    {"symbol": "GOOGL", "name": "Alphabet Class A"}, {"symbol": "AMZN", "name": "Amazon.com"},
    {"symbol": "NVDA", "name": "NVIDIA Corp."}, {"symbol": "META", "name": "Meta Platforms"},
    {"symbol": "TSLA", "name": "Tesla Inc."}, {"symbol": "JPM", "name": "JPMorgan Chase"},
    {"symbol": "V", "name": "Visa Inc."}, {"symbol": "MA", "name": "Mastercard"},
    {"symbol": "JNJ", "name": "Johnson & Johnson"}, {"symbol": "WMT", "name": "Walmart"},
    {"symbol": "PG", "name": "Procter & Gamble"}, {"symbol": "UNH", "name": "UnitedHealth"},
    {"symbol": "HD", "name": "Home Depot"}, {"symbol": "DIS", "name": "Walt Disney"},
    {"symbol": "BAC", "name": "Bank of America"}, {"symbol": "XOM", "name": "Exxon Mobil"},
    {"symbol": "KO", "name": "Coca-Cola"}, {"symbol": "PEP", "name": "PepsiCo"},
    {"symbol": "PFE", "name": "Pfizer"}, {"symbol": "AVGO", "name": "Broadcom"},
    {"symbol": "CVX", "name": "Chevron"}, {"symbol": "ABBV", "name": "AbbVie"},
    {"symbol": "NFLX", "name": "Netflix"}, {"symbol": "ADBE", "name": "Adobe"},
    {"symbol": "CRM", "name": "Salesforce"}, {"symbol": "INTC", "name": "Intel"},
    {"symbol": "AMD", "name": "AMD"}, {"symbol": "QCOM", "name": "Qualcomm"},
    {"symbol": "CSCO", "name": "Cisco"}, {"symbol": "ACN", "name": "Accenture"},
    {"symbol": "ORCL", "name": "Oracle"}, {"symbol": "IBM", "name": "IBM"},
    {"symbol": "SBUX", "name": "Starbucks"}, {"symbol": "NKE", "name": "Nike"},
    {"symbol": "PYPL", "name": "PayPal"}, {"symbol": "SHOP", "name": "Shopify"},
    {"symbol": "UBER", "name": "Uber"}, {"symbol": "ABNB", "name": "Airbnb"},
    {"symbol": "COIN", "name": "Coinbase"}, {"symbol": "PLTR", "name": "Palantir"},
    {"symbol": "SNOW", "name": "Snowflake"}, {"symbol": "BABA", "name": "Alibaba ADR"},
    {"symbol": "TCEHY", "name": "Tencent ADR"}, {"symbol": "PDD", "name": "PDD Holdings"},
    {"symbol": "JD", "name": "JD.com ADR"}, {"symbol": "BIDU", "name": "Baidu ADR"},
    {"symbol": "NIO", "name": "NIO Inc."}, {"symbol": "LI", "name": "Li Auto"},
    {"symbol": "TSM", "name": "TSMC ADR"}, {"symbol": "ASML", "name": "ASML ADR"},
    {"symbol": "SHEL", "name": "Shell plc"}, {"symbol": "BP", "name": "BP ADR"},
    {"symbol": "NVO", "name": "Novo Nordisk"}, {"symbol": "GSK", "name": "GSK ADR"},
    {"symbol": "SNY", "name": "Sanofi ADR"}, {"symbol": "TM", "name": "Toyota ADR"},
    {"symbol": "HMC", "name": "Honda ADR"}, {"symbol": "SFTBY", "name": "SoftBank ADR"},
    {"symbol": "F", "name": "Ford Motor"}, {"symbol": "GM", "name": "General Motors"},
    {"symbol": "BA", "name": "Boeing"}, {"symbol": "CAT", "name": "Caterpillar"},
    {"symbol": "SPOT", "name": "Spotify"}, {"symbol": "SNAP", "name": "Snap"},
    {"symbol": "PINS", "name": "Pinterest"}, {"symbol": "MRNA", "name": "Moderna"},
    {"symbol": "REGN", "name": "Regeneron"}, {"symbol": "GILD", "name": "Gilead"},
    {"symbol": "AMGN", "name": "Amgen"}, {"symbol": "GS", "name": "Goldman Sachs"},
    {"symbol": "MS", "name": "Morgan Stanley"}, {"symbol": "WFC", "name": "Wells Fargo"},
    {"symbol": "AXP", "name": "American Express"}, {"symbol": "BLK", "name": "BlackRock"},
    {"symbol": "SCHW", "name": "Charles Schwab"}, {"symbol": "BX", "name": "Blackstone"},
    {"symbol": "KKR", "name": "KKR & Co."}, {"symbol": "OXY", "name": "Occidental Petroleum"},
    {"symbol": "SLB", "name": "Schlumberger"}, {"symbol": "MPC", "name": "Marathon Petroleum"},
    {"symbol": "VLO", "name": "Valero"}, {"symbol": "DE", "name": "Deere & Co."},
    {"symbol": "MMM", "name": "3M"}, {"symbol": "HON", "name": "Honeywell"},
    {"symbol": "DASH", "name": "DoorDash"}, {"symbol": "WDAY", "name": "Workday"},
    {"symbol": "MDB", "name": "MongoDB"}, {"symbol": "DDOG", "name": "Datadog"},
    {"symbol": "NET", "name": "Cloudflare"}, {"symbol": "CRWD", "name": "CrowdStrike"},
    {"symbol": "PANW", "name": "Palo Alto"}, {"symbol": "FTNT", "name": "Fortinet"},
    {"symbol": "ZS", "name": "Zscaler"}, {"symbol": "MU", "name": "Micron"},
    {"symbol": "LRCX", "name": "Lam Research"}, {"symbol": "AMAT", "name": "Applied Materials"},
    {"symbol": "KLAC", "name": "KLA Corp"}, {"symbol": "ADI", "name": "Analog Devices"},
    {"symbol": "TXN", "name": "Texas Instruments"}, {"symbol": "GME", "name": "GameStop"},
    {"symbol": "AMC", "name": "AMC Entertainment"}, {"symbol": "BB", "name": "BlackBerry"},
    {"symbol": "NOK", "name": "Nokia ADR"}, {"symbol": "ERIC", "name": "Ericsson ADR"},
    {"symbol": "T", "name": "AT&T"}, {"symbol": "VZ", "name": "Verizon"},
    {"symbol": "TMUS", "name": "T-Mobile"}, {"symbol": "CHTR", "name": "Charter Comm"},
    {"symbol": "O", "name": "Realty Income"}, {"symbol": "AMT", "name": "American Tower"},
    {"symbol": "PLD", "name": "Prologis"}, {"symbol": "SPG", "name": "Simon Property"},
]

HK_STOCKS = [
    {"symbol": "00700", "name": "騰訊控股 Tencent"},
    {"symbol": "09988", "name": "阿里巴巴-W Alibaba"},
    {"symbol": "00005", "name": "滙豐控股 HSBC"},
    {"symbol": "01299", "name": "友邦保險 AIA"},
    {"symbol": "00388", "name": "香港交易所 HKEX"},
    {"symbol": "00941", "name": "中國移動 China Mobile"},
    {"symbol": "00001", "name": "長和 CK Hutchison"},
    {"symbol": "00002", "name": "中電控股 CLP Holdings"},
    {"symbol": "00003", "name": "香港中華煤氣 Towngas"},
    {"symbol": "00006", "name": "電能實業 Power Assets"},
    {"symbol": "00011", "name": "恆生銀行 Hang Seng Bank"},
    {"symbol": "00012", "name": "恆基地產 Henderson Land"},
    {"symbol": "00016", "name": "新鴻基地產 Sun Hung Kai"},
    {"symbol": "00017", "name": "新世界發展 New World Dev"},
    {"symbol": "00019", "name": "太古股份公司A Swire"},
    {"symbol": "00023", "name": "東亞銀行 BEA"},
    {"symbol": "00027", "name": "銀河娛樂 Galaxy"},
    {"symbol": "00066", "name": "港鐵公司 MTR"},
    {"symbol": "00101", "name": "恆隆地產 Hang Lung"},
    {"symbol": "00151", "name": "中國旺旺 Want Want"},
    {"symbol": "00175", "name": "吉利汽車 Geely"},
    {"symbol": "00241", "name": "阿里健康 AliHealth"},
    {"symbol": "00268", "name": "金蝶國際 Kingdee"},
    {"symbol": "00291", "name": "華潤啤酒 CR Beer"},
    {"symbol": "00386", "name": "中國石化 Sinopec"},
    {"symbol": "00688", "name": "中國海外發展 COLI"},
    {"symbol": "00762", "name": "中國聯通 China Unicom"},
    {"symbol": "00763", "name": "中興通訊 ZTE"},
    {"symbol": "00823", "name": "領展房產基金 Link REIT"},
    {"symbol": "00883", "name": "中海油 CNOOC"},
    {"symbol": "00939", "name": "建設銀行 CCB"},
    {"symbol": "00992", "name": "聯想集團 Lenovo"},
    {"symbol": "01038", "name": "長江基建 CKI"},
    {"symbol": "01044", "name": "恆安國際 Hengan"},
    {"symbol": "01088", "name": "中國神華 Shenhua"},
    {"symbol": "01093", "name": "石藥集團 CSPC"},
    {"symbol": "01109", "name": "華潤置地 CR Land"},
    {"symbol": "01113", "name": "長實集團 CK Asset"},
    {"symbol": "01177", "name": "中國生物製藥 Sino Biopharm"},
    {"symbol": "01211", "name": "比亞迪股份 BYD"},
    {"symbol": "01288", "name": "農業銀行 ABC"},
    {"symbol": "01336", "name": "新華保險 New China Life"},
    {"symbol": "01398", "name": "工商銀行 ICBC"},
    {"symbol": "01810", "name": "小米集團-W Xiaomi"},
    {"symbol": "01876", "name": "百度集團-W Baidu"},
    {"symbol": "01928", "name": "金沙中國 Sands China"},
    {"symbol": "01997", "name": "九龍倉集團 Wharf Holdings"},
    {"symbol": "02009", "name": "京東健康 JD Health"},
    {"symbol": "02013", "name": "微盟集團 Weimob"},
    {"symbol": "02018", "name": "瑞聲科技 AAC Tech"},
    {"symbol": "02318", "name": "中國平安 Ping An"},
    {"symbol": "02382", "name": "舜宇光學 Sunny Optical"},
    {"symbol": "02388", "name": "中銀香港 BOCHK"},
    {"symbol": "02628", "name": "中國人壽 China Life"},
    {"symbol": "02688", "name": "新奧能源 ENN Energy"},
    {"symbol": "02899", "name": "紫金礦業 Zijin Mining"},
    {"symbol": "03328", "name": "交通銀行 BoCom"},
    {"symbol": "03690", "name": "美團-W Meituan"},
    {"symbol": "03888", "name": "金山軟件 Kingsoft"},
    {"symbol": "03968", "name": "招商銀行 CMB"},
    {"symbol": "03988", "name": "中國銀行 Bank of China"},
    {"symbol": "09618", "name": "京東集團-W JD.com"},
    {"symbol": "09633", "name": "農夫山泉 Nongfu Spring"},
    {"symbol": "09961", "name": "攜程集團-W Trip.com"},
    {"symbol": "09999", "name": "網易-W NetEase"},
    {"symbol": "02020", "name": "安踏體育 Anta Sports"},
    {"symbol": "02269", "name": "藥明生物 WuXi Biologics"},
    {"symbol": "02331", "name": "李寧 Li Ning"},
    {"symbol": "09668", "name": "海底撈 Haidilao"},
    {"symbol": "06098", "name": "碧桂園服務 Country Garden"},
    {"symbol": "06862", "name": "海爾智家 Haier Smart Home"},
]


@router.get("/list")
async def list_us_stocks(
    limit: Optional[int] = Query(None, le=500),
    search: Optional[str] = None,
):
    """List all available US stocks."""
    stocks = US_STOCKS
    if search:
        s = search.upper()
        stocks = [st for st in stocks if s in st["symbol"].upper() or s in st["name"].upper()]
    if limit:
        stocks = stocks[:limit]
    return {"market": "US", "count": len(stocks), "stocks": stocks}


@router.get("/hk-list")
async def list_hk_stocks(
    limit: Optional[int] = Query(None, le=500),
    search: Optional[str] = None,
):
    """List all available HK stocks."""
    stocks = HK_STOCKS
    if search:
        s = search.upper()
        stocks = [st for st in stocks if s in st["symbol"].upper() or s in st["name"].upper()]
    if limit:
        stocks = stocks[:limit]
    return {"market": "HK", "count": len(stocks), "stocks": stocks}
