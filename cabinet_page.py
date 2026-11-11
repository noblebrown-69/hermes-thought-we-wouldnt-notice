"""Self-contained Top Sails HTML for the Desktop popup and the /cabinet route."""

from pathlib import Path

_ROOT = Path(__file__).resolve().parent


def cabinet_popup_html() -> str:
    """Inline the cabinet script and style so a data URL does not need more fetches."""
    css = (_ROOT / "dashboard" / "dist" / "style.css").read_text(encoding="utf-8")
    script = (_ROOT / "dashboard" / "dist" / "index.js").read_text(encoding="utf-8")
    return (
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"/>"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>"
        f"<style>{css}</style></head><body class=\"twwwn-preview\">"
        "<div id=\"twwwn-standalone\" data-popup=\"1\"></div>"
        f"<script>{script}</script></body></html>"
    )
