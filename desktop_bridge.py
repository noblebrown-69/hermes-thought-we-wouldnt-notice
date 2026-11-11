"""Tell a connected Hermes Desktop window that a quarter landed.

``broadcast_plugin_event`` is the public bridge. It is a no-op when no
Desktop client is attached to this process, and missing entirely on a
Hermes build that predates it. Either case must not change the chat reply.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

PLUGIN_ID = "thought-we-wouldnt-notice"
# Bare event name. The wire name is plugin.thought-we-wouldnt-notice.coin.
COIN_EVENT = "coin"


def coin_payload(drop: dict[str, Any] | None) -> dict[str, Any]:
    """JSON-safe summary of one drop. No message text."""
    drop = drop or {}
    try:
        drop_id = int(drop.get("id") or 0)
    except (TypeError, ValueError):
        drop_id = 0
    try:
        created = float(drop.get("created_at") or 0)
    except (TypeError, ValueError):
        created = 0.0
    source = drop.get("source")
    if source not in ("message", "command"):
        source = "message"
    return {"id": drop_id, "created_at": created, "source": source}


def publish_coin(drop: dict[str, Any] | None) -> bool:
    """Broadcast the drop. False when Desktop will not hear it."""
    payload = coin_payload(drop)
    try:
        try:
            from cabinet_page import cabinet_popup_html
        except ImportError:  # packaged as a module
            from .cabinet_page import cabinet_popup_html
        payload["html"] = cabinet_popup_html()
    except Exception:
        logger.exception("could not attach the cabinet page to the Desktop event")
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
    except Exception:
        logger.debug("desktop event bridge is not available", exc_info=True)
        return False
    try:
        broadcast_plugin_event(PLUGIN_ID, COIN_EVENT, payload)
    except Exception:
        logger.exception("could not broadcast the cabinet drop")
        return False
    return True
