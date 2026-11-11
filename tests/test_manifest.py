"""Shipped files the installer and dashboard expect."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_manifest_matches_plugin_yaml():
    manifest = json.loads((ROOT / "dashboard" / "manifest.json").read_text(encoding="utf-8"))
    text = (ROOT / "plugin.yaml").read_text(encoding="utf-8")
    assert manifest["name"] == "thought-we-wouldnt-notice"
    assert manifest["version"] == "0.1.7"
    assert manifest["entry"] == "dist/index.js"
    assert manifest["css"] == "dist/style.css"
    assert manifest["api"] == "plugin_api.py"
    assert manifest["tab"]["path"] == "/thought-we-wouldnt-notice"
    assert "overlay" in manifest["slots"]
    assert "name: thought-we-wouldnt-notice" in text
    assert "version: 0.1.7" in text
    assert (ROOT / "desktop" / "plugin.js").is_file()
    assert (ROOT / "assets" / "banner.jpg").is_file()
    assert (ROOT / "assets" / "catalog.jpg").is_file()
    assert "python_dependencies: []" in text
    assert "platforms: []" in text
    assert "pre_llm_call" in text
    assert (ROOT / "dashboard" / "dist" / "index.js").is_file()
    assert (ROOT / "dashboard" / "dist" / "style.css").is_file()
    assert (ROOT / "dashboard" / "plugin_api.py").is_file()
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "testpaths = tests" in ini
    assert "--import-mode=importlib" in ini


def test_bundle_is_local_and_registers():
    js = (ROOT / "dashboard" / "dist" / "index.js").read_text(encoding="utf-8")
    css = (ROOT / "dashboard" / "dist" / "style.css").read_text(encoding="utf-8")
    assert "https://" not in js and "http://" not in js
    assert "https://" not in css and "http://" not in css
    assert 'plugins.register(PLUGIN, CabinetPage)' in js
    assert 'plugins.registerSlot(PLUGIN, "overlay", CabinetOverlay)' in js
    assert "INSERT QUARTER" in js
    assert "THOUGHT WE WOULDN'T NOTICE" in js
    assert "TOP SAILS" in js
    assert "Play Top Sails" in js
    assert "authedFetch" in js
    assert 'API + "/banner"' in js
    assert "MITE SHIFT" not in js
    assert "Mite Shift" not in js
    assert "eval(" not in js
    assert "new Function" not in js
    assert "twwwn-fit-slot" in js
    assert "fitCabinet" in js
    assert "twwwn-fit-slot" in css
    assert "twwwn-fit-inner" in css
    assert "box-sizing: border-box" in css
    assert "paddingLeft" in js
    assert "availW *= 0.98" in js



def test_plugin_api_routes_are_declared():
    source = (ROOT / "dashboard" / "plugin_api.py").read_text(encoding="utf-8")
    assert "APIRouter" in source
    assert "router = APIRouter()" in source
    assert '"/drops"' in source
    assert '"/score"' in source
    assert '"/banner"' in source
    assert "assets" in source and "banner.jpg" in source
