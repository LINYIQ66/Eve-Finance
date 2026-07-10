"""
EVE FINANCE v3.0 — Webhook Delivery Module
HMAC-SHA256 signed event delivery with retry logic.
"""

import json, hashlib, hmac, time, asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from models_v3 import V3WebhookConfig, get_db, SessionLocal


def sign_payload(secret: str, timestamp: int, body: bytes) -> str:
    """HMAC-SHA256 sign a webhook payload."""
    signed_payload = f"{timestamp}.{body.decode()}".encode()
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"v1={signature}"


async def deliver_webhook(config: V3WebhookConfig, event_type: str, data: dict):
    """Deliver a webhook event to a configured endpoint."""
    timestamp = int(time.time())
    event_id = f"evt_{hashlib.md5(f'{event_type}{timestamp}{json.dumps(data,sort_keys=True)}'.encode()).hexdigest()[:12]}"

    payload = {
        "event": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    }
    body = json.dumps(payload).encode()

    signature = sign_payload(config.secret, timestamp, body)

    headers = {
        "Content-Type": "application/json",
        "X-EVE-Event-ID": event_id,
        "X-EVE-Timestamp": str(timestamp),
        "X-EVE-Signature": signature,
        "User-Agent": "EVE-Finance-Webhook/3.0",
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(config.url, content=body, headers=headers)
                if r.status_code < 500:
                    return True, event_id, r.status_code
        except Exception:
            pass
        if attempt < max_retries - 1:
            await asyncio.sleep(2 ** attempt)  # exponential backoff

    return False, event_id, 0


async def fire_webhook_event(event_type: str, data: dict, tenant_id: str = None):
    """Find matching webhook configs and fire event."""
    db = SessionLocal()
    try:
        query = db.query(V3WebhookConfig).filter(V3WebhookConfig.status == "active")
        if tenant_id:
            query = query.filter(V3WebhookConfig.tenant_id == tenant_id)
        configs = query.all()

        for config in configs:
            if event_type in config.events:
                await deliver_webhook(config, event_type, data)
    finally:
        db.close()


def fire_webhook_sync(event_type: str, data: dict, tenant_id: str = None):
    """Synchronous fire-and-forget webhook event.
    Works in both sync and async contexts."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(fire_webhook_event(event_type, data, tenant_id))
        else:
            asyncio.run(fire_webhook_event(event_type, data, tenant_id))
    except RuntimeError:
        asyncio.run(fire_webhook_event(event_type, data, tenant_id))
