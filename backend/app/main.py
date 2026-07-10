import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import init_db, seed_admin, seed_public_client
from api import router
from functions_router import router as functions_router
from config import APP_NAME, APP_VERSION

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="""
# EVE FINANCE — US Stock Trading API

White-label paper trading platform. Access US stock quotes, place orders, manage positions.

**Authentication:** All endpoints (except `/v1/register`) require `X-API-Key` header.

**Base URL:** `https://your-domain.com`

**Rate Limit:** 100 requests/minute per API key.

---

## Quick Start

```bash
# 1. Register
curl -X POST /v1/register -H "Content-Type: application/json" \\
  -d '{"name":"My App","email":"me@example.com"}'

# 2. Get a quote
curl /v1/market/quotes?symbols=AAPL -H "X-API-Key: ev_live_xxx"

# 3. Place order
curl -X POST /v1/orders -H "X-API-Key: ev_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"symbol":"AAPL","side":"buy","order_type":"market","qty":10}'

# 4. Check account
curl /v1/account -H "X-API-Key: ev_live_xxx"
```
""",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(functions_router)

# Serve frontend
app.mount("/static", StaticFiles(directory="../frontend"), name="static")

@app.get("/", include_in_schema=False)
async def serve_ui():
    return FileResponse("../frontend/index.html")

@app.get("/health")
async def health():
    return {"status": "ok", "service": APP_NAME, "version": APP_VERSION}

@app.on_event("startup")
async def startup():
    init_db()
    seed_admin()
    seed_public_client()
    print(f"[{APP_NAME}] v{APP_VERSION} started — DB ready, admin + anonymous seeded")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8800, reload=True)
