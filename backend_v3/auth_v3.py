"""
EVE FINANCE v3.0 — OAuth2 authentication and authorization.
Supports client_credentials flow with scoped tokens.
"""

import secrets, time, hashlib, hmac
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from models_v3 import V3Client, V3User, get_db

# Simple token store (in-memory for now; production should use Redis/JWT)
# Format: {token_str: {"client_id": ..., "scope": [...], "expires_at": ...}}
_token_store = {}

TOKEN_EXPIRY_SECONDS = 900  # 15 minutes
BEARER_SCHEME = HTTPBearer(auto_error=False)


def issue_token(client_id: str, scope: list[str]) -> dict:
    """Issue a new Bearer token."""
    token = secrets.token_urlsafe(48)
    _token_store[token] = {
        "client_id": client_id,
        "scope": scope,
        "expires_at": time.time() + TOKEN_EXPIRY_SECONDS,
    }
    return {
        "access_token": f"ev3_{token}",
        "token_type": "Bearer",
        "expires_in": TOKEN_EXPIRY_SECONDS,
        "scope": " ".join(scope),
    }


def validate_token(token_str: str) -> dict | None:
    """Validate token and return payload."""
    # Strip ev3_ prefix if present
    if token_str.startswith("ev3_"):
        token_str = token_str[4:]
    payload = _token_store.get(token_str)
    if not payload:
        return None
    if time.time() > payload["expires_at"]:
        del _token_store[token_str]
        return None
    return payload


def get_authenticated_client(
    credentials: HTTPAuthorizationCredentials | None = Security(BEARER_SCHEME),
    db: Session = Depends(get_db),
) -> dict:
    """Dependency: authenticate and return client + scope info."""
    is_anon = False

    if credentials is None:
        # Anonymous mode (demo only)
        client = db.query(V3Client).filter(V3Client.legal_name == "Anonymous Demo").first()
        if not client:
            raise HTTPException(status_code=401, detail="AUTHENTICATION_REQUIRED")
        return {
            "client": client,
            "scope": ["market:read", "accounts:read", "orders:write", "fx:write", "funding:write"],
            "token_type": "anonymous",
        }

    # Validate token
    payload = validate_token(credentials.credentials)
    if payload:
        client = db.query(V3Client).filter(V3Client.id == payload["client_id"]).first()
        if not client or client.status != "active":
            raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
        return {
            "client": client,
            "scope": payload["scope"],
            "token_type": "bearer",
        }

    # Fallback: API Key (legacy support)
    if credentials.credentials.startswith("ev_live_") or credentials.credentials.startswith("ev_admin_"):
        client = db.query(V3Client).filter(V3Client.api_key == credentials.credentials).first()
        if client and client.status == "active":
            return {
                "client": client,
                "scope": ["market:read", "accounts:read", "orders:write", "fx:write",
                          "funding:write", "admin:funding:approve", "admin:ledger:adjust",
                          "admin:clients:write", "audit:read"],
                "token_type": "api_key",
            }

    raise HTTPException(status_code=401, detail="AUTHENTICATION_REQUIRED")


def require_scope(*required_scopes: str):
    """Dependency factory: require specific scopes."""
    def checker(auth: dict = Depends(get_authenticated_client)):
        for s in required_scopes:
            if s not in auth["scope"]:
                raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
        return auth
    return checker


def require_admin(auth: dict = Depends(get_authenticated_client)):
    """Require admin-level access."""
    required = ["admin:clients:write", "admin:funding:approve", "admin:ledger:adjust"]
    if not any(s in auth["scope"] for s in required):
        raise HTTPException(status_code=403, detail="PERMISSION_DENIED")
    return auth
