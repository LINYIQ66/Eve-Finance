"""
EVE FINANCE v3.0 — WebSocket Manager
Manages authenticated connections, channel subscriptions, and event broadcasting.
"""

import json, asyncio, time, uuid
from typing import Set, Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect, HTTPException, status

from auth_v3 import validate_token
from models_v3 import V3Client, V3Account, get_db, SessionLocal


class WSConnection:
    """Represents a single authenticated WebSocket connection."""
    def __init__(self, websocket: WebSocket, client_id: str, scope: list[str]):
        self.websocket = websocket
        self.client_id = client_id
        self.scope = scope
        self.subscriptions: Set[str] = set()  # e.g. orders:acc_xxx, quotes:AAPL
        self.connected_at = time.time()


class WSManager:
    """Manages all WebSocket connections and channel subscriptions."""

    def __init__(self):
        self.connections: Dict[str, WSConnection] = {}  # conn_id -> connection
        self.channels: Dict[str, Set[str]] = {}  # channel -> set of conn_ids
        self._sequence: Dict[str, int] = {}  # channel -> next sequence number

    async def connect(self, websocket: WebSocket, token: str = "") -> Optional[WSConnection]:
        """Accept and authenticate a WebSocket connection."""
        await websocket.accept()

        # Authenticate
        client = None
        scope = []

        if token:
            payload = validate_token(token)
            if payload:
                db = SessionLocal()
                try:
                    client = db.query(V3Client).filter(V3Client.id == payload["client_id"]).first()
                    scope = payload["scope"]
                finally:
                    db.close()

        if not client:
            # Anonymous demo access
            db = SessionLocal()
            try:
                client = db.query(V3Client).filter(V3Client.legal_name == "Anonymous Demo").first()
                scope = ["market:read", "accounts:read", "orders:write"]
            finally:
                db.close()

        if not client:
            await websocket.send_json({"error": {"code": "AUTHENTICATION_REQUIRED"}})
            await websocket.close(code=4001)
            return None

        conn_id = str(uuid.uuid4())
        conn = WSConnection(websocket, client.id, scope)
        self.connections[conn_id] = conn
        return conn

    def disconnect(self, conn_id: str):
        """Remove a connection and all its subscriptions."""
        conn = self.connections.pop(conn_id, None)
        if conn:
            for channel in list(conn.subscriptions):
                self._unsubscribe(conn_id, channel)

    def subscribe(self, conn_id: str, channel: str):
        """Subscribe a connection to a channel."""
        if conn_id not in self.connections:
            return
        self.connections[conn_id].subscriptions.add(channel)
        if channel not in self.channels:
            self.channels[channel] = set()
        self.channels[channel].add(conn_id)

    def _unsubscribe(self, conn_id: str, channel: str):
        """Remove a connection from a channel."""
        if channel in self.channels:
            self.channels[channel].discard(conn_id)
            if not self.channels[channel]:
                del self.channels[channel]

    def unsubscribe(self, conn_id: str, channel: str):
        """Unsubscribe a connection from a channel."""
        if conn_id in self.connections:
            self.connections[conn_id].subscriptions.discard(channel)
        self._unsubscribe(conn_id, channel)

    async def broadcast(self, channel: str, event: str, data: dict):
        """Broadcast an event to all subscribers of a channel."""
        if channel not in self.channels:
            return

        # Get sequence
        if channel not in self._sequence:
            self._sequence[channel] = 0
        self._sequence[channel] += 1
        seq = self._sequence[channel]

        message = {
            "channel": channel,
            "sequence": seq,
            "event": event,
            "data": data,
        }
        payload = json.dumps(message)

        dead_conns = []
        for conn_id in list(self.channels[channel]):
            conn = self.connections.get(conn_id)
            if not conn:
                dead_conns.append(conn_id)
                continue
            try:
                await conn.websocket.send_text(payload)
            except Exception:
                dead_conns.append(conn_id)

        for conn_id in dead_conns:
            self.disconnect(conn_id)

    async def broadcast_account_event(self, account_id: str, event: str, data: dict):
        """Broadcast to all subscribers of an account channel."""
        await self.broadcast(f"orders:{account_id}", event, data)
        await self.broadcast(f"positions:{account_id}", event, data)

    async def handle_messages(self, conn_id: str):
        """Handle incoming messages from a connection (subscribe/unsubscribe)."""
        conn = self.connections.get(conn_id)
        if not conn:
            return

        try:
            while True:
                raw = await conn.websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    await conn.websocket.send_json({
                        "error": {"code": "INVALID_REQUEST", "message": "Invalid JSON"}
                    })
                    continue

                action = msg.get("action", "")
                if action == "subscribe":
                    channels = msg.get("channels", [])
                    for ch in channels:
                        self.subscribe(conn_id, ch)
                    await conn.websocket.send_json({
                        "event": "subscribed",
                        "channels": list(conn.subscriptions),
                    })
                elif action == "unsubscribe":
                    channels = msg.get("channels", [])
                    for ch in channels:
                        self.unsubscribe(conn_id, ch)
                    await conn.websocket.send_json({
                        "event": "unsubscribed",
                        "channels": list(conn.subscriptions),
                    })
                elif action == "ping":
                    await conn.websocket.send_json({"event": "pong"})
                else:
                    await conn.websocket.send_json({
                        "error": {"code": "UNKNOWN_ACTION", "message": f"Unknown action: {action}"}
                    })
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            self.disconnect(conn_id)


# Singleton instance
ws_manager = WSManager()
