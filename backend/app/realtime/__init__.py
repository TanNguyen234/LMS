"""In-process ASGI WebSocket RealtimeHub (no external Redis/broker required)."""
from backend.app.realtime.manager import ConnectionInfo, RealtimeHub, realtime_hub

__all__ = ["ConnectionInfo", "RealtimeHub", "realtime_hub"]
