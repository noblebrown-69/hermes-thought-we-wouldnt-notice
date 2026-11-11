"""Thought We Wouldn't Notice — a last-minute cabinet for Hermes.

Typing a message that is only a quarter swallows the model turn and
rings the dashboard cabinet. The game itself lives in ``dashboard/``.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any, Optional

# Hermes loads this file as a package. pytest may also import it as a loose
# module because the plugin root has an __init__.py above tests/.
if __package__ in (None, "", "__init__"):
    _root = Path(__file__).resolve().parent
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))
    from cabinet_state import record_drop, status
    from desktop_bridge import publish_coin
    from quarter import NOTICE_LINE, is_quarter_message, message_text
else:
    from .cabinet_state import record_drop, status
    from .desktop_bridge import publish_coin
    from .quarter import NOTICE_LINE, is_quarter_message, message_text

logger = logging.getLogger(__name__)

CLI_NAME = "thought-we-wouldnt-notice"
__version__ = "0.1.7"


def _ring(session_id: str, source: str) -> None:
    """Record the quarter and tell Desktop. The chat reply does not depend on either."""
    try:
        drop = record_drop(session_id=session_id, source=source)
    except Exception:
        logger.exception("quarter cabinet could not record the drop")
        return
    try:
        publish_coin(drop)
    except Exception:
        logger.exception("quarter cabinet could not notify Desktop")


def on_pre_llm_call(
    user_message: object = "",
    session_id: str = "",
    **_: Any,
) -> Optional[dict[str, str]]:
    """Block a lone quarter before it reaches the model, and log the drop.

    Returning ``{"action": "block", "message": ...}`` is the documented
    ``pre_llm_call`` policy result: no inference call, and the message is
    shown in place of an assistant reply. Recording the drop is what the
    dashboard overlay polls. If the ledger cannot be written, the turn is
    still blocked so the model does not improvise a reply about pocket change.
    """
    try:
        text = message_text(user_message)
        matched = is_quarter_message(text)
    except Exception:
        logger.exception("quarter check failed")
        return None
    if not matched:
        return None
    _ring(str(session_id or ""), "message")
    return {"action": "block", "message": NOTICE_LINE}


def on_quarter_command(raw_args: str = "", session_id: str = "", **_: Any) -> str:
    """Slash command ``/quarter``. Hermes never sends slash commands to the model."""
    del raw_args
    _ring(str(session_id or ""), "command")
    return NOTICE_LINE


def _run_cli(args: argparse.Namespace) -> None:
    sub = getattr(args, "cabinet_command", None)
    if sub == "status":
        info = status()
        print(f"Thought We Wouldn't Notice {__version__}")
        print(f"High score: {info['high_score']}")
        print(f"Quarters: {info['quarters']}")
        print("Dashboard tab: /thought-we-wouldnt-notice")
        print("A message that is only a quarter opens the cabinet.")
        print("Examples: 25c, 25 cents, $.25, $0.25, 0.25")
        return
    print("Usage: hermes thought-we-wouldnt-notice status")
    print("Send 25c (the whole message) and the cabinet pops open on the dashboard.")


def _setup_cli(subparser: argparse.ArgumentParser) -> None:
    subs = subparser.add_subparsers(dest="cabinet_command")
    subs.add_parser("status", help="Show the cabinet score and quarter count")
    subparser.set_defaults(func=_run_cli)


def register(ctx: Any) -> None:
    """Hermes plugin entry point."""
    ctx.register_hook("pre_llm_call", on_pre_llm_call)
    ctx.register_command(
        "quarter",
        handler=on_quarter_command,
        description="Drop a quarter into the cabinet",
    )
    ctx.register_cli_command(
        name=CLI_NAME,
        help="Quarter cabinet status",
        setup_fn=_setup_cli,
        handler_fn=_run_cli,
        description="Show whether any quarters have hit the cabinet",
    )
