"""Dashboard routes for the quarter cabinet.

Mounted at ``/api/plugins/thought-we-wouldnt-notice/`` by the Hermes
dashboard. FastAPI comes with the dashboard process; this plugin does not
declare it as a Python dependency.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

_ROOT = Path(__file__).resolve().parents[1]
_STATE_FILE = _ROOT / "cabinet_state.py"
_STATE_MODULE = "twwwn_cabinet_state"
# Official 16:9 dashboard hero. Drop-in path: assets/banner.jpg at the plugin root.
# The 2:1 catalog cover lives beside it at assets/catalog.jpg.
BANNER_PATH = _ROOT / "assets" / "banner.jpg"


def _state():
    target = _STATE_FILE.resolve()
    for mod in list(sys.modules.values()):
        file = getattr(mod, "__file__", None)
        if not file or not hasattr(mod, "list_drops"):
            continue
        try:
            if Path(file).resolve() == target:
                return mod
        except OSError:
            continue
    cached = sys.modules.get(_STATE_MODULE)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(_STATE_MODULE, target)
    if spec is None or spec.loader is None:
        raise RuntimeError("cabinet state module is missing")
    module = importlib.util.module_from_spec(spec)
    sys.modules[_STATE_MODULE] = module
    spec.loader.exec_module(module)
    return module


@router.get("/drops")
async def get_drops(since: int = 0):
    """Drops newer than ``since``. The overlay polls this."""
    if since < 0:
        since = 0
    return _state().list_drops(since=since)


@router.post("/score")
async def post_score(body: dict = Body(...)):
    """Remember a high score when the run ends."""
    score = body.get("score", 0) if isinstance(body, dict) else 0
    return _state().submit_score(score)


def cabinet_popup_html() -> str:
    """Self-contained Top Sails page for the Desktop popup."""
    try:
        from cabinet_page import cabinet_popup_html as build
    except ImportError:
        from ..cabinet_page import cabinet_popup_html as build
    return build()


@router.get("/cabinet")
async def cabinet_page():
    """HTML document the Desktop half loads into a sandboxed frame."""
    return {"html": cabinet_popup_html()}


@router.get("/banner")
async def get_banner():
    """Official cabinet art at assets/banner.jpg. Served unchanged."""
    path = BANNER_PATH
    if not path.is_file():
        raise HTTPException(status_code=404, detail="assets/banner.jpg is not in the plugin yet")
    return FileResponse(path, media_type="image/jpeg", content_disposition_type="inline")
