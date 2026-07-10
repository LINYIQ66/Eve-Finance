"""
EVE FINANCE v3.0 — Standard error envelope and codes.
"""

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.requests import Request
import uuid

ERROR_CATALOG = {
    "INVALID_REQUEST":         (400, "Malformed JSON or incompatible fields"),
    "AUTHENTICATION_REQUIRED": (401, "Missing or expired token"),
    "PERMISSION_DENIED":       (403, "Scope or trading permission missing"),
    "RESOURCE_NOT_FOUND":      (404, "Object not found in authorized tenant"),
    "IDEMPOTENCY_CONFLICT":    (409, "Same key reused with different payload"),
    "ORDER_NOT_MODIFIABLE":    (409, "Final or upstream-locked order"),
    "INVALID_LOT_SIZE":        (422, "Quantity must be a multiple of the current board lot size"),
    "INSUFFICIENT_BUYING_POWER": (422, "Available funds below required amount"),
    "FX_QUOTE_EXPIRED":        (422, "Request a new executable quote"),
    "ACCOUNT_RESTRICTED":      (423, "Risk or compliance hold"),
    "RATE_LIMITED":            (429, "Retry after Retry-After header"),
    "UPSTREAM_UNAVAILABLE":    (502, "Retryable broker or bank dependency failure"),
    "UNKNOWN_SYMBOL":          (422, "Symbol not found"),
    "INVALID_QTY":             (422, "Quantity validation failed"),
    "UNKNOWN_ACCOUNT":         (404, "Account not found"),
    "ACCOUNT_SUSPENDED":       (403, "Account is suspended"),
    "MARKET_CLOSED":           (422, "Market is currently closed"),
    "NOT_IMPLEMENTED":         (501, "This feature is not yet implemented in v3.0"),
}


def eve_error(code: str, message: str = None, details: dict = None, retryable: bool = False):
    """Create an EVE Finance error response body."""
    status, default_msg = ERROR_CATALOG.get(code, (500, "Unknown error"))
    return {
        "error": {
            "code": code,
            "message": message or default_msg,
            "details": details or {},
            "retryable": retryable,
            "docs_path": f"/errors/{code}",
        }
    }


def eve_success(data, meta: dict = None, request_id: str = None):
    """Standard success envelope."""
    resp = {"data": data}
    resp["meta"] = {
        "request_id": request_id or f"req_{uuid.uuid4().hex[:12]}",
        "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "api_version": "3.0",
    }
    if meta:
        resp["meta"].update(meta)
    return resp


def eve_paginated(data, next_cursor: str = None, has_more: bool = False, limit: int = 50):
    """Paginated response."""
    return eve_success(data, meta={
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": limit,
    })


def raise_eve(code: str, message: str = None, details: dict = None, retryable: bool = False):
    """Raise an HTTPException with EVE error format."""
    status, _ = ERROR_CATALOG.get(code, (500, ""))
    raise HTTPException(
        status_code=status,
        detail=eve_error(code, message, details, retryable),
    )
