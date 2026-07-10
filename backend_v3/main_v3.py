"""
EVE FINANCE v3.0 — Application entry point.
Runs alongside v2.1 on port 8802.
"""

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import uuid, time

from models_v3 import init_db, seed_v3
from api_v3 import router

app = FastAPI(
    title="EVE FINANCE v3.0",
    description="White-Label Trading API",
    version="3.0.0",
)

# Add request ID middleware
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", f"req_{uuid.uuid4().hex[:12]}")
    start = time.time()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-EVE-Version"] = "3.0"
    return response

# Include v3 router
app.include_router(router)

@app.get("/")
def root():
    from errors import eve_success
    return eve_success({
        "service": "EVE FINANCE",
        "version": "3.0.0",
        "docs": "/v3/health",
    })

if __name__ == "__main__":
    init_db()
    seed_v3()
    print("[v3] EVE FINANCE API v3.0 starting on port 8802...")
    uvicorn.run(app, host="0.0.0.0", port=8802)
