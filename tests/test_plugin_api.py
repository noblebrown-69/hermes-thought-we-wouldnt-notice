"""Dashboard routes, when FastAPI is installed (the dashboard always has it)."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from dashboard import plugin_api


def test_drop_then_score_roundtrip(cabinet_home):
    del cabinet_home
    app = fastapi.FastAPI()
    app.include_router(plugin_api.router, prefix="/api/plugins/thought-we-wouldnt-notice")
    client = TestClient(app)

    empty = client.get("/api/plugins/thought-we-wouldnt-notice/drops")
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    import cabinet_state

    cabinet_state.record_drop(session_id="dash", source="message")
    fresh = client.get("/api/plugins/thought-we-wouldnt-notice/drops", params={"since": 0})
    body = fresh.json()
    assert body["latest"] == 1
    assert body["drops"][0]["session_id"] == "dash"

    posted = client.post(
        "/api/plugins/thought-we-wouldnt-notice/score",
        json={"score": 1750},
    )
    assert posted.status_code == 200
    assert posted.json()["high_score"] == 1750
    again = client.get("/api/plugins/thought-we-wouldnt-notice/drops", params={"since": 1})
    assert again.json()["drops"] == []
    assert again.json()["high_score"] == 1750


def test_cabinet_page_is_the_popup_document():
    app = fastapi.FastAPI()
    app.include_router(plugin_api.router, prefix="/api/plugins/thought-we-wouldnt-notice")
    client = TestClient(app)
    response = client.get("/api/plugins/thought-we-wouldnt-notice/cabinet")
    assert response.status_code == 200
    html = response.json()["html"]
    assert 'data-popup="1"' in html
    assert "twwwn-close" in html
    assert "TOP SAILS" in html


def test_banner_route_serves_assets_banner_jpg_unchanged():
    from pathlib import Path

    banner = Path(__file__).resolve().parents[1] / "assets" / "banner.jpg"
    app = fastapi.FastAPI()
    app.include_router(plugin_api.router, prefix="/api/plugins/thought-we-wouldnt-notice")
    client = TestClient(app)
    response = client.get("/api/plugins/thought-we-wouldnt-notice/banner")
    if not banner.is_file():
        assert response.status_code == 404
        return
    raw = banner.read_bytes()
    assert raw[:2] == b"\xff\xd8"
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert response.content == raw
