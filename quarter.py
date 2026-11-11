"""Whole-message quarter detector.

A message matches only when it is essentially a quarter by itself.
Mid-sentence money talk is left alone so the agent still answers it.
"""

from __future__ import annotations

import re

NOTICE_LINE = "Thought we wouldn't notice. But we did."

_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\ufeff]")
_EDGE = set(" \t\"'`“”‘’()[]{}.,!?;:…")
_QUARTER = re.compile(
    r"(?i)^(?:"
    r"25\s*cents?"
    r"|25\s*c"
    r"|25\s*¢"
    r"|\$\s*\.25"
    r"|\$\s*0\.25"
    r"|0\.25"
    r"|insert\s+a\s+quarter"
    r"|insert\s+quarter"
    r"|one\s+quarter"
    r"|a\s+quarter"
    r"|quarter"
    r")$"
)
_MAX_LEN = 32


def message_text(user_message: object) -> str:
    """Flatten a user turn into text. Mixed non-text parts do not match."""
    if user_message is None:
        return ""
    if isinstance(user_message, str):
        return user_message
    if isinstance(user_message, (bytes, bytearray)):
        return ""
    if isinstance(user_message, list):
        parts: list[str] = []
        for item in user_message:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            else:
                return ""
        return "\n".join(parts)
    return ""


def normalize_quarter_text(text: str) -> str:
    """Strip wrappers and trailing punctuation. Empty means not a quarter."""
    cleaned = _ZERO_WIDTH.sub("", str(text)).replace("\u00a0", " ").strip()
    if not cleaned or any(ch in cleaned for ch in "\r\n"):
        return ""
    changed = True
    while changed and cleaned:
        changed = False
        if cleaned[0] in _EDGE:
            cleaned = cleaned[1:].strip()
            changed = True
        if cleaned and cleaned[-1] in _EDGE:
            cleaned = cleaned[:-1].strip()
            changed = True
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned or len(cleaned) > _MAX_LEN:
        return ""
    return cleaned


def is_quarter_message(text: object) -> bool:
    """True when the whole message is just a quarter, ignoring case and trim."""
    if not isinstance(text, str):
        text = message_text(text)
    normalized = normalize_quarter_text(text)
    if not normalized:
        return False
    return _QUARTER.fullmatch(normalized) is not None
