"""Event broadcasting to WebSocket clients.

Call emit() from anywhere in the backend to notify the frontend
that data has changed. The frontend invalidates the relevant cache.
"""

from __future__ import annotations

import asyncio


def emit(event_type: str, **data):
    """Fire-and-forget broadcast to all connected WebSocket clients.

    event_type: "leads_updated", "enrichment_done", "drafts_generated", etc.
    """
    try:
        from main import broadcast
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(broadcast({"type": event_type, **data}))
        else:
            loop.run_until_complete(broadcast({"type": event_type, **data}))
    except Exception:
        pass  # Best-effort — don't crash if WS isn't available
